import logging

# Configure logging
logging.basicConfig(
    filename='backend_errors.log',
    level=logging.ERROR,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

from fastapi import FastAPI, HTTPException, Request, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from dotenv import load_dotenv
import os
import snowflake.connector
from snowflake.connector.connection import SnowflakeConnection
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from pydantic import BaseModel
from typing import List, Optional
import datetime
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta, date
import asyncio
from functools import lru_cache
import unicodedata
import re

# Load environment variables from .env file
load_dotenv()

# Text normalization utility for accent-insensitive search
def normalize_text(text: str) -> str:
    """Remove diacritical marks (accents) from text for accent-insensitive search"""
    if not text:
        return ""
    # Decompose combined characters and remove diacritical marks
    normalized = unicodedata.normalize('NFD', text)
    return ''.join(char for char in normalized if unicodedata.category(char) != 'Mn').lower()

# Universal ID helper functions for mixed data sources
def get_player_universal_id(player_row):
    """Get the appropriate ID based on data source"""
    if player_row.get('DATA_SOURCE') == 'internal':
        return f"manual_{player_row['CAFC_PLAYER_ID']}"
    else:
        return f"external_{player_row['PLAYERID']}"

def get_match_universal_id(match_row):
    """Get the appropriate ID based on data source"""
    if match_row.get('DATA_SOURCE') == 'internal':
        return f"manual_{match_row['CAFC_MATCH_ID']}"
    else:
        return f"external_{match_row['ID']}"

def resolve_player_lookup(universal_id):
    """Convert universal ID to database query"""
    if universal_id.startswith('manual_'):
        cafc_id = int(universal_id[7:])
        return "CAFC_PLAYER_ID = %s AND DATA_SOURCE = 'internal'", [cafc_id]
    else:
        player_id = int(universal_id[9:])
        return "PLAYERID = %s AND DATA_SOURCE = 'external'", [player_id]

def resolve_match_lookup(universal_id):
    """Convert universal ID to database query"""
    if universal_id.startswith('manual_'):
        cafc_id = int(universal_id[7:])
        return "CAFC_MATCH_ID = %s AND DATA_SOURCE = 'internal'", [cafc_id]
    else:
        match_id = int(universal_id[9:])
        return "ID = %s AND DATA_SOURCE = 'external'", [match_id]

# Universal lookup functions for dual ID system
def find_player_by_any_id(player_id: int, cursor):
    """
    Find player by trying external ID first, then CAFC_PLAYER_ID
    Returns: (player_data, source) or (None, None) if not found
    """
    # Try external ID first (most common case)
    cursor.execute("""
        SELECT PLAYERID, CAFC_PLAYER_ID, PLAYERNAME, FIRSTNAME, LASTNAME,
               BIRTHDATE, SQUADNAME, POSITION, DATA_SOURCE
        FROM players
        WHERE PLAYERID = %s AND DATA_SOURCE = 'external'
    """, (player_id,))
    result = cursor.fetchone()

    if result:
        return result, 'external'

    # Try CAFC_PLAYER_ID (internal/manual records)
    cursor.execute("""
        SELECT PLAYERID, CAFC_PLAYER_ID, PLAYERNAME, FIRSTNAME, LASTNAME,
               BIRTHDATE, SQUADNAME, POSITION, DATA_SOURCE
        FROM players
        WHERE CAFC_PLAYER_ID = %s AND DATA_SOURCE = 'internal'
    """, (player_id,))
    result = cursor.fetchone()

    if result:
        return result, 'internal'

    return None, None

def find_match_by_any_id(match_id: int, cursor):
    """
    Find match by trying external ID first, then CAFC_MATCH_ID
    Returns: (match_data, source) or (None, None) if not found
    """
    # Try external ID first (most common case)
    cursor.execute("""
        SELECT ID, CAFC_MATCH_ID, HOMESQUADNAME, AWAYSQUADNAME,
               SCHEDULEDDATE, DATA_SOURCE
        FROM matches
        WHERE ID = %s AND DATA_SOURCE = 'external'
    """, (match_id,))
    result = cursor.fetchone()

    if result:
        return result, 'external'

    # Try CAFC_MATCH_ID (internal/manual records)
    cursor.execute("""
        SELECT ID, CAFC_MATCH_ID, HOMESQUADNAME, AWAYSQUADNAME,
               SCHEDULEDDATE, DATA_SOURCE
        FROM matches
        WHERE CAFC_MATCH_ID = %s AND DATA_SOURCE = 'internal'
    """, (match_id,))
    result = cursor.fetchone()

    if result:
        return result, 'internal'

    return None, None

app = FastAPI(
    title="CAFC Recruitment Platform API",
    description="Football recruitment platform with role-based access control",
    version="1.0.0"
)


@app.get("/health/snowflake")
async def test_snowflake_connection():
    """Test Snowflake connection for debugging"""
    import traceback
    try:
        print("Testing Snowflake connection...")
        conn = get_snowflake_connection()
        print("Connection established")
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        result = cursor.fetchone()
        conn.close()
        print("Connection test successful")
        return {"status": "success", "result": result[0]}
    except Exception as e:
        error_details = {
            "error_type": type(e).__name__,
            "error_message": str(e),
            "traceback": traceback.format_exc()
        }
        print(f"Snowflake connection failed: {error_details}")
        return {"status": "error", "error": error_details}

# Environment-based CORS configuration
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001,https://cafc-recruitment-platform.vercel.app").split(",")

# Debug logging for CORS configuration
print(f"=== CORS Configuration Debug ===")
print(f"Environment: {ENVIRONMENT}")
print(f"Raw CORS_ORIGINS env var: {os.getenv('CORS_ORIGINS', 'NOT SET - using defaults')}")
print(f"Parsed CORS Origins: {[origin.strip() for origin in CORS_ORIGINS]}")
print(f"===============================")

if ENVIRONMENT == "production":
    # Production CORS - more restrictive
    cors_origins = [origin.strip() for origin in CORS_ORIGINS]
    print(f"Production CORS enabled with origins: {cors_origins}")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
    )
else:
    # Development CORS - more permissive
    print("Development CORS enabled with localhost origins")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Snowflake Connection Configuration
SNOWFLAKE_ACCOUNT = os.getenv("SNOWFLAKE_ACCOUNT")
SNOWFLAKE_USERNAME = os.getenv("SNOWFLAKE_USERNAME")
SNOWFLAKE_PASSWORD = os.getenv("SNOWFLAKE_PASSWORD") # Keep for now, but won't be used with private key
SNOWFLAKE_WAREHOUSE = os.getenv("SNOWFLAKE_WAREHOUSE")
SNOWFLAKE_DATABASE = os.getenv("SNOWFLAKE_DATABASE")
SNOWFLAKE_SCHEMA = os.getenv("SNOWFLAKE_SCHEMA")
SNOWFLAKE_PRIVATE_KEY_PATH = os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH")

# Enhanced connection pool and caching
_connection_cache = {}
_data_cache = {}
_cache_expiry = {}

@lru_cache(maxsize=1)
def get_private_key():
    """Load private key from environment variable (production) or file (development)"""
    try:
        # In production, use environment variable
        if ENVIRONMENT == "production":
            private_key_content = os.getenv("SNOWFLAKE_PRIVATE_KEY")
            if not private_key_content:
                raise Exception("SNOWFLAKE_PRIVATE_KEY environment variable not set")
            
            p_key = serialization.load_pem_private_key(
                private_key_content.encode('utf-8'),
                password=None,
                backend=default_backend()
            )
        else:
            # In development, use file
            with open(SNOWFLAKE_PRIVATE_KEY_PATH, "rb") as key:
                p_key = serialization.load_pem_private_key(
                    key.read(),
                    password=None,
                    backend=default_backend()
                )
        
        return p_key.private_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Private key error: {e}")

def is_cache_valid(cache_key: str, expiry_minutes: int = 30) -> bool:
    """Check if cache entry is still valid"""
    if cache_key not in _cache_expiry:
        return False
    
    from datetime import datetime, timedelta
    return datetime.utcnow() < _cache_expiry[cache_key]

def set_cache(cache_key: str, data: any, expiry_minutes: int = 30):
    """Set cache entry with expiry time"""
    from datetime import datetime, timedelta
    _data_cache[cache_key] = data
    _cache_expiry[cache_key] = datetime.utcnow() + timedelta(minutes=expiry_minutes)

def get_cache(cache_key: str) -> any:
    """Get cache entry if valid"""
    if is_cache_valid(cache_key):
        return _data_cache[cache_key]
    return None

def get_snowflake_connection():
    """Optimized connection function using cached private key"""
    try:
        pkb = get_private_key()
        
        # SSL configuration for Railway deployment
        connect_params = {
            'user': SNOWFLAKE_USERNAME,
            'account': SNOWFLAKE_ACCOUNT,
            'warehouse': SNOWFLAKE_WAREHOUSE,
            'database': SNOWFLAKE_DATABASE,
            'schema': SNOWFLAKE_SCHEMA,
            'private_key': pkb,
            # Performance optimizations
            'client_session_keep_alive': True,
            'client_session_keep_alive_heartbeat_frequency': 3600,  # 1 hour
            'network_timeout': 60,
            'query_timeout': 300  # 5 minutes
        }
        
        # Disable SSL verification in Railway for certificate issues
        if ENVIRONMENT == "production":
            connect_params['insecure_mode'] = True
            
        conn = snowflake.connector.connect(**connect_params)
        return conn
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Snowflake connection error: {e}")

# --- Security Configuration ---
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- Pydantic Models ---
class User(BaseModel):
    id: int
    username: str
    role: str
    email: Optional[str] = None
    firstname: Optional[str] = None
    lastname: Optional[str] = None

class UserInDB(User):
    hashed_password: str

class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: Optional[str] = "scout"  # scout, manager, admin
    firstname: str
    lastname: str

class PasswordResetRequest(BaseModel):
    username: str
    email: str
    new_password: str

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class ScoutReport(BaseModel):
    player_id: int
    selectedMatch: Optional[int] = None
    playerPosition: str
    formation: Optional[str] = None
    playerBuild: str
    playerHeight: str
    scoutingType: Optional[str] = None
    purposeOfAssessment: Optional[str] = None
    performanceScore: Optional[int] = None
    assessmentSummary: str
    justificationRationale: Optional[str] = None
    strengths: Optional[List[str]] = None
    weaknesses: Optional[List[str]] = None
    attributeScores: Optional[dict] = None
    reportType: str
    flagCategory: Optional[str] = None

class Player(BaseModel):
    firstName: str
    lastName: str
    birthDate: Optional[str]
    squadName: str
    position: str

class Match(BaseModel):
    homeTeam: str
    awayTeam: str
    date: str

class IntelReport(BaseModel):
    player_id: int
    contact_name: str
    contact_organisation: str
    date_of_information: str
    confirmed_contract_expiry: Optional[str] = None
    contract_options: Optional[str] = None
    potential_deal_types: List[str]
    transfer_fee: Optional[str] = None
    current_wages: Optional[str] = None
    expected_wages: Optional[str] = None
    conversation_notes: str
    action_required: str

# --- User Database Operations ---
async def get_user(username: str):
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Check which columns exist
        try:
            cursor.execute("DESCRIBE TABLE users")
            columns = cursor.fetchall()
            column_names = [col[0] for col in columns]
            has_email = 'EMAIL' in column_names
            has_firstname = 'FIRSTNAME' in column_names
            has_lastname = 'LASTNAME' in column_names
        except:
            has_email = has_firstname = has_lastname = False
        
        # Build query based on available columns
        base_columns = "ID, USERNAME, HASHED_PASSWORD, ROLE"
        if has_email:
            base_columns += ", EMAIL"
        if has_firstname:
            base_columns += ", FIRSTNAME"
        if has_lastname:
            base_columns += ", LASTNAME"
            
        cursor.execute(f"SELECT {base_columns} FROM users WHERE USERNAME = %s", (username,))
        user_data = cursor.fetchone()
        if user_data:
            result = {
                'id': user_data[0],
                'username': user_data[1], 
                'hashed_password': user_data[2],
                'role': user_data[3],
                'email': user_data[4] if has_email else None,
                'firstname': user_data[5] if has_firstname and has_email else (user_data[4] if has_firstname and not has_email else None),
                'lastname': user_data[6] if has_firstname and has_lastname and has_email else (user_data[5] if has_firstname and has_lastname and not has_email else None)
            }
            return UserInDB(**result)
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching user: {e}")
    finally:
        if conn:
            conn.close()
    return None

async def get_user_by_email(email: str):
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Check if EMAIL column exists
        try:
            cursor.execute("DESCRIBE TABLE users")
            columns = cursor.fetchall()
            column_names = [col[0] for col in columns]
            has_email = 'EMAIL' in column_names
        except:
            has_email = False
        
        if not has_email:
            return None  # Can't find by email if column doesn't exist
            
        cursor.execute("SELECT ID, USERNAME, HASHED_PASSWORD, ROLE, EMAIL FROM users WHERE EMAIL = %s", (email,))
        user_data = cursor.fetchone()
        if user_data:
            return UserInDB(id=user_data[0], username=user_data[1], hashed_password=user_data[2], role=user_data[3], email=user_data[4])
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching user by email: {e}")
    finally:
        if conn:
            conn.close()
    return None

async def get_user_by_id(user_id: int):
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Check which columns exist
        try:
            cursor.execute("DESCRIBE TABLE users")
            columns = cursor.fetchall()
            column_names = [col[0] for col in columns]
            has_email = 'EMAIL' in column_names
            has_firstname = 'FIRSTNAME' in column_names
            has_lastname = 'LASTNAME' in column_names
        except:
            has_email = has_firstname = has_lastname = False
        
        # Build query based on available columns
        base_columns = "ID, USERNAME, HASHED_PASSWORD, ROLE"
        if has_email:
            base_columns += ", EMAIL"
        if has_firstname:
            base_columns += ", FIRSTNAME"
        if has_lastname:
            base_columns += ", LASTNAME"
            
        cursor.execute(f"SELECT {base_columns} FROM users WHERE ID = %s", (user_id,))
        user_data = cursor.fetchone()
        if user_data:
            result = {
                'id': user_data[0],
                'username': user_data[1], 
                'hashed_password': user_data[2],
                'role': user_data[3],
                'email': user_data[4] if has_email else None,
                'firstname': user_data[5] if has_firstname and has_email else (user_data[4] if has_firstname and not has_email else None),
                'lastname': user_data[6] if has_firstname and has_lastname and has_email else (user_data[5] if has_firstname and has_lastname and not has_email else None)
            }
            return UserInDB(**result)
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching user by ID: {e}")
    finally:
        if conn:
            conn.close()
    return None

# --- Authentication Endpoints ---
# Note: Public registration removed - only admins can create users

@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await get_user(form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role, "user_id": user.id},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        user_id: int = payload.get("user_id")
        user_role: str = payload.get("role")
        if username is None or user_id is None or user_role is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        raise credentials_exception
    user = await get_user(username)
    if user is None:
        raise credentials_exception
    return User(id=user.id, username=user.username, role=user.role, email=user.email, firstname=user.firstname, lastname=user.lastname)

@app.post("/auth/refresh", response_model=Token)
async def refresh_access_token(current_user: User = Depends(get_current_user)):
    """Refresh access token for authenticated users"""
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": current_user.username, "role": current_user.role, "user_id": current_user.id},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.get("/analytics/timeline")
async def get_analytics_timeline(current_user: User = Depends(get_current_user)):
    """Get timeline analytics data for scout reports by month and user"""
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()

        # Query to get timeline data grouped by month and user
        cursor.execute("""
            SELECT
                TO_CHAR(sr.CREATED_AT, 'YYYY-MM') as month,
                sr.SCOUTING_TYPE,
                COALESCE(u.USERNAME, 'Unknown Scout') as scout_name,
                COUNT(sr.ID) as report_count
            FROM scout_reports sr
            LEFT JOIN users u ON sr.USER_ID = u.ID
            WHERE sr.CREATED_AT >= DATEADD(month, -12, CURRENT_DATE())
            GROUP BY TO_CHAR(sr.CREATED_AT, 'YYYY-MM'), sr.SCOUTING_TYPE, u.USERNAME
            ORDER BY month ASC, scout_name ASC
        """)

        timeline_raw = cursor.fetchall()

        # Process the data into the expected format
        timeline_data = {}
        scout_totals = {}

        for row in timeline_raw:
            month, scouting_type, scout_name, report_count = row

            # Initialize month data if not exists
            if month not in timeline_data:
                timeline_data[month] = {
                    'month': month,
                    'totalReports': 0,
                    'liveReports': 0,
                    'videoReports': 0,
                    'scouts': {}
                }

            # Add to month totals
            timeline_data[month]['totalReports'] += report_count

            # Add to scouting type totals
            if scouting_type and scouting_type.upper() == 'LIVE':
                timeline_data[month]['liveReports'] += report_count
            else:
                timeline_data[month]['videoReports'] += report_count

            # Add to scout breakdown
            if scout_name not in timeline_data[month]['scouts']:
                timeline_data[month]['scouts'][scout_name] = 0
            timeline_data[month]['scouts'][scout_name] += report_count

            # Track scout totals
            if scout_name not in scout_totals:
                scout_totals[scout_name] = 0
            scout_totals[scout_name] += report_count

        # Sort timeline by month
        timeline_list = sorted(timeline_data.values(), key=lambda x: x['month'])

        # Get top scouts
        top_scouts = sorted(
            [{'name': name, 'reports': total} for name, total in scout_totals.items()],
            key=lambda x: x['reports'],
            reverse=True
        )[:10]

        return {
            "timeline": timeline_list,
            "totalScouts": len(scout_totals),
            "topScouts": top_scouts
        }

    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching timeline analytics: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/analytics/timeline-daily")
async def get_analytics_timeline_daily(
    days: int = 30,
    current_user: User = Depends(get_current_user)
):
    """Get daily timeline analytics data for scout reports"""
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Access denied. Admin or manager role required.")

    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()

        # Query to get timeline data grouped by day and user
        cursor.execute("""
            SELECT
                TO_CHAR(sr.CREATED_AT, 'YYYY-MM-DD') as day,
                sr.SCOUTING_TYPE,
                COALESCE(u.USERNAME, 'Unknown Scout') as scout_name,
                COUNT(sr.ID) as report_count
            FROM scout_reports sr
            LEFT JOIN users u ON sr.USER_ID = u.ID
            WHERE sr.CREATED_AT >= DATEADD(day, -%s, CURRENT_DATE())
            GROUP BY TO_CHAR(sr.CREATED_AT, 'YYYY-MM-DD'), sr.SCOUTING_TYPE, u.USERNAME
            ORDER BY day ASC, scout_name ASC
        """, (days,))

        timeline_raw = cursor.fetchall()

        # Process the data into the expected format
        timeline_data = {}
        scout_totals = {}

        for row in timeline_raw:
            day, scouting_type, scout_name, report_count = row

            # Initialize day data if not exists
            if day not in timeline_data:
                timeline_data[day] = {
                    'day': day,
                    'totalReports': 0,
                    'liveReports': 0,
                    'videoReports': 0,
                    'scouts': {}
                }

            # Add to day totals
            timeline_data[day]['totalReports'] += report_count

            # Add to scouting type totals
            if scouting_type and scouting_type.upper() == 'LIVE':
                timeline_data[day]['liveReports'] += report_count
            else:
                timeline_data[day]['videoReports'] += report_count

            # Add to scout breakdown
            if scout_name not in timeline_data[day]['scouts']:
                timeline_data[day]['scouts'][scout_name] = 0
            timeline_data[day]['scouts'][scout_name] += report_count

            # Track scout totals
            if scout_name not in scout_totals:
                scout_totals[scout_name] = 0
            scout_totals[scout_name] += report_count

        # Sort timeline by day
        timeline_list = sorted(timeline_data.values(), key=lambda x: x['day'])

        # Get top scouts
        top_scouts = sorted(
            [{'name': name, 'reports': total} for name, total in scout_totals.items()],
            key=lambda x: x['reports'],
            reverse=True
        )[:10]

        return {
            "timeline": timeline_list,
            "totalScouts": len(scout_totals),
            "topScouts": top_scouts
        }

    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching daily timeline analytics: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/debug/scout_reports")
async def debug_scout_reports(current_user: User = Depends(get_current_user)):
    """Debug endpoint to check scout reports and USER_ID data"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()

        # Check table structure
        cursor.execute("DESCRIBE TABLE scout_reports")
        columns = cursor.fetchall()
        column_names = [col[0] for col in columns]

        debug_info = {
            "table_columns": column_names,
            "has_user_id_column": 'USER_ID' in column_names
        }

        if 'USER_ID' in column_names:
            # Check USER_ID data quality
            cursor.execute("SELECT COUNT(*) FROM scout_reports")
            total_reports = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM scout_reports WHERE USER_ID IS NOT NULL")
            reports_with_user_id = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM scout_reports WHERE USER_ID IS NULL")
            reports_without_user_id = cursor.fetchone()[0]

            # Get sample of USER_ID values
            cursor.execute("SELECT DISTINCT USER_ID FROM scout_reports WHERE USER_ID IS NOT NULL LIMIT 10")
            sample_user_ids = [row[0] for row in cursor.fetchall()]

            # Check users table for comparison
            cursor.execute("SELECT ID, USERNAME, ROLE FROM users ORDER BY ID")
            all_users = [{"id": row[0], "username": row[1], "role": row[2]} for row in cursor.fetchall()]

            debug_info.update({
                "total_reports": total_reports,
                "reports_with_user_id": reports_with_user_id,
                "reports_without_user_id": reports_without_user_id,
                "sample_user_ids_in_reports": sample_user_ids,
                "all_users": all_users
            })

        return debug_info

    except Exception as e:
        return {"error": str(e), "type": type(e).__name__}
    finally:
        if conn:
            conn.close()

@app.post("/reset-password")
async def reset_password(request: PasswordResetRequest):
    """Reset password using username and email verification"""
    # Find user by username
    user = await get_user(request.username)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid username or email")
    
    # If email column doesn't exist, we can't verify email
    if user.email is None:
        raise HTTPException(status_code=400, detail="Email verification not available. Please contact admin.")
    
    # Verify email matches
    if user.email.lower() != request.email.lower():
        raise HTTPException(status_code=400, detail="Invalid username or email")
    
    # Update password
    new_hashed_password = get_password_hash(request.new_password)
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET HASHED_PASSWORD = %s WHERE ID = %s", 
                      (new_hashed_password, user.id))
        conn.commit()
        
        return {"message": "Password reset successfully"}
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error resetting password: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/change-password")
async def change_password(request: PasswordChange, current_user: User = Depends(get_current_user)):
    """Change password for authenticated user"""
    # Verify current password
    user_in_db = await get_user(current_user.username)
    if not user_in_db or not verify_password(request.current_password, user_in_db.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Update password
    new_hashed_password = get_password_hash(request.new_password)
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET HASHED_PASSWORD = %s WHERE ID = %s", 
                      (new_hashed_password, current_user.id))
        conn.commit()
        
        return {"message": "Password changed successfully"}
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error changing password: {e}")
    finally:
        if conn:
            conn.close()

# --- Admin User Management Endpoints ---
class AdminUserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: str  # admin, scout, manager
    firstname: str
    lastname: str

@app.get("/admin/users")
async def get_all_users(current_user: User = Depends(get_current_user)):
    """Get all users (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Check which columns exist
        try:
            cursor.execute("DESCRIBE TABLE users")
            columns = cursor.fetchall()
            column_names = [col[0] for col in columns]
            has_email = 'EMAIL' in column_names
            has_firstname = 'FIRSTNAME' in column_names
            has_lastname = 'LASTNAME' in column_names
        except:
            has_email = has_firstname = has_lastname = False
        
        # Build query based on available columns
        base_columns = "ID, USERNAME, ROLE"
        if has_email:
            base_columns += ", EMAIL"
        if has_firstname:
            base_columns += ", FIRSTNAME"
        if has_lastname:
            base_columns += ", LASTNAME"
            
        cursor.execute(f"SELECT {base_columns} FROM users ORDER BY USERNAME")
        users = cursor.fetchall()
        
        user_list = []
        for row in users:
            user_data = {
                "id": row[0],
                "username": row[1],
                "role": row[2],
                "email": "No email",
                "firstname": "",
                "lastname": ""
            }
            
            # Map columns based on what exists
            col_index = 3
            if has_email:
                user_data["email"] = row[col_index] if row[col_index] else "No email"
                col_index += 1
            if has_firstname:
                user_data["firstname"] = row[col_index] if row[col_index] else ""
                col_index += 1
            if has_lastname:
                user_data["lastname"] = row[col_index] if row[col_index] else ""
                
            user_list.append(user_data)
        
        return {"users": user_list}
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching users: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/admin/users", response_model=User)
async def create_user_as_admin(user: AdminUserCreate, current_user: User = Depends(get_current_user)):
    """Create a new user (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Check if username exists
    existing_user = await get_user(user.username)
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Check if email exists
    existing_email = await get_user_by_email(user.email)
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already exists")
    
    hashed_password = get_password_hash(user.password)
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Check which columns exist and add missing ones
        try:
            cursor.execute("DESCRIBE TABLE users")
            columns = cursor.fetchall()
            column_names = [col[0] for col in columns]
            
            if 'EMAIL' not in column_names:
                cursor.execute("ALTER TABLE users ADD COLUMN EMAIL VARCHAR(255)")
                conn.commit()
            if 'FIRSTNAME' not in column_names:
                cursor.execute("ALTER TABLE users ADD COLUMN FIRSTNAME VARCHAR(255)")
                conn.commit()
            if 'LASTNAME' not in column_names:
                cursor.execute("ALTER TABLE users ADD COLUMN LASTNAME VARCHAR(255)")
                conn.commit()
        except Exception as e:
            logging.warning(f"Could not add columns: {e}")
        
        sql = "INSERT INTO users (USERNAME, EMAIL, HASHED_PASSWORD, ROLE, FIRSTNAME, LASTNAME) VALUES (%s, %s, %s, %s, %s, %s)"
        cursor.execute(sql, (user.username, user.email, hashed_password, user.role, user.firstname, user.lastname))
        conn.commit()
        
        # Fetch the newly created user
        new_user_data = await get_user(user.username)
        if not new_user_data:
            raise HTTPException(status_code=500, detail="Failed to retrieve new user after creation")
        
        return User(id=new_user_data.id, username=new_user_data.username, role=new_user_data.role, email=new_user_data.email, firstname=new_user_data.firstname, lastname=new_user_data.lastname)
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error creating user: {e}")
    finally:
        if conn:
            conn.close()

@app.delete("/admin/users/{user_id}")
async def delete_user(user_id: int, current_user: User = Depends(get_current_user)):
    """Delete a user (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Check if user exists
        cursor.execute("SELECT USERNAME FROM users WHERE ID = %s", (user_id,))
        user_data = cursor.fetchone()
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")
        
        username = user_data[0]
        
        # Delete the user
        cursor.execute("DELETE FROM users WHERE ID = %s", (user_id,))
        conn.commit()
        
        return {"message": f"User '{username}' deleted successfully"}
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error deleting user: {e}")
    finally:
        if conn:
            conn.close()

@app.put("/admin/users/{user_id}/role")
async def update_user_role(user_id: int, new_role: str, current_user: User = Depends(get_current_user)):
    """Update user role (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if new_role not in ["admin", "scout", "manager"]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be admin, scout, or manager")
    
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Check if user exists
        cursor.execute("SELECT USERNAME FROM users WHERE ID = %s", (user_id,))
        user_data = cursor.fetchone()
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")
        
        username = user_data[0]
        
        # Update role
        cursor.execute("UPDATE users SET ROLE = %s WHERE ID = %s", (new_role, user_id))
        conn.commit()
        
        return {"message": f"User '{username}' role updated to '{new_role}'"}
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error updating user role: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/admin/users/{user_id}/reset-password")
async def admin_reset_user_password(user_id: int, new_password: str, current_user: User = Depends(get_current_user)):
    """Reset user password (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Check if user exists
        cursor.execute("SELECT USERNAME FROM users WHERE ID = %s", (user_id,))
        user_data = cursor.fetchone()
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")
        
        username = user_data[0]
        
        # Update password
        hashed_password = get_password_hash(new_password)
        cursor.execute("UPDATE users SET HASHED_PASSWORD = %s WHERE ID = %s", (hashed_password, user_id))
        conn.commit()
        
        return {"message": f"Password reset for user '{username}'"}
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error resetting password: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/admin/add-email-column")
async def add_email_column_to_users(current_user: User = Depends(get_current_user)):
    """Add EMAIL column to users table (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Check if EMAIL column already exists
        cursor.execute("DESCRIBE TABLE users")
        columns = cursor.fetchall()
        column_names = [col[0] for col in columns]
        
        if 'EMAIL' in column_names:
            return {"message": "EMAIL column already exists"}
        
        # Add EMAIL column
        cursor.execute("ALTER TABLE users ADD COLUMN EMAIL VARCHAR(255)")
        conn.commit()
        
        return {"message": "EMAIL column added successfully"}
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error adding EMAIL column: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/admin/cafc-system-status")
async def get_cafc_system_status(current_user: User = Depends(get_current_user)):
    """Check CAFC Player ID system status (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Check if CAFC_PLAYER_ID exists in players table
        cursor.execute("DESCRIBE TABLE players")
        players_columns = cursor.fetchall()
        players_column_names = [col[0] for col in players_columns]
        has_cafc_system = 'CAFC_PLAYER_ID' in players_column_names
        
        stats = {"has_cafc_system": has_cafc_system}
        
        if has_cafc_system:
            # Count players with CAFC IDs
            cursor.execute("SELECT COUNT(*) FROM players WHERE CAFC_PLAYER_ID IS NOT NULL")
            stats["players_with_cafc_id"] = cursor.fetchone()[0]
            
            # Count scout reports using CAFC IDs
            try:
                cursor.execute("SELECT COUNT(*) FROM scout_reports WHERE CAFC_PLAYER_ID IS NOT NULL")
                stats["scout_reports_migrated"] = cursor.fetchone()[0]
            except:
                stats["scout_reports_migrated"] = 0
                
            # Count orphaned scout reports
            try:
                cursor.execute("""
                    SELECT COUNT(*) FROM scout_reports sr 
                    WHERE sr.CAFC_PLAYER_ID IS NULL 
                    AND sr.PLAYER_ID IS NOT NULL
                """)
                stats["orphaned_scout_reports"] = cursor.fetchone()[0]
            except:
                stats["orphaned_scout_reports"] = 0
        
        return stats
        
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error checking CAFC system status: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/admin/setup-cafc-player-ids")
async def setup_cafc_player_ids(current_user: User = Depends(get_current_user)):
    """Add CAFC_PLAYER_ID system for data provider independence (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        results = []
        
        # 1. Add CAFC_PLAYER_ID to players table if it doesn't exist
        cursor.execute("DESCRIBE TABLE players")
        players_columns = cursor.fetchall()
        players_column_names = [col[0] for col in players_columns]
        
        if 'CAFC_PLAYER_ID' not in players_column_names:
            # Use IDENTITY for auto-increment in Snowflake
            cursor.execute("ALTER TABLE players ADD COLUMN CAFC_PLAYER_ID INTEGER IDENTITY(1,1)")
            conn.commit()
            results.append("Added CAFC_PLAYER_ID column to players table")
            
            # Generate CAFC_PLAYER_IDs for existing players
            cursor.execute("SELECT PLAYERID FROM players WHERE CAFC_PLAYER_ID IS NULL ORDER BY PLAYERID")
            existing_players = cursor.fetchall()
            
            for i, player in enumerate(existing_players, 1):
                cursor.execute("UPDATE players SET CAFC_PLAYER_ID = %s WHERE PLAYERID = %s", (i, player[0]))
            
            conn.commit()
            results.append(f"Generated CAFC_PLAYER_IDs for {len(existing_players)} existing players")
        else:
            results.append("CAFC_PLAYER_ID column already exists in players table")
        
        # 2. Update scout_reports to use CAFC_PLAYER_ID
        try:
            cursor.execute("DESCRIBE TABLE scout_reports")
            scout_columns = cursor.fetchall()
            scout_column_names = [col[0] for col in scout_columns]
            
            if 'CAFC_PLAYER_ID' not in scout_column_names:
                cursor.execute("ALTER TABLE scout_reports ADD COLUMN CAFC_PLAYER_ID INTEGER")
                conn.commit()
                results.append("Added CAFC_PLAYER_ID column to scout_reports table")
                
                # Migrate existing data if both columns exist
                cursor.execute("""
                    UPDATE scout_reports sr
                    SET CAFC_PLAYER_ID = (
                        SELECT p.CAFC_PLAYER_ID 
                        FROM players p 
                        WHERE p.PLAYERID = sr.PLAYER_ID
                    )
                    WHERE sr.PLAYER_ID IS NOT NULL
                """)
                conn.commit()
                results.append("Migrated existing scout_reports to use CAFC_PLAYER_ID")
            else:
                results.append("CAFC_PLAYER_ID column already exists in scout_reports table")
        except Exception as e:
            results.append(f"Scout reports table update: {str(e)}")
        
        # 3. Update player_information (intel reports) to use CAFC_PLAYER_ID
        try:
            cursor.execute("DESCRIBE TABLE player_information")
            intel_columns = cursor.fetchall()
            intel_column_names = [col[0] for col in intel_columns]
            
            if 'CAFC_PLAYER_ID' not in intel_column_names:
                cursor.execute("ALTER TABLE player_information ADD COLUMN CAFC_PLAYER_ID INTEGER")
                conn.commit()
                results.append("Added CAFC_PLAYER_ID column to player_information table")
                
                # Migrate existing data if both columns exist
                if 'PLAYER_ID' in intel_column_names:
                    cursor.execute("""
                        UPDATE player_information pi
                        SET CAFC_PLAYER_ID = (
                            SELECT p.CAFC_PLAYER_ID 
                            FROM players p 
                            WHERE p.PLAYERID = pi.PLAYER_ID
                        )
                        WHERE pi.PLAYER_ID IS NOT NULL
                    """)
                    conn.commit()
                    results.append("Migrated existing player_information to use CAFC_PLAYER_ID")
            else:
                results.append("CAFC_PLAYER_ID column already exists in player_information table")
        except Exception as e:
            results.append(f"Player information table update: {str(e)}")
        
        # 4. Update player_notes to use CAFC_PLAYER_ID
        try:
            cursor.execute("DESCRIBE TABLE player_notes")
            notes_columns = cursor.fetchall()
            notes_column_names = [col[0] for col in notes_columns]
            
            if 'CAFC_PLAYER_ID' not in notes_column_names:
                cursor.execute("ALTER TABLE player_notes ADD COLUMN CAFC_PLAYER_ID INTEGER")
                conn.commit()
                results.append("Added CAFC_PLAYER_ID column to player_notes table")
                
                # Migrate existing data
                cursor.execute("""
                    UPDATE player_notes pn
                    SET CAFC_PLAYER_ID = (
                        SELECT p.CAFC_PLAYER_ID 
                        FROM players p 
                        WHERE p.PLAYERID = pn.PLAYER_ID
                    )
                    WHERE pn.PLAYER_ID IS NOT NULL
                """)
                conn.commit()
                results.append("Migrated existing player_notes to use CAFC_PLAYER_ID")
            else:
                results.append("CAFC_PLAYER_ID column already exists in player_notes table")
        except Exception as e:
            results.append(f"Player notes table update: {str(e)}")
        
        return {
            "message": "CAFC Player ID system setup completed",
            "results": results
        }
        
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error setting up CAFC Player IDs: {e}")
    finally:
        if conn:
            conn.close()


# --- Modified Endpoints with Authorization ---
@app.get("/admin/player-safety-check/{player_id}")
async def check_player_deletion_safety(player_id: int, current_user: User = Depends(get_current_user)):
    """Check if a player can be safely deleted (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Get player info
        cursor.execute("SELECT CAFC_PLAYER_ID, PLAYERNAME FROM players WHERE PLAYERID = %s", (player_id,))
        player_data = cursor.fetchone()
        if not player_data:
            raise HTTPException(status_code=404, detail="Player not found")
        
        cafc_player_id, player_name = player_data
        
        # Check for dependencies
        dependencies = {}
        
        # Scout reports
        cursor.execute("SELECT COUNT(*) FROM scout_reports WHERE CAFC_PLAYER_ID = %s OR PLAYER_ID = %s", 
                      (cafc_player_id, player_id))
        dependencies["scout_reports"] = cursor.fetchone()[0]
        
        # Intel reports
        try:
            cursor.execute("SELECT COUNT(*) FROM player_information WHERE CAFC_PLAYER_ID = %s OR PLAYER_ID = %s", 
                          (cafc_player_id, player_id))
            dependencies["intel_reports"] = cursor.fetchone()[0]
        except:
            dependencies["intel_reports"] = 0
            
        # Player notes
        try:
            cursor.execute("SELECT COUNT(*) FROM player_notes WHERE CAFC_PLAYER_ID = %s OR PLAYER_ID = %s", 
                          (cafc_player_id, player_id))
            dependencies["player_notes"] = cursor.fetchone()[0]
        except:
            dependencies["player_notes"] = 0
        
        total_dependencies = sum(dependencies.values())
        
        return {
            "player_id": player_id,
            "cafc_player_id": cafc_player_id,
            "player_name": player_name,
            "dependencies": dependencies,
            "total_dependencies": total_dependencies,
            "safe_to_delete": total_dependencies == 0,
            "warning": "This player has associated data that will be lost!" if total_dependencies > 0 else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error checking player safety: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/admin/merge-players")
async def merge_players(
    keep_cafc_id: int, 
    remove_player_id: int, 
    current_user: User = Depends(get_current_user)
):
    """Merge a removed player back to existing CAFC_PLAYER_ID (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Verify the CAFC_PLAYER_ID exists
        cursor.execute("SELECT PLAYERNAME FROM players WHERE CAFC_PLAYER_ID = %s", (keep_cafc_id,))
        existing_player = cursor.fetchone()
        if not existing_player:
            raise HTTPException(status_code=404, detail="Target CAFC_PLAYER_ID not found")
        
        results = []
        
        # Update scout reports
        cursor.execute("""
            UPDATE scout_reports 
            SET CAFC_PLAYER_ID = %s 
            WHERE PLAYER_ID = %s AND CAFC_PLAYER_ID IS NULL
        """, (keep_cafc_id, remove_player_id))
        scout_updated = cursor.rowcount
        results.append(f"Updated {scout_updated} scout reports")
        
        # Update intel reports
        try:
            cursor.execute("""
                UPDATE player_information 
                SET CAFC_PLAYER_ID = %s 
                WHERE PLAYER_ID = %s AND CAFC_PLAYER_ID IS NULL
            """, (keep_cafc_id, remove_player_id))
            intel_updated = cursor.rowcount
            results.append(f"Updated {intel_updated} intel reports")
        except:
            results.append("Intel reports table not found or no updates needed")
        
        # Update player notes
        try:
            cursor.execute("""
                UPDATE player_notes 
                SET CAFC_PLAYER_ID = %s 
                WHERE PLAYER_ID = %s AND CAFC_PLAYER_ID IS NULL
            """, (keep_cafc_id, remove_player_id))
            notes_updated = cursor.rowcount
            results.append(f"Updated {notes_updated} player notes")
        except:
            results.append("Player notes table not found or no updates needed")
        
        conn.commit()
        
        return {
            "message": f"Successfully merged player data to CAFC_PLAYER_ID {keep_cafc_id}",
            "target_player": existing_player[0],
            "results": results
        }
        
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error merging players: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/players")
async def add_player(player: Player, current_user: User = Depends(get_current_user)):
    """Add a manual player to the database with separate ID system"""
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()

        # Create combined player name from first and last name
        player_name = f"{player.firstName} {player.lastName}".strip()

        # Check for duplicate players by name and team (across both manual and external)
        cursor.execute("""
            SELECT CAFC_PLAYER_ID, PLAYERID, PLAYERNAME, DATA_SOURCE FROM players
            WHERE PLAYERNAME = %s AND SQUADNAME = %s
        """, (player_name, player.squadName))
        existing = cursor.fetchone()

        if existing:
            cafc_id, external_id, name, data_source = existing
            universal_id = get_player_universal_id({
                'CAFC_PLAYER_ID': cafc_id,
                'PLAYERID': external_id,
                'DATA_SOURCE': data_source
            })
            return {
                "message": "Player already exists",
                "existing_player": {
                    "cafc_player_id": cafc_id,
                    "external_player_id": external_id,
                    "player_name": name,
                    "data_source": data_source,
                    "universal_id": universal_id
                },
                "note": f"Use existing {data_source} player with universal ID: {universal_id}"
            }

        # Get next CAFC ID for manual player using sequence
        cursor.execute("SELECT manual_player_seq.NEXTVAL")
        cafc_player_id = cursor.fetchone()[0]

        # Insert manual player with CAFC_PLAYER_ID, PLAYERID stays NULL
        sql = """
            INSERT INTO players (
                FIRSTNAME, LASTNAME, PLAYERNAME, BIRTHDATE, SQUADNAME, POSITION,
                CAFC_PLAYER_ID, DATA_SOURCE
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        # Parse birth date string to date object
        birth_date_obj = None
        if player.birthDate:
            try:
                from datetime import datetime
                birth_date_obj = datetime.strptime(player.birthDate, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid birth date format. Use YYYY-MM-DD")

        values = (
            player.firstName,
            player.lastName,
            player_name,
            birth_date_obj,
            player.squadName,
            player.position,
            cafc_player_id,
            'internal'
        )
        cursor.execute(sql, values)
        conn.commit()

        universal_id = f"internal_{cafc_player_id}"

        return {
            "message": "Internal player added successfully",
            "player": player,
            "cafc_player_id": cafc_player_id,
            "universal_id": universal_id,
            "data_source": "internal",
            "note": "This player has a separate ID space from external players - zero collision risk"
        }
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error adding manual player: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/players/by-cafc-id/{cafc_player_id}")
async def get_player_by_cafc_id(cafc_player_id: int, current_user: User = Depends(get_current_user)):
    """Get player by CAFC Player ID (internal stable ID)"""
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Check if CAFC_PLAYER_ID column exists
        cursor.execute("DESCRIBE TABLE players")
        columns = cursor.fetchall()
        column_names = [col[0] for col in columns]
        has_cafc_id = 'CAFC_PLAYER_ID' in column_names
        
        if not has_cafc_id:
            raise HTTPException(status_code=400, detail="CAFC Player ID system not set up yet. Contact admin.")
        
        # Get player by CAFC_PLAYER_ID
        cursor.execute("""
            SELECT CAFC_PLAYER_ID, PLAYERID, FIRSTNAME, LASTNAME, PLAYERNAME, 
                   BIRTHDATE, SQUADNAME, POSITION
            FROM players 
            WHERE CAFC_PLAYER_ID = %s
        """, (cafc_player_id,))
        
        player_data = cursor.fetchone()
        if not player_data:
            raise HTTPException(status_code=404, detail="Player not found")
        
        return {
            "cafc_player_id": player_data[0],
            "external_player_id": player_data[1],  # Data provider ID
            "firstName": player_data[2],
            "lastName": player_data[3],
            "playerName": player_data[4],
            "birthDate": player_data[5],
            "squadName": player_data[6],
            "position": player_data[7]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching player: {e}")
    finally:
        if conn:
            conn.close()


@app.get("/")
async def read_root():
    return {"message": "Welcome to the Football Recruitment Platform API"}

@app.get("/players/search")
async def search_players(query: str, current_user: User = Depends(get_current_user)):
    """Search players with support for CAFC_PLAYER_ID system and accent-insensitive matching"""
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Check if CAFC_PLAYER_ID column exists
        cursor.execute("DESCRIBE TABLE players")
        columns = cursor.fetchall()
        column_names = [col[0] for col in columns]
        has_cafc_id = 'CAFC_PLAYER_ID' in column_names
        
        # For accent-insensitive search, we'll search with a broader database query
        # then apply precise client-side filtering
        normalized_query = normalize_text(query).strip()
        
        if not normalized_query:
            return []
        
        # Create multiple search patterns to catch accent variations
        # We need to be much more aggressive about catching accent variations
        # since ILIKE doesn't handle accents automatically
        
        # Strategy: Get a broader set from the database, then filter client-side with proper accent handling
        # This is more reliable than trying to predict all accent combinations in SQL
        
        # For single word queries like "Oscar", search for any name containing that pattern
        # For multi-word queries like "Oscar Gil", search for names containing any of those words
        
        query_words = query.strip().split()
        search_patterns = []
        
        # Add the original query and normalized version
        search_patterns.append(f'%{query}%')
        search_patterns.append(f'%{normalized_query}%')
        
        # For each word in the query, add patterns to catch it
        for word in query_words:
            if len(word) >= 2:  # Avoid single character searches
                normalized_word = normalize_text(word)
                search_patterns.append(f'%{word}%')
                search_patterns.append(f'%{normalized_word}%')
                
                # Add common accent variations for better database matching
                if normalized_word == 'oscar':
                    search_patterns.extend([
                        '%Óscar%', '%óscar%', '%Òscar%', '%òscar%',
                        '%Ôscar%', '%ôscar%', '%Õscar%', '%õscar%'
                    ])
                elif normalized_word == 'jose':
                    search_patterns.extend([
                        '%José%', '%josé%', '%Josè%', '%josè%'
                    ])
                # Add more common name variations as needed
        
        # Build the WHERE clause with multiple ILIKE conditions
        where_conditions = ' OR '.join(['PLAYERNAME ILIKE %s'] * len(search_patterns))
        
        if has_cafc_id:
            cursor.execute(f"""
                SELECT CAFC_PLAYER_ID, PLAYERID, PLAYERNAME, POSITION, SQUADNAME, DATA_SOURCE
                FROM players
                WHERE {where_conditions}
                ORDER BY PLAYERNAME
            """, search_patterns)
        else:
            cursor.execute(f"""
                SELECT NULL as CAFC_PLAYER_ID, PLAYERID, PLAYERNAME, POSITION, SQUADNAME, 'external' as DATA_SOURCE
                FROM players
                WHERE {where_conditions}
                ORDER BY PLAYERNAME
            """, search_patterns)
            
        players = cursor.fetchall()
        player_list = []
        
        # Apply precise accent-insensitive filtering on the results
        for row in players:
            player_name = row[2]
            if player_name:
                normalized_player_name = normalize_text(player_name)
                # Check if the normalized query matches the normalized player name
                if normalized_query in normalized_player_name:
                    # Generate universal_id using the helper function
                    player_row = {
                        'CAFC_PLAYER_ID': row[0],
                        'PLAYERID': row[1],
                        'DATA_SOURCE': row[5]
                    }
                    universal_id = get_player_universal_id(player_row)

                    player_data = {
                        "player_id": row[1],  # External player ID (backwards compatibility)
                        "cafc_player_id": row[0],  # Internal stable ID (None if not set up)
                        "universal_id": universal_id,  # New universal ID format
                        "player_name": player_name,
                        "position": row[3],
                        "squad_name": row[4],
                        "data_source": row[5]
                    }
                    player_list.append(player_data)
        
        # Sort by normalized name for better accent-insensitive ordering
        player_list.sort(key=lambda x: normalize_text(x["player_name"]))
            
        return player_list
        
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error searching players: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/scout_reports")
async def create_scout_report(report: ScoutReport, request: Request, current_user: User = Depends(get_current_user)):
    print(f"🔍 DEBUG: Scout report creation started")
    print(f"🔍 DEBUG: player_id={report.player_id}, reportType={report.reportType}")

    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        conn.autocommit = False

        report_type = report.reportType

        # Prepare common fields
        player_id = report.player_id
        print(f"🔍 DEBUG: About to validate player_id={player_id}")
        position = report.playerPosition
        build = report.playerBuild
        height = report.playerHeight
        summary = report.assessmentSummary
        scouting_type = report.scoutingType
        performance_score = report.performanceScore
        strengths = ', '.join(report.strengths) if report.strengths else None
        weaknesses = ', '.join(report.weaknesses) if report.weaknesses else None
        
        # Initialize fields that might be null
        justification_rationale = None
        attribute_score = None
        purpose_of_assessment = None
        flag_category = None
        match_id = None
        formation = None

        if report_type == 'Player Assessment':
            justification_rationale = report.justificationRationale
            purpose_of_assessment = report.purposeOfAssessment
            match_id = report.selectedMatch
            formation = report.formation
            if report.attributeScores:
                attribute_score = sum(report.attributeScores.values())
            
        elif report_type == 'Flag':
            flag_category = report.flagCategory
            match_id = report.selectedMatch
            
        elif report_type == 'Clips':
            pass # All relevant fields are already prepared or optional

        # Validate and resolve player_id using dual ID lookup
        if player_id:
            print(f"🔍 DEBUG: Validating player_id={player_id}")
            player_data, player_data_source = find_player_by_any_id(player_id, cursor)
            print(f"🔍 DEBUG: Player lookup result: player_data={player_data}, source={player_data_source}")
            if not player_data:
                print(f"❌ DEBUG: Player with ID {player_id} not found!")
                raise HTTPException(status_code=404, detail=f"Player with ID {player_id} not found")
            # Use the actual database player ID for the insert
            actual_player_id = player_data[0] if player_data_source == 'external' else player_data[1]
            print(f"🔍 DEBUG: Using actual_player_id={actual_player_id} for database insert")
        else:
            actual_player_id = None
            print(f"🔍 DEBUG: No player_id provided")

        # Validate and resolve match_id using dual ID lookup if provided
        actual_match_id = None
        if match_id:
            match_data, match_data_source = find_match_by_any_id(match_id, cursor)
            if not match_data:
                raise HTTPException(status_code=404, detail=f"Match with ID {match_id} not found")
            # Use the actual database match ID for the insert
            actual_match_id = match_data[0] if match_data_source == 'external' else match_data[1]

        # Try to insert with USER_ID first, fallback to without USER_ID if column doesn't exist
        try:
            sql = """
                INSERT INTO scout_reports (
                    PLAYER_ID, POSITION, BUILD, HEIGHT, STRENGTHS, WEAKNESSES, 
                    SUMMARY, JUSTIFICATION, ATTRIBUTE_SCORE, PERFORMANCE_SCORE, 
                    PURPOSE, SCOUTING_TYPE, FLAG_CATEGORY, REPORT_TYPE, MATCH_ID, FORMATION, USER_ID
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            
            values = (
                actual_player_id,
                position,
                build,
                height,
                strengths,
                weaknesses,
                summary,
                justification_rationale,
                attribute_score,
                performance_score,
                purpose_of_assessment,
                scouting_type,
                flag_category,
                report_type,
                actual_match_id,
                formation,
                current_user.id
            )
            cursor.execute(sql, values)
            use_user_id = True
        except Exception as e:
            # If USER_ID column doesn't exist, use the old query
            if "invalid identifier 'USER_ID'" in str(e) or "USER_ID" in str(e):
                sql = """
                    INSERT INTO scout_reports (
                        PLAYER_ID, POSITION, BUILD, HEIGHT, STRENGTHS, WEAKNESSES, 
                        SUMMARY, JUSTIFICATION, ATTRIBUTE_SCORE, PERFORMANCE_SCORE, 
                        PURPOSE, SCOUTING_TYPE, FLAG_CATEGORY, REPORT_TYPE, MATCH_ID, FORMATION
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """
                
                values = (
                    actual_player_id,
                    position,
                    build,
                    height,
                    strengths,
                    weaknesses,
                    summary,
                    justification_rationale,
                    attribute_score,
                    performance_score,
                    purpose_of_assessment,
                    scouting_type,
                    flag_category,
                    report_type,
                    actual_match_id,
                    formation
                )
                cursor.execute(sql, values)
                use_user_id = False
            else:
                raise e
        
        # Get the ID of the report just inserted
        if use_user_id:
            cursor.execute(
                "SELECT ID FROM scout_reports WHERE PLAYER_ID = %s AND USER_ID = %s AND SUMMARY = %s AND REPORT_TYPE = %s ORDER BY CREATED_AT DESC LIMIT 1",
                (player_id, current_user.id, summary, report_type)
            )
        else:
            cursor.execute(
                "SELECT ID FROM scout_reports WHERE PLAYER_ID = %s AND SUMMARY = %s AND REPORT_TYPE = %s ORDER BY CREATED_AT DESC LIMIT 1",
                (player_id, summary, report_type)
            )
        report_id_row = cursor.fetchone()

        if not report_id_row:
            raise Exception("Failed to retrieve report ID after insert. The report may not have been saved.")
        
        report_id = report_id_row[0]

        # Batch insert individual attribute scores for better performance
        if report_type == 'Player Assessment' and report.attributeScores:
            # Prepare batch data for attribute scores
            attribute_data = [
                (report_id, attribute, score)
                for attribute, score in report.attributeScores.items()
            ]
            
            # Use executemany for batch insert
            cursor.executemany(
                """INSERT INTO SCOUT_REPORT_ATTRIBUTE_SCORES (SCOUT_REPORT_ID, ATTRIBUTE_NAME, ATTRIBUTE_SCORE) VALUES (%s, %s, %s)""",
                attribute_data
            )
            
        conn.commit()
        
        return {"message": "Scout report submitted successfully", "report_id": report_id}
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error creating scout report: {e}")
    finally:
        if conn:
            conn.autocommit = True
            conn.close()

@app.put("/scout_reports/{report_id}")
async def update_scout_report(report_id: int, report: ScoutReport, current_user: User = Depends(get_current_user)):
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        conn.autocommit = False
        
        # Check if report exists and user has permission to edit it
        cursor.execute("SELECT USER_ID FROM scout_reports WHERE ID = %s", (report_id,))
        existing_report = cursor.fetchone()
        
        if not existing_report:
            raise HTTPException(status_code=404, detail="Scout report not found")
        
        # Check if user has permission (either admin or report owner)
        if current_user.role != 'admin' and existing_report[0] != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to edit this report")
        
        report_type = report.reportType
        
        # Prepare common fields
        player_id = report.player_id
        position = report.playerPosition
        build = report.playerBuild
        height = report.playerHeight
        summary = report.assessmentSummary
        scouting_type = report.scoutingType
        performance_score = report.performanceScore
        strengths = ', '.join(report.strengths) if report.strengths else None
        weaknesses = ', '.join(report.weaknesses) if report.weaknesses else None
        
        # Initialize fields that might be null
        justification_rationale = None
        attribute_score = None
        purpose_of_assessment = None
        flag_category = None
        match_id = None
        formation = None
        
        if report_type == 'Player Assessment':
            justification_rationale = report.justificationRationale
            purpose_of_assessment = report.purposeOfAssessment
            match_id = report.selectedMatch
            formation = report.formation
            if report.attributeScores:
                attribute_score = sum(report.attributeScores.values())
        elif report_type == 'Flag':
            flag_category = report.flagCategory
            match_id = report.selectedMatch
        elif report_type == 'Clips':
            pass
        
        # Update the scout report
        sql = """
            UPDATE scout_reports SET 
                PLAYER_ID = %s, POSITION = %s, BUILD = %s, HEIGHT = %s, STRENGTHS = %s, WEAKNESSES = %s,
                SUMMARY = %s, JUSTIFICATION = %s, ATTRIBUTE_SCORE = %s, PERFORMANCE_SCORE = %s,
                PURPOSE = %s, SCOUTING_TYPE = %s, FLAG_CATEGORY = %s, REPORT_TYPE = %s, MATCH_ID = %s, FORMATION = %s
            WHERE ID = %s
        """
        
        values = (
            player_id, position, build, height, strengths, weaknesses, summary, 
            justification_rationale, attribute_score, performance_score, purpose_of_assessment,
            scouting_type, flag_category, report_type, match_id, formation, report_id
        )
        
        cursor.execute(sql, values)
        
        # Delete existing attribute scores and insert new ones
        cursor.execute("DELETE FROM SCOUT_REPORT_ATTRIBUTE_SCORES WHERE SCOUT_REPORT_ID = %s", (report_id,))
        
        if report_type == 'Player Assessment' and report.attributeScores:
            attribute_data = [
                (report_id, attribute, score)
                for attribute, score in report.attributeScores.items()
            ]
            cursor.executemany(
                """INSERT INTO SCOUT_REPORT_ATTRIBUTE_SCORES (SCOUT_REPORT_ID, ATTRIBUTE_NAME, ATTRIBUTE_SCORE) VALUES (%s, %s, %s)""",
                attribute_data
            )
        
        conn.commit()
        return {"message": "Scout report updated successfully", "report_id": report_id}
        
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error updating scout report: {e}")
    finally:
        if conn:
            conn.autocommit = True
            conn.close()

@app.delete("/scout_reports/{report_id}")
async def delete_scout_report(report_id: int, current_user: User = Depends(get_current_user)):
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        conn.autocommit = False
        
        # Check if report exists and user has permission to delete it
        cursor.execute("SELECT USER_ID FROM scout_reports WHERE ID = %s", (report_id,))
        existing_report = cursor.fetchone()
        
        if not existing_report:
            raise HTTPException(status_code=404, detail="Scout report not found")
        
        # Check if user has permission (either admin or report owner)
        if current_user.role != 'admin' and existing_report[0] != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this report")
        
        # Delete attribute scores first (foreign key constraint)
        cursor.execute("DELETE FROM SCOUT_REPORT_ATTRIBUTE_SCORES WHERE SCOUT_REPORT_ID = %s", (report_id,))
        
        # Delete the scout report
        cursor.execute("DELETE FROM scout_reports WHERE ID = %s", (report_id,))
        
        conn.commit()
        return {"message": "Scout report deleted successfully"}
        
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error deleting scout report: {e}")
    finally:
        if conn:
            conn.autocommit = True
            conn.close()

@app.get("/scout_reports/details/{report_id}")
async def get_scout_report(report_id: int, current_user: User = Depends(get_current_user)):
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Get the scout report with all details
        cursor.execute("""
            SELECT sr.ID, sr.PLAYER_ID, sr.POSITION, sr.BUILD, sr.HEIGHT, sr.STRENGTHS, sr.WEAKNESSES,
                   sr.SUMMARY, sr.JUSTIFICATION, sr.ATTRIBUTE_SCORE, sr.PERFORMANCE_SCORE, sr.PURPOSE,
                   sr.SCOUTING_TYPE, sr.FLAG_CATEGORY, sr.REPORT_TYPE, sr.MATCH_ID, sr.FORMATION,
                   p.PLAYERNAME, m.HOMESQUADNAME, m.AWAYSQUADNAME, DATE(m.SCHEDULEDDATE) as FIXTURE_DATE
            FROM scout_reports sr
            LEFT JOIN players p ON (sr.PLAYER_ID = p.PLAYERID OR sr.PLAYER_ID = p.CAFC_PLAYER_ID)
            LEFT JOIN matches m ON (sr.MATCH_ID = m.ID OR sr.MATCH_ID = m.CAFC_MATCH_ID)
            WHERE sr.ID = %s
        """, (report_id,))
        
        report = cursor.fetchone()
        if not report:
            raise HTTPException(status_code=404, detail="Scout report not found")
        
        # Get attribute scores
        cursor.execute("""
            SELECT ATTRIBUTE_NAME, ATTRIBUTE_SCORE 
            FROM SCOUT_REPORT_ATTRIBUTE_SCORES 
            WHERE SCOUT_REPORT_ID = %s
        """, (report_id,))
        
        attribute_scores = dict(cursor.fetchall())
        
        # Convert strengths and weaknesses from comma-separated strings to arrays
        strengths = [s.strip() for s in report[5].split(',')] if report[5] else []
        weaknesses = [w.strip() for w in report[6].split(',')] if report[6] else []
        
        report_data = {
            "report_id": report[0],
            "player_id": report[1],
            "playerPosition": report[2],
            "playerBuild": report[3],
            "playerHeight": report[4],
            "strengths": strengths,
            "weaknesses": weaknesses,
            "assessmentSummary": report[7],
            "justificationRationale": report[8],
            "performanceScore": report[10],
            "purposeOfAssessment": report[11],
            "scoutingType": report[12],
            "flagCategory": report[13],
            "reportType": report[14],
            "selectedMatch": report[15],
            "formation": report[16],
            "attributeScores": attribute_scores,
            "player_name": report[17],
            "fixtureDate": str(report[20]) if report[20] else None,
            "matchLabel": f"{report[18]} vs {report[19]}" if report[18] and report[19] else None
        }
        
        return report_data
        
    except HTTPException:
        raise
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching scout report: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/tables")
async def get_tables(current_user: User = Depends(get_current_user)):
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()
        table_list = [row[1] for row in tables]
        return {"tables": table_list}
    except Exception as e:
        logging.exception(e) # Log the error for debugging
        raise HTTPException(status_code=500, detail=f"Error fetching tables: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/admin/add-user-id-column")
async def add_user_id_column(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Check if column already exists
        cursor.execute("DESCRIBE TABLE scout_reports")
        columns = cursor.fetchall()
        column_names = [col[0] for col in columns]
        
        if 'USER_ID' not in column_names:
            # Add the USER_ID column
            cursor.execute("ALTER TABLE scout_reports ADD COLUMN USER_ID INTEGER")
            return {"message": "USER_ID column added successfully"}
        else:
            return {"message": "USER_ID column already exists"}
            
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error adding USER_ID column: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/admin/create-scout-user")
async def create_scout_user(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Create a test scout user
    scout_user = UserCreate(username="testscout", password="testpass", role="scout")
    
    existing_user = await get_user(scout_user.username)
    if existing_user:
        return {"message": "Scout user already exists"}
    
    hashed_password = get_password_hash(scout_user.password)
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        sql = "INSERT INTO users (USERNAME, HASHED_PASSWORD, ROLE) VALUES (%s, %s, %s)"
        cursor.execute(sql, (scout_user.username, hashed_password, scout_user.role))
        conn.commit()
        return {"message": "Scout user 'testscout' created with password 'testpass'"}
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error creating scout user: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/admin/update-intel-table")
async def update_intel_table(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Check if PLAYER_ID column exists, if not add it
        cursor.execute("DESCRIBE TABLE player_information")
        columns = cursor.fetchall()
        column_names = [col[0] for col in columns]
        
        missing_columns = []
        if 'PLAYER_ID' not in column_names:
            missing_columns.append("ALTER TABLE player_information ADD COLUMN PLAYER_ID INTEGER")
        if 'USER_ID' not in column_names:
            missing_columns.append("ALTER TABLE player_information ADD COLUMN USER_ID INTEGER")
            
        for sql in missing_columns:
            cursor.execute(sql)
            
        if missing_columns:
            return {"message": f"Added missing columns to player_information table: {', '.join([col.split()[-2] for col in missing_columns])}"}
        else:
            return {"message": "Player information table is already up to date"}
            
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error updating intel table: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/admin/optimize-database")
async def optimize_database(current_user: User = Depends(get_current_user)):
    """Create indexes to improve query performance"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Create indexes for better performance
        optimization_queries = [
            # Indexes for scout_reports table
            "CREATE INDEX IF NOT EXISTS idx_scout_reports_created_at ON scout_reports (CREATED_AT DESC)",
            "CREATE INDEX IF NOT EXISTS idx_scout_reports_player_id ON scout_reports (PLAYER_ID)",
            "CREATE INDEX IF NOT EXISTS idx_scout_reports_user_id ON scout_reports (USER_ID)",
            
            # Indexes for player_information table  
            "CREATE INDEX IF NOT EXISTS idx_player_info_created_at ON player_information (CREATED_AT DESC)",
            "CREATE INDEX IF NOT EXISTS idx_player_info_player_id ON player_information (PLAYER_ID)",
            "CREATE INDEX IF NOT EXISTS idx_player_info_user_id ON player_information (USER_ID)",
            
            # Indexes for players table
            "CREATE INDEX IF NOT EXISTS idx_players_name ON players (PLAYERNAME)",
            "CREATE INDEX IF NOT EXISTS idx_players_position ON players (POSITION)",
            
            # Indexes for users table
            "CREATE INDEX IF NOT EXISTS idx_users_username ON users (USERNAME)",
            "CREATE INDEX IF NOT EXISTS idx_users_role ON users (ROLE)"
        ]
        
        created_indexes = []
        for query in optimization_queries:
            try:
                cursor.execute(query)
                created_indexes.append(query.split()[-3])  # Extract index name
            except Exception as e:
                # Index might already exist, continue
                logging.warning(f"Index creation failed: {e}")
                continue
        
        return {
            "message": f"Database optimization completed. Created/verified {len(created_indexes)} indexes",
            "indexes": created_indexes
        }
            
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error optimizing database: {e}")
    finally:
        if conn:
            conn.close()



@app.get("/matches/date")
async def get_matches_by_date(fixture_date: str, current_user: User = Depends(get_current_user)):
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        # Fetch both external and manual matches using UNION
        cursor.execute("""
            SELECT
                ID as match_id,
                HOMESQUADNAME as home_team,
                AWAYSQUADNAME as away_team,
                SCHEDULEDDATE as fixture_date,
                DATA_SOURCE,
                'external' as id_type
            FROM matches
            WHERE DATE(SCHEDULEDDATE) = %s AND ID IS NOT NULL AND DATA_SOURCE = 'external'

            UNION ALL

            SELECT
                CAFC_MATCH_ID as match_id,
                HOMESQUADNAME as home_team,
                AWAYSQUADNAME as away_team,
                SCHEDULEDDATE as fixture_date,
                DATA_SOURCE,
                'manual' as id_type
            FROM matches
            WHERE DATE(SCHEDULEDDATE) = %s AND CAFC_MATCH_ID IS NOT NULL AND DATA_SOURCE = 'internal'

            ORDER BY home_team, away_team
        """, (fixture_date, fixture_date))

        matches = cursor.fetchall()
        match_list = []
        for row in matches:
            match_id, home_team, away_team, scheduled_date, data_source, id_type = row
            universal_id = get_match_universal_id({'ID': match_id if id_type == 'external' else None, 'CAFC_MATCH_ID': match_id if id_type == 'manual' else None, 'DATA_SOURCE': data_source})
            match_list.append({
                "match_id": match_id,
                "home_team": home_team,
                "away_team": away_team,
                "fixture_date": str(scheduled_date),
                "data_source": data_source,
                "universal_id": universal_id
            })
        return match_list
    except Exception as e:
        logging.exception(e) # Log the error for debugging
        raise HTTPException(status_code=500, detail=f"Error fetching matches: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/attributes/{position}")
async def get_attributes_by_position(position: str, current_user: User = Depends(get_current_user)):
    conn = None
    try:
        # Map specific positions to attribute groups for assessment forms
        position_to_attribute_group = {
            # Goalkeeper
            "GK": "GOALKEEPER",
            
            # Full Backs (store as RB/LB, use FULL BACK attributes)
            "RB": "FULL BACK",
            "LB": "FULL BACK", 
            
            # Wing Backs (store as RWB/LWB, use WINGBACK attributes)
            "RWB": "WINGBACK",
            "LWB": "WINGBACK",
            
            # Centre Backs - Wide (store specific positions, use WIDE CB attributes)
            "RCB(3)": "WIDE CB",  # Right CB in back 3
            "LCB(3)": "WIDE CB",  # Left CB in back 3
            "RCB(2)": "CENTRAL CB",  # Right CB in back 2
            "LCB(2)": "CENTRAL CB",  # Left CB in back 2
            
            # Centre Backs - Central (store as CCB(3), use CENTRAL CB attributes)
            "CCB(3)": "CENTRAL CB",  # Central CB in back 3
            
            # Midfielders (store as DM/CM/AM/RAM/LAM, use respective attributes)
            "DM": "DEFENSIVE MIDFIELDER",
            "CM": "CENTRAL MIDFIELDER",
            "AM": "ATTACKING MIDFIELDER",
            "RAM": "ATTACKING MIDFIELDER",
            "LAM": "ATTACKING MIDFIELDER",
            
            # Wingers (store as RW/LW, use WINGER attributes)
            "RW": "WINGER",
            "LW": "WINGER",
            
            # Centre Forwards (store as Target Man CF/In Behind CF, use respective attributes)
            "Target Man CF": "TARGET CF",
            "In Behind CF": "IN BEHIND CF",
        }
        
        # Get the attribute group for this position
        attribute_group = position_to_attribute_group.get(position, position)
        
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT ATTRIBUTE_NAME 
            FROM POSITION_ATTRIBUTES 
            WHERE POSITION = %s 
            ORDER BY DISPLAY_ORDER
        """, (attribute_group,))
        attributes = cursor.fetchall()
        attribute_list = [row[0] for row in attributes]
        return attribute_list
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching attributes: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/matches")
async def add_match(match: Match, current_user: User = Depends(get_current_user)):
    """Add a manual match to the database with separate ID system"""
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()

        # Check for duplicate matches by teams and date
        cursor.execute("""
            SELECT CAFC_MATCH_ID, ID, HOMESQUADNAME, AWAYSQUADNAME, SCHEDULEDDATE, DATA_SOURCE
            FROM matches
            WHERE HOMESQUADNAME = %s AND AWAYSQUADNAME = %s AND SCHEDULEDDATE = %s
        """, (match.homeTeam, match.awayTeam, match.date))
        existing = cursor.fetchone()

        if existing:
            cafc_id, external_id, home, away, date, data_source = existing
            universal_id = get_match_universal_id({
                'CAFC_MATCH_ID': cafc_id,
                'ID': external_id,
                'DATA_SOURCE': data_source
            })
            return {
                "message": "Match already exists",
                "existing_match": {
                    "cafc_match_id": cafc_id,
                    "external_match_id": external_id,
                    "home_team": home,
                    "away_team": away,
                    "date": date,
                    "data_source": data_source,
                    "universal_id": universal_id
                },
                "note": f"Use existing {data_source} match with universal ID: {universal_id}"
            }

        # Get next CAFC ID for manual match using sequence
        cursor.execute("SELECT manual_match_seq.NEXTVAL")
        cafc_match_id = cursor.fetchone()[0]

        # Insert manual match with CAFC_MATCH_ID, MATCH_ID stays NULL
        sql = """
            INSERT INTO matches (
                HOMESQUADNAME, AWAYSQUADNAME, SCHEDULEDDATE,
                CAFC_MATCH_ID, DATA_SOURCE
            ) VALUES (%s, %s, %s, %s, %s)
        """
        values = (
            match.homeTeam,
            match.awayTeam,
            match.date,
            cafc_match_id,
            'internal'
        )
        cursor.execute(sql, values)
        conn.commit()

        universal_id = f"internal_{cafc_match_id}"

        return {
            "message": "Internal match added successfully",
            "match": match,
            "cafc_match_id": cafc_match_id,
            "universal_id": universal_id,
            "data_source": "internal",
            "note": "This match has a separate ID space from external matches - zero collision risk"
        }
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error adding manual match: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/scout_reports/all")
async def get_all_scout_reports(
    current_user: User = Depends(get_current_user),
    page: int = 1,
    limit: int = 10,
    recency_days: Optional[int] = None
):
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()

        offset = (page - 1) * limit

        # Base SQL query for fetching reports - updated to handle both external and manual players
        base_sql = """
            FROM scout_reports sr
            LEFT JOIN players p ON (sr.PLAYER_ID = p.PLAYERID OR sr.PLAYER_ID = p.CAFC_PLAYER_ID)
            LEFT JOIN matches m ON (sr.MATCH_ID = m.ID OR sr.MATCH_ID = m.CAFC_MATCH_ID)
            LEFT JOIN users u ON sr.USER_ID = u.ID
        """
        
        where_clauses = []
        sql_params = []

        # Apply role-based filtering
        try:
            test_cursor = conn.cursor()
            # Check if USER_ID column exists by describing the table
            test_cursor.execute("DESCRIBE TABLE scout_reports")
            columns = test_cursor.fetchall()
            column_names = [col[0] for col in columns]

            if 'USER_ID' in column_names:
                # Column exists, apply role-based filtering
                if current_user.role == "scout":
                    where_clauses.append("sr.USER_ID = %s")
                    sql_params.append(current_user.id)
                    logging.info(f"Applied scout filtering for user ID: {current_user.id}")
                else:
                    logging.info(f"User role '{current_user.role}' - no scout filtering applied")
            else:
                logging.warning("USER_ID column does not exist in scout_reports table")
        except Exception as e:
            logging.error(f"Error checking USER_ID column: {e}")
            # If we can't determine column existence, skip role filtering for safety

        # Apply recency filter
        if recency_days is not None and recency_days > 0:
            # For Snowflake, use DATEADD to filter by date
            where_clauses.append("sr.CREATED_AT >= DATEADD(day, -%s, CURRENT_DATE())")
            sql_params.append(recency_days)

        # Construct WHERE clause
        if where_clauses:
            base_sql += " WHERE " + " AND ".join(where_clauses)

        # Get total count
        count_sql = f"SELECT COUNT(*) {base_sql}"
        cursor.execute(count_sql, sql_params)
        total_reports = cursor.fetchone()[0]

        # Get paginated reports
        select_sql = f"""
            SELECT
                sr.CREATED_AT,
                p.PLAYERNAME,
                p.BIRTHDATE,
                m.SCHEDULEDDATE,
                m.HOMESQUADNAME,
                m.AWAYSQUADNAME,
                sr.POSITION,
                sr.PERFORMANCE_SCORE,
                sr.ATTRIBUTE_SCORE,
                sr.ID,
                sr.REPORT_TYPE,
                sr.SCOUTING_TYPE,
                COALESCE(TRIM(CONCAT(u.FIRSTNAME, ' ', u.LASTNAME)), u.USERNAME, 'Unknown Scout') as SCOUT_NAME,
                p.PLAYERID,
                sr.FLAG_CATEGORY,
                sr.PURPOSE,
                p.CAFC_PLAYER_ID,
                p.DATA_SOURCE
            {base_sql}
            ORDER BY sr.CREATED_AT DESC
            LIMIT %s OFFSET %s
        """
        sql_params.extend([limit, offset])

        cursor.execute(select_sql, sql_params)
        reports = cursor.fetchall()
        
        report_list = []
        for row in reports:
            player_birthdate = row[2]
            age = None
            if player_birthdate:
                today = date.today()
                age = today.year - player_birthdate.year - ((today.month, today.day) < (player_birthdate.month, player_birthdate.day))
            
            # Format fixture details
            fixture_details = "N/A"
            if row[3]:  # fixture_date exists
                fixture_date = str(row[3])
                home_team = row[4] if row[4] else "Unknown"
                away_team = row[5] if row[5] else "Unknown"
                fixture_details = f"{home_team} vs {away_team}"
            
            report_list.append({
                "created_at": str(row[0]),
                "player_name": row[1],
                "age": age,
                "fixture_date": str(row[3]) if row[3] else "N/A",
                "fixture_details": fixture_details,
                "home_team": row[4] if row[4] else None,
                "away_team": row[5] if row[5] else None,
                "position_played": row[6],
                "performance_score": row[7],
                "attribute_score": row[8],
                "report_id": row[9],
                "report_type": row[10],
                "scouting_type": row[11],
                "scout_name": row[12] if row[12] else "Unknown Scout",
                "player_id": row[13],
                "flag_category": row[14],
                "purpose": row[15] if row[15] else None,
                "cafc_player_id": row[16],
                "data_source": row[17]
            })
        return {
            "total_reports": total_reports,
            "page": page,
            "limit": limit,
            "reports": report_list
        }
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching scout reports: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/scout_reports/{report_id}")
async def get_single_scout_report(report_id: int, current_user: User = Depends(get_current_user)):
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()

        # Fetch main report details
        sql = """
            SELECT
                sr.CREATED_AT,
                p.PLAYERNAME,
                p.BIRTHDATE,
                m.HOMESQUADNAME,
                m.AWAYSQUADNAME,
                m.SCHEDULEDDATE,
                sr.POSITION,
                sr.BUILD,
                sr.HEIGHT,
                sr.STRENGTHS,
                sr.WEAKNESSES,
                sr.SUMMARY,
                sr.JUSTIFICATION,
                sr.PERFORMANCE_SCORE,
                sr.SCOUTING_TYPE,
                sr.PURPOSE,
                sr.FORMATION,
                sr.ATTRIBUTE_SCORE,
                COALESCE(TRIM(CONCAT(u.FIRSTNAME, ' ', u.LASTNAME)), u.USERNAME, 'Unknown Scout') as SCOUT_NAME,
                sr.REPORT_TYPE,
                sr.FLAG_CATEGORY
            FROM scout_reports sr
            LEFT JOIN players p ON (sr.PLAYER_ID = p.PLAYERID OR sr.PLAYER_ID = p.CAFC_PLAYER_ID)
            LEFT JOIN matches m ON (sr.MATCH_ID = m.ID OR sr.MATCH_ID = m.CAFC_MATCH_ID)
            LEFT JOIN users u ON sr.USER_ID = u.ID
            WHERE sr.ID = %s
        """
        values = (report_id,)
        
        cursor.execute(sql, values)
        report_data = cursor.fetchone()

        if not report_data:
            raise HTTPException(status_code=404, detail="Scout report not found")

        # Note: Role-based authorization temporarily disabled until USER_ID column is added

        # Calculate age
        player_birthdate = report_data[2]
        age = None
        if player_birthdate:
            today = date.today()
            age = today.year - player_birthdate.year - ((today.month, today.day) < (player_birthdate.month, player_birthdate.day))

        # Fetch individual attribute scores
        cursor.execute(
            """
            SELECT ATTRIBUTE_NAME, ATTRIBUTE_SCORE
            FROM SCOUT_REPORT_ATTRIBUTE_SCORES
            WHERE SCOUT_REPORT_ID = %s
            """,
            (report_id,)
        )
        attribute_scores_data = cursor.fetchall()
        individual_attribute_scores = {row[0]: row[1] for row in attribute_scores_data}

        # Calculate non-zero average attribute score
        non_zero_scores = [score for score in individual_attribute_scores.values() if score > 0]
        average_attribute_score = sum(non_zero_scores) / len(non_zero_scores) if non_zero_scores else 0

        report = {
            "report_id": report_id,
            "created_at": str(report_data[0]),
            "player_name": report_data[1],
            "age": age,
            "home_squad_name": report_data[3],
            "away_squad_name": report_data[4],
            "fixture_date": str(report_data[5]) if report_data[5] else "N/A",
            "position_played": report_data[6],
            "build": report_data[7],
            "height": report_data[8],
            "strengths": report_data[9].split(', ') if report_data[9] else [],
            "weaknesses": report_data[10].split(', ') if report_data[10] else [],
            "summary": report_data[11],
            "justification": report_data[12],
            "performance_score": report_data[13],
            "scouting_type": report_data[14],
            "purpose_of_assessment": report_data[15],
            "formation": report_data[16],
            "total_attribute_score": report_data[17],
            "scout_name": report_data[18] if report_data[18] else "Unknown Scout",
            "report_type": report_data[19] if report_data[19] else "Player Assessment",
            "flag_category": report_data[20],
            "individual_attribute_scores": individual_attribute_scores,
            "average_attribute_score": round(average_attribute_score, 2)
        }

        return report
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching single scout report: {e}")
    finally:
        if conn:
            conn.close()


# --- Player Profile Endpoints ---
class PlayerNote(BaseModel):
    player_id: int
    note_content: str
    is_private: Optional[bool] = True

# PlayerPipelineStatus removed - will be added later

@app.get("/players/{player_id}/profile")
async def get_player_profile(player_id: int, current_user: User = Depends(get_current_user)):
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()

        # Get player basic info using dual ID lookup
        player_data, data_source = find_player_by_any_id(player_id, cursor)

        if not player_data:
            raise HTTPException(status_code=404, detail="Player not found")
        
        # Get scout reports
        scout_sql = """
            SELECT sr.ID, sr.CREATED_AT, sr.REPORT_TYPE, sr.SCOUTING_TYPE, 
                   sr.PERFORMANCE_SCORE, sr.ATTRIBUTE_SCORE, sr.SUMMARY,
                   u.USERNAME
            FROM scout_reports sr
            LEFT JOIN users u ON sr.USER_ID = u.ID
            WHERE sr.PLAYER_ID = %s
            ORDER BY sr.CREATED_AT DESC
        """
        
        # Determine which player ID to use for scout reports lookup
        # Extract the actual ID being used for this player from the found data
        actual_player_id = player_data[0] if data_source == 'external' else player_data[1]  # PLAYERID vs CAFC_PLAYER_ID

        # Apply role-based filtering for scout reports
        scout_values = (actual_player_id,)
        try:
            # Check if USER_ID column exists
            test_cursor = conn.cursor()
            test_cursor.execute("SELECT USER_ID FROM scout_reports LIMIT 1")
            if current_user.role == "scout":
                scout_sql = scout_sql.replace("WHERE sr.PLAYER_ID = %s",
                                            "WHERE sr.PLAYER_ID = %s AND sr.USER_ID = %s")
                scout_values = (actual_player_id, current_user.id)
        except:
            pass
        
        cursor.execute(scout_sql, scout_values)
        scout_reports = cursor.fetchall()
        
        # Get intel reports
        intel_sql = """
            SELECT pi.ID, pi.CREATED_AT, pi.CONTACT_NAME, pi.CONTACT_ORGANISATION,
                   pi.ACTION_REQUIRED, pi.CONVERSATION_NOTES, pi.TRANSFER_FEE
            FROM player_information pi
            WHERE pi.PLAYER_ID = %s
            ORDER BY pi.CREATED_AT DESC
        """
        
        # Apply role-based filtering for intel reports
        intel_values = (actual_player_id,)
        try:
            cursor.execute("DESCRIBE TABLE player_information")
            columns = cursor.fetchall()
            column_names = [col[0] for col in columns]
            if 'USER_ID' in column_names and current_user.role == "scout":
                intel_sql = intel_sql.replace("WHERE pi.PLAYER_ID = %s", 
                                            "WHERE pi.PLAYER_ID = %s AND pi.USER_ID = %s")
                intel_values = (actual_player_id, current_user.id)
        except:
            pass
        
        cursor.execute(intel_sql, intel_values)
        intel_reports = cursor.fetchall()
        
        # Get player notes (if table exists)
        notes = []
        try:
            cursor.execute("""
                SELECT pn.ID, pn.NOTE_CONTENT, pn.IS_PRIVATE, pn.CREATED_AT, u.USERNAME
                FROM player_notes pn
                LEFT JOIN users u ON pn.USER_ID = u.ID
                WHERE pn.PLAYER_ID = %s
                ORDER BY pn.CREATED_AT DESC
            """, (actual_player_id,))
            notes_data = cursor.fetchall()
            notes = [{"id": row[0], "content": row[1], "is_private": row[2], 
                     "created_at": str(row[3]), "author": row[4]} for row in notes_data]
        except:
            pass
        
        # Default recruitment status (pipeline will be added later)
        recruitment_status = "scouted"

        # Calculate age
        birthdate = player_data[5]  # BIRTHDATE is at index 5
        age = None
        if birthdate:
            # Handle both date objects and string dates
            if isinstance(birthdate, str):
                from datetime import datetime
                try:
                    birthdate = datetime.strptime(birthdate, "%Y-%m-%d").date()
                except ValueError:
                    birthdate = None

            if birthdate:
                today = date.today()
                age = today.year - birthdate.year - ((today.month, today.day) < (birthdate.month, birthdate.day))
        
        # Format response
        profile = {
            "player_id": player_data[0],
            "player_name": player_data[2],  # PLAYERNAME is at index 2
            "first_name": player_data[3],   # FIRSTNAME is at index 3
            "last_name": player_data[4],    # LASTNAME is at index 4
            "age": age,
            "birth_date": str(player_data[5]) if player_data[5] else None,  # BIRTHDATE is at index 5
            "squad_name": player_data[6],   # SQUADNAME is at index 6
            "position": player_data[7],     # POSITION is at index 7
            "recruitment_status": recruitment_status,
            "scout_reports": [
                {
                    "report_id": row[0],
                    "created_at": str(row[1]),
                    "report_type": row[2],
                    "scouting_type": row[3],
                    "performance_score": row[4],
                    "attribute_score": row[5],
                    "summary": row[6][:100] + "..." if row[6] and len(row[6]) > 100 else row[6],
                    "scout_name": row[7] or "Unknown"
                }
                for row in scout_reports
            ],
            "intel_reports": [
                {
                    "intel_id": row[0],
                    "created_at": str(row[1]),
                    "contact_name": row[2],
                    "contact_organisation": row[3],
                    "action_required": row[4],
                    "conversation_notes": row[5][:100] + "..." if row[5] and len(row[5]) > 100 else row[5],
                    "transfer_fee": row[6]
                }
                for row in intel_reports
            ],
            "notes": notes
        }
        
        return profile
        
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching player profile: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/players/{player_id}/attributes")
async def get_player_attributes(player_id: int, current_user: User = Depends(get_current_user)):
    """Get player attribute averages grouped by categories from all scout reports"""
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Check if player exists using dual ID lookup
        player_data, data_source = find_player_by_any_id(player_id, cursor)
        if not player_data:
            raise HTTPException(status_code=404, detail="Player not found")

        # Extract the actual player ID and position for queries
        actual_player_id = player_data[0] if data_source == 'external' else player_data[1]
        player_position = player_data[7]  # POSITION is the 8th column (index 7)
        
        # Get all scout report attribute scores for this player
        # Apply role-based filtering for scout reports
        base_query = """
            SELECT 
                sras.ATTRIBUTE_NAME,
                AVG(CAST(sras.ATTRIBUTE_SCORE AS FLOAT)) as avg_score,
                COUNT(sras.ATTRIBUTE_SCORE) as report_count
            FROM SCOUT_REPORT_ATTRIBUTE_SCORES sras
            JOIN scout_reports sr ON sras.SCOUT_REPORT_ID = sr.ID
            WHERE sr.PLAYER_ID = %s AND sras.ATTRIBUTE_SCORE > 0
        """

        query_params = [actual_player_id]
        
        # Apply role-based filtering for scout users
        try:
            # Check if USER_ID column exists
            test_cursor = conn.cursor()
            test_cursor.execute("SELECT USER_ID FROM scout_reports LIMIT 1")
            if current_user.role == "scout":
                base_query += " AND sr.USER_ID = %s"
                query_params.append(current_user.id)
        except:
            # USER_ID column doesn't exist, skip filtering
            pass
        
        base_query += " GROUP BY sras.ATTRIBUTE_NAME ORDER BY sras.ATTRIBUTE_NAME"
        
        cursor.execute(base_query, query_params)
        attribute_data = cursor.fetchall()
        
        if not attribute_data:
            return {
                "player_id": player_id,
                "player_position": player_position,
                "attribute_groups": {},
                "total_reports": 0,
                "message": "No attribute data found for this player"
            }
        
        # Create a mapping of attributes to their averages
        attribute_averages = {}
        total_reports = 0
        for row in attribute_data:
            attribute_name, avg_score, report_count = row
            attribute_averages[attribute_name] = {
                "average_score": round(float(avg_score), 1),
                "report_count": report_count
            }
            total_reports = max(total_reports, report_count)
        
        # Since players don't have positions, get attributes directly from their scout reports
        # and look up their ATTRIBUTE_GROUP from POSITION_ATTRIBUTES table
        # Use MIN(DISPLAY_ORDER) to avoid duplicates when same attribute has multiple display orders
        cursor.execute("""
            SELECT pa.ATTRIBUTE_NAME, MIN(pa.DISPLAY_ORDER) as display_order, pa.ATTRIBUTE_GROUP
            FROM POSITION_ATTRIBUTES pa
            WHERE pa.ATTRIBUTE_NAME IN (
                SELECT DISTINCT sras.ATTRIBUTE_NAME 
                FROM SCOUT_REPORT_ATTRIBUTE_SCORES sras 
                JOIN scout_reports sr ON sras.SCOUT_REPORT_ID = sr.ID 
                WHERE sr.PLAYER_ID = %s
            )
            GROUP BY pa.ATTRIBUTE_NAME, pa.ATTRIBUTE_GROUP
            ORDER BY pa.ATTRIBUTE_GROUP, display_order
        """, (player_id,))
        position_attributes = cursor.fetchall()
        
        # Use the real ATTRIBUTE_GROUP column from database
        attribute_groups = {}
        
        # Organize attributes by their ATTRIBUTE_GROUP from database
        for attr_row in position_attributes:
            attribute_name, display_order, attr_group = attr_row
            
            if attribute_name in attribute_averages:
                # Initialize group if it doesn't exist
                if attr_group not in attribute_groups:
                    attribute_groups[attr_group] = []
                
                attr_data = {
                    "name": attribute_name,
                    "average_score": attribute_averages[attribute_name]["average_score"],
                    "report_count": attribute_averages[attribute_name]["report_count"],
                    "display_order": display_order,
                    "attribute_group": attr_group
                }
                
                attribute_groups[attr_group].append(attr_data)
        
        # Remove empty groups
        attribute_groups = {k: v for k, v in attribute_groups.items() if v}
        
        # Sort attributes within each group by display_order
        for group in attribute_groups.values():
            group.sort(key=lambda x: x["display_order"])
        
        # DEBUG: Get what attributes exist in scout reports for this player
        cursor.execute("""
            SELECT DISTINCT sras.ATTRIBUTE_NAME 
            FROM SCOUT_REPORT_ATTRIBUTE_SCORES sras 
            JOIN scout_reports sr ON sras.SCOUT_REPORT_ID = sr.ID 
            WHERE sr.PLAYER_ID = %s
            ORDER BY sras.ATTRIBUTE_NAME
        """, (player_id,))
        scout_report_attributes = [row[0] for row in cursor.fetchall()]
        
        # DEBUG: Check if these attributes exist in POSITION_ATTRIBUTES
        cursor.execute("""
            SELECT ATTRIBUTE_NAME, ATTRIBUTE_GROUP 
            FROM POSITION_ATTRIBUTES 
            WHERE ATTRIBUTE_NAME IN ({})
            ORDER BY ATTRIBUTE_NAME
        """.format(','.join(['%s'] * len(scout_report_attributes))), scout_report_attributes)
        matching_attributes = cursor.fetchall()
        
        return {
            "player_id": player_id,
            "player_position": player_position,
            "attribute_groups": attribute_groups,
            "total_reports": total_reports,
            "total_attributes": len(attribute_averages),
            "debug_scout_attributes": scout_report_attributes,
            "debug_matching_attributes": [{"name": row[0], "group": row[1]} for row in matching_attributes],
            "debug_position_attributes_found": len(position_attributes)
        }
        
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching player attributes: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/players/{player_id}/scout-reports")
async def get_player_scout_reports(player_id: int, current_user: User = Depends(get_current_user)):
    """Get scout reports timeline for a player"""
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Check if player exists using dual ID lookup
        player_data, data_source = find_player_by_any_id(player_id, cursor)
        if not player_data:
            raise HTTPException(status_code=404, detail="Player not found")

        # Extract the actual player ID for queries
        actual_player_id = player_data[0] if data_source == 'external' else player_data[1]
        
        # Get scout reports with role-based filtering
        base_query = """
            SELECT 
                sr.ID as report_id,
                sr.CREATED_AT as report_date,
                COALESCE(TRIM(CONCAT(u.FIRSTNAME, ' ', u.LASTNAME)), u.USERNAME, 'Unknown Scout') as scout_name,
                DATE(m.SCHEDULEDDATE) as game_date,
                CONCAT(m.HOMESQUADNAME, ' vs ', m.AWAYSQUADNAME) as fixture,
                m.SCHEDULEDDATE as fixture_date,
                sr.PERFORMANCE_SCORE as overall_rating,
                COUNT(sras.ATTRIBUTE_NAME) as attribute_count,
                sr.PURPOSE as report_type
            FROM scout_reports sr
            LEFT JOIN users u ON sr.USER_ID = u.ID
            LEFT JOIN matches m ON (sr.MATCH_ID = m.ID OR sr.MATCH_ID = m.CAFC_MATCH_ID)
            LEFT JOIN SCOUT_REPORT_ATTRIBUTE_SCORES sras ON sr.ID = sras.SCOUT_REPORT_ID
            WHERE sr.PLAYER_ID = %s
        """
        
        query_params = [actual_player_id]
        
        # Apply role-based filtering for scout users
        try:
            test_cursor = conn.cursor()
            test_cursor.execute("SELECT USER_ID FROM scout_reports LIMIT 1")
            if current_user.role == "scout":
                base_query += " AND sr.USER_ID = %s"
                query_params.append(current_user.id)
        except:
            pass
        
        base_query += """
            GROUP BY sr.ID, sr.CREATED_AT, u.FIRSTNAME, u.LASTNAME, u.USERNAME, sr.PERFORMANCE_SCORE, m.SCHEDULEDDATE, m.HOMESQUADNAME, m.AWAYSQUADNAME, sr.PURPOSE
            ORDER BY sr.CREATED_AT DESC
        """
        
        cursor.execute(base_query, query_params)
        reports = cursor.fetchall()
        
        reports_data = []
        for report in reports:
            report_id, report_date, scout_name, game_date, fixture, fixture_date, overall_rating, attribute_count, report_type = report
            reports_data.append({
                "report_id": report_id,
                "report_date": report_date.isoformat() if report_date else None,
                "scout_name": scout_name,
                "game_date": game_date.isoformat() if game_date else None,
                "fixture": fixture,
                "fixture_date": fixture_date.isoformat() if fixture_date else None,
                "overall_rating": overall_rating,
                "attribute_count": attribute_count,
                "report_type": report_type
            })
        
        return {
            "player_id": player_id,
            "total_reports": len(reports_data),
            "reports": reports_data
        }
        
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching scout reports: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/players/{player_id}/notes")
async def add_player_note(player_id: int, note: PlayerNote, current_user: User = Depends(get_current_user)):
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Check if player_notes table exists, create if not
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS player_notes (
                    ID INTEGER AUTOINCREMENT,
                    PLAYER_ID INTEGER,
                    USER_ID INTEGER,
                    NOTE_CONTENT VARCHAR(2000),
                    IS_PRIVATE BOOLEAN DEFAULT TRUE,
                    CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (ID)
                )
            """)
        except:
            pass
        
        cursor.execute("""
            INSERT INTO player_notes (PLAYER_ID, USER_ID, NOTE_CONTENT, IS_PRIVATE)
            VALUES (%s, %s, %s, %s)
        """, (player_id, current_user.id, note.note_content, note.is_private))
        
        conn.commit()
        return {"message": "Note added successfully"}
        
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error adding note: {e}")
    finally:
        if conn:
            conn.close()

# Pipeline status endpoint removed - will be added later when pipeline table exists

@app.get("/players/all")
async def get_all_players(
    page: int = 1,
    limit: int = 20,
    search: str = None,
    position: str = None,
    team: str = None,
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Access denied. Admin or manager role required.")
    
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Build WHERE conditions
        where_conditions = ["p.PLAYERID IS NOT NULL"]
        params = []
        
        if search:
            where_conditions.append("(UPPER(p.PLAYERNAME) LIKE UPPER(%s) OR UPPER(p.FIRSTNAME) LIKE UPPER(%s) OR UPPER(p.LASTNAME) LIKE UPPER(%s))")
            search_param = f"%{search}%"
            params.extend([search_param, search_param, search_param])
            
        if position:
            where_conditions.append("UPPER(p.POSITION) = UPPER(%s)")
            params.append(position)
            
        if team:
            where_conditions.append("UPPER(p.SQUADNAME) LIKE UPPER(%s)")
            params.append(f"%{team}%")
        
        where_clause = " AND ".join(where_conditions)
        
        # Get total count
        count_sql = f"""
            SELECT COUNT(DISTINCT p.PLAYERID)
            FROM players p
            WHERE {where_clause}
        """
        cursor.execute(count_sql, params)
        total_count = cursor.fetchone()[0]
        
        # Calculate pagination
        offset = (page - 1) * limit
        total_pages = (total_count + limit - 1) // limit
        
        # Get paginated players with report counts
        sql = f"""
            SELECT 
                p.PLAYERID,
                p.PLAYERNAME,
                p.FIRSTNAME,
                p.LASTNAME,
                p.BIRTHDATE,
                p.SQUADNAME,
                p.POSITION,
                COUNT(DISTINCT sr.ID) as scout_reports_count,
                COUNT(DISTINCT pi.ID) as intel_reports_count,
                GREATEST(MAX(sr.CREATED_AT), MAX(pi.CREATED_AT)) as last_report_date
            FROM players p
            LEFT JOIN scout_reports sr ON p.PLAYERID = sr.PLAYER_ID
            LEFT JOIN player_information pi ON p.PLAYERID = pi.PLAYER_ID
            WHERE {where_clause}
            GROUP BY p.PLAYERID, p.PLAYERNAME, p.FIRSTNAME, p.LASTNAME, p.BIRTHDATE, p.SQUADNAME, p.POSITION
            ORDER BY p.PLAYERNAME
            LIMIT %s OFFSET %s
        """
        
        cursor.execute(sql, params + [limit, offset])
        players = cursor.fetchall()
        
        player_list = []
        for row in players:
            # Calculate age
            birthdate = row[4]
            age = None
            if birthdate:
                today = date.today()
                age = today.year - birthdate.year - ((today.month, today.day) < (birthdate.month, birthdate.day))
            
            player_list.append({
                "player_id": row[0],
                "player_name": row[1],
                "first_name": row[2] or "",
                "last_name": row[3] or "",
                "age": age,
                "squad_name": row[5],
                "position": row[6],
                "scout_reports_count": row[7],
                "intel_reports_count": row[8],
                "last_report_date": str(row[9]) if row[9] else None,
                "recruitment_status": "scouted"  # Default status for now
            })
        
        return {
            "players": player_list,
            "pagination": {
                "current_page": page,
                "total_pages": total_pages,
                "total_count": total_count,
                "limit": limit,
                "has_next": page < total_pages,
                "has_prev": page > 1
            }
        }
        
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching players: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/players/{player_id}/export-pdf")
async def export_player_pdf(player_id: int, current_user: User = Depends(get_current_user)):
    """Generate a printable HTML report for the player that can be converted to PDF"""
    try:
        # Get player profile data
        conn = get_snowflake_connection()
        cursor = conn.cursor()

        # Check if player exists using dual ID lookup
        player_lookup_result, data_source = find_player_by_any_id(player_id, cursor)
        if not player_lookup_result:
            raise HTTPException(status_code=404, detail="Player not found")

        # Extract the actual player ID for queries
        actual_player_id = player_lookup_result[0] if data_source == 'external' else player_lookup_result[1]

        # Get player basic info (we already have this from the lookup)
        player_data = player_lookup_result
        
        # Calculate age
        birthdate = player_data[4]
        age = None
        if birthdate:
            today = date.today()
            age = today.year - birthdate.year - ((today.month, today.day) < (birthdate.month, birthdate.day))
        
        # Get scout reports (without role filtering for PDF export)
        cursor.execute("""
            SELECT sr.CREATED_AT, sr.REPORT_TYPE, sr.SCOUTING_TYPE,
                   sr.PERFORMANCE_SCORE, sr.ATTRIBUTE_SCORE, sr.SUMMARY,
                   sr.STRENGTHS, sr.WEAKNESSES, sr.JUSTIFICATION,
                   u.USERNAME, m.HOMESQUADNAME, m.AWAYSQUADNAME, m.SCHEDULEDDATE
            FROM scout_reports sr
            LEFT JOIN users u ON sr.USER_ID = u.ID
            LEFT JOIN matches m ON (sr.MATCH_ID = m.ID OR sr.MATCH_ID = m.CAFC_MATCH_ID)
            WHERE sr.PLAYER_ID = %s
            ORDER BY sr.CREATED_AT DESC
        """, (actual_player_id,))
        scout_reports = cursor.fetchall()
        
        # Get intel reports (without role filtering for PDF export)
        cursor.execute("""
            SELECT pi.CREATED_AT, pi.CONTACT_NAME, pi.CONTACT_ORGANISATION,
                   pi.ACTION_REQUIRED, pi.CONVERSATION_NOTES, pi.TRANSFER_FEE,
                   pi.CURRENT_WAGES, pi.EXPECTED_WAGES, pi.CONTRACT_EXPIRY,
                   pi.POTENTIAL_DEAL_TYPE
            FROM player_information pi
            WHERE pi.PLAYER_ID = %s
            ORDER BY pi.CREATED_AT DESC
        """, (actual_player_id,))
        intel_reports = cursor.fetchall()
        
        # Generate HTML content
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Player Report - {player_data[1]}</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }}
                .header {{ text-align: center; margin-bottom: 30px; border-bottom: 3px solid #28a745; padding-bottom: 20px; }}
                .player-info {{ background: #f8f9fa; padding: 20px; margin: 20px 0; border-left: 4px solid #28a745; }}
                .section {{ margin: 30px 0; }}
                .report {{ background: #fff; border: 1px solid #ddd; margin: 15px 0; padding: 15px; }}
                .report-header {{ background: #28a745; color: white; padding: 10px; margin: -15px -15px 15px -15px; }}
                .intel-header {{ background: #17a2b8; color: white; padding: 10px; margin: -15px -15px 15px -15px; }}
                table {{ width: 100%; border-collapse: collapse; margin: 10px 0; }}
                th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
                th {{ background-color: #f8f9fa; }}
                .no-print {{ display: none; }}
                @media print {{ .no-print {{ display: none; }} }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Player Recruitment Report</h1>
                <h2>{player_data[1]}</h2>
                <p>Generated on {datetime.now().strftime('%B %d, %Y')}</p>
            </div>
            
            <div class="player-info">
                <h3>Player Information</h3>
                <table>
                    <tr><td><strong>Full Name:</strong></td><td>{player_data[2]} {player_data[3]}</td></tr>
                    <tr><td><strong>Age:</strong></td><td>{age or 'Unknown'}</td></tr>
                    <tr><td><strong>Position:</strong></td><td>{player_data[6]}</td></tr>
                    <tr><td><strong>Current Club:</strong></td><td>{player_data[5]}</td></tr>
                    <tr><td><strong>Date of Birth:</strong></td><td>{str(player_data[4]) if player_data[4] else 'Unknown'}</td></tr>
                </table>
            </div>
        """
        
        # Add scout reports section
        if scout_reports:
            html_content += """
            <div class="section">
                <h3>Scout Reports</h3>
            """
            for report in scout_reports:
                match_info = "N/A"
                if report[10] and report[11]:  # home and away team
                    match_info = f"{report[10]} vs {report[11]}"
                    if report[12]:  # match date
                        match_info += f" ({report[12].strftime('%Y-%m-%d')})"
                
                html_content += f"""
                <div class="report">
                    <div class="report-header">
                        <strong>{report[1]} Report</strong> - {report[0].strftime('%Y-%m-%d')} by {report[9] or 'Unknown Scout'}
                    </div>
                    <table>
                        <tr><td><strong>Type:</strong></td><td>{report[2] or 'N/A'}</td></tr>
                        <tr><td><strong>Match:</strong></td><td>{match_info}</td></tr>
                        <tr><td><strong>Performance Score:</strong></td><td>{report[3] or 'N/A'}/10</td></tr>
                        <tr><td><strong>Attribute Score:</strong></td><td>{report[4] or 'N/A'}</td></tr>
                        <tr><td><strong>Strengths:</strong></td><td>{report[6] or 'N/A'}</td></tr>
                        <tr><td><strong>Weaknesses:</strong></td><td>{report[7] or 'N/A'}</td></tr>
                    </table>
                    <h4>Summary:</h4>
                    <p>{report[5] or 'No summary provided'}</p>
                    {f'<h4>Justification:</h4><p>{report[8]}</p>' if report[8] else ''}
                </div>
                """
            html_content += "</div>"
        
        # Add intel reports section
        if intel_reports:
            html_content += """
            <div class="section">
                <h3>Intelligence Reports</h3>
            """
            for intel in intel_reports:
                deal_types = intel[9].split(',') if intel[9] else []
                
                html_content += f"""
                <div class="report">
                    <div class="intel-header">
                        <strong>Intel Report</strong> - {intel[0].strftime('%Y-%m-%d')}
                    </div>
                    <table>
                        <tr><td><strong>Contact:</strong></td><td>{intel[1]} ({intel[2]})</td></tr>
                        <tr><td><strong>Action Required:</strong></td><td>{intel[3]}</td></tr>
                        <tr><td><strong>Transfer Fee:</strong></td><td>{intel[5] or 'Unknown'}</td></tr>
                        <tr><td><strong>Current Wages:</strong></td><td>{intel[6] or 'Unknown'}</td></tr>
                        <tr><td><strong>Expected Wages:</strong></td><td>{intel[7] or 'Unknown'}</td></tr>
                        <tr><td><strong>Contract Expiry:</strong></td><td>{str(intel[8]) if intel[8] else 'Unknown'}</td></tr>
                        <tr><td><strong>Deal Types:</strong></td><td>{', '.join(deal_types) if deal_types else 'N/A'}</td></tr>
                    </table>
                    <h4>Conversation Notes:</h4>
                    <p>{intel[4] or 'No notes provided'}</p>
                </div>
                """
            html_content += "</div>"
        
        html_content += """
            <div class="no-print" style="margin-top: 30px; text-align: center;">
                <button onclick="window.print()">Print / Save as PDF</button>
            </div>
        </body>
        </html>
        """
        
        conn.close()
        
        from fastapi.responses import HTMLResponse
        return HTMLResponse(content=html_content)
        
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error generating PDF export: {e}")

# --- Intel Report Endpoints ---
@app.post("/intel_reports")
async def create_intel_report(report: IntelReport, current_user: User = Depends(get_current_user)):
    print(f"🔍 DEBUG: Intel report creation started")
    print(f"🔍 DEBUG: player_id={report.player_id}")
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()

        # Validate and resolve player_id using dual ID lookup
        if report.player_id:
            print(f"🔍 DEBUG: About to validate player_id={report.player_id}")
            player_data, player_data_source = find_player_by_any_id(report.player_id, cursor)
            if not player_data:
                raise HTTPException(status_code=404, detail=f"Player with ID {report.player_id} not found")
            # Use the actual database player ID for the insert
            actual_player_id = player_data[0] if player_data_source == 'external' else player_data[1]
        else:
            actual_player_id = None

        # Check which columns exist
        cursor.execute("DESCRIBE TABLE player_information")
        columns = cursor.fetchall()
        column_names = [col[0].upper() for col in columns]
        
        has_player_id = 'PLAYER_ID' in column_names
        has_user_id = 'USER_ID' in column_names
        
        # Add CREATED_AT column if it doesn't exist
        if 'CREATED_AT' not in column_names:
            cursor.execute("ALTER TABLE player_information ADD COLUMN CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()")
            conn.commit()

        # Convert potential_deal_types list to comma-separated string
        deal_types_str = ','.join(report.potential_deal_types) if report.potential_deal_types else None
        
        # Prepare dynamic SQL
        sql_columns = ["CREATED_AT"]
        sql_values = ["%s"]
        params = [datetime.utcnow()]

        # Add fields based on the report and table structure
        if has_player_id:
            sql_columns.append("PLAYER_ID")
            sql_values.append("%s")
            params.append(actual_player_id)
            
        if has_user_id:
            sql_columns.append("USER_ID")
            sql_values.append("%s")
            params.append(current_user.id)

        # Add all other intel report fields
        sql_columns.extend([
            "CONTACT_NAME", "CONTACT_ORGANISATION", "DATE_OF_INFORMATION",
            "CONTRACT_EXPIRY", "CONTRACT_OPTIONS", "POTENTIAL_DEAL_TYPE", "TRANSFER_FEE",
            "CURRENT_WAGES", "EXPECTED_WAGES", "CONVERSATION_NOTES", "ACTION_REQUIRED"
        ])
        sql_values.extend(["%s"] * 11)
        params.extend([
            report.contact_name,
            report.contact_organisation,
            report.date_of_information,
            report.confirmed_contract_expiry,
            report.contract_options,
            deal_types_str,
            report.transfer_fee,
            report.current_wages,
            report.expected_wages,
            report.conversation_notes,
            report.action_required
        ])
        
        # Construct the final SQL query
        sql = f"""
            INSERT INTO player_information ({', '.join(sql_columns)})
            VALUES ({', '.join(sql_values)})
        """
        
        cursor.execute(sql, tuple(params))
        conn.commit()
        return {"message": "Intel report submitted successfully"}
        
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error creating intel report: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/intel_reports/all")
async def get_all_intel_reports(
    current_user: User = Depends(get_current_user),
    page: int = 1,
    limit: int = 10,
    recency_days: Optional[int] = None
):
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        offset = (page - 1) * limit

        # Base SQL query for fetching reports
        base_sql = """
            SELECT pi.ID, pi.CREATED_AT, pi.CONTACT_NAME, pi.CONTACT_ORGANISATION,
                   pi.ACTION_REQUIRED, pi.CONVERSATION_NOTES, pi.TRANSFER_FEE,
                   pi.CURRENT_WAGES, pi.EXPECTED_WAGES, pi.CONTRACT_EXPIRY,
                   pi.POTENTIAL_DEAL_TYPE, p.PLAYERNAME, p.POSITION, p.SQUADNAME
            FROM player_information pi
            LEFT JOIN players p ON (pi.PLAYER_ID = p.PLAYERID OR pi.PLAYER_ID = p.CAFC_PLAYER_ID)
        """
        
        where_clauses = []
        sql_params = []

        # Check if PLAYER_ID column exists to determine if we can JOIN with players
        cursor.execute("DESCRIBE TABLE player_information")
        columns = cursor.fetchall()
        column_names = [col[0] for col in columns]
        has_player_id = 'PLAYER_ID' in column_names
        has_user_id = 'USER_ID' in column_names

        # Apply role-based filtering if USER_ID column exists
        if has_user_id and current_user.role == "scout":
            where_clauses.append("pi.USER_ID = %s")
            sql_params.append(current_user.id)

        # Apply recency filter
        if recency_days is not None and recency_days > 0:
            where_clauses.append("pi.CREATED_AT >= DATEADD(day, -%s, CURRENT_DATE())")
            sql_params.append(recency_days)

        # Construct WHERE clause
        if where_clauses:
            base_sql += " WHERE " + " AND ".join(where_clauses)

        # Get total count - need to modify base_sql for counting
        count_base_sql = """
            FROM player_information pi
            LEFT JOIN players p ON (pi.PLAYER_ID = p.PLAYERID OR pi.PLAYER_ID = p.CAFC_PLAYER_ID)
        """
        if where_clauses:
            count_base_sql += " WHERE " + " AND ".join(where_clauses)
            
        count_sql = f"SELECT COUNT(*) {count_base_sql}"
        cursor.execute(count_sql, sql_params)
        total_intel_reports = cursor.fetchone()[0]

        # Get paginated reports - properly construct the query
        final_query = f"""
            {base_sql}
            ORDER BY pi.CREATED_AT DESC
            LIMIT %s OFFSET %s
        """
        
        sql_params.extend([limit, offset])
        print(f"Executing final query: {final_query}")
        print(f"With params: {sql_params}")
        cursor.execute(final_query, sql_params)
        reports = cursor.fetchall()
        report_list = []
        
        # Parse results based on the base_sql columns:
        # pi.ID, pi.CREATED_AT, pi.CONTACT_NAME, pi.CONTACT_ORGANISATION,
        # pi.ACTION_REQUIRED, pi.CONVERSATION_NOTES, pi.TRANSFER_FEE,
        # pi.CURRENT_WAGES, pi.EXPECTED_WAGES, pi.CONTRACT_EXPIRY,
        # pi.POTENTIAL_DEAL_TYPE, p.PLAYERNAME, p.POSITION, p.SQUADNAME
        
        for row in reports:
            deal_types = row[10].split(',') if row[10] else []  # POTENTIAL_DEAL_TYPE
            report_list.append({
                "intel_id": row[0],  # pi.ID
                "created_at": str(row[1]),  # pi.CREATED_AT
                "contact_name": row[2],  # pi.CONTACT_NAME
                "contact_organisation": row[3],  # pi.CONTACT_ORGANISATION
                "action_required": row[4],  # pi.ACTION_REQUIRED
                "conversation_notes": row[5],  # pi.CONVERSATION_NOTES
                "transfer_fee": row[6],  # pi.TRANSFER_FEE
                "current_wages": str(row[7]) if row[7] else None,  # pi.CURRENT_WAGES
                "expected_wages": str(row[8]) if row[8] else None,  # pi.EXPECTED_WAGES
                "confirmed_contract_expiry": str(row[9]) if row[9] else None,  # pi.CONTRACT_EXPIRY
                "potential_deal_types": deal_types,  # pi.POTENTIAL_DEAL_TYPE
                "player_name": row[11] if row[11] else "Unknown Player",  # p.PLAYERNAME
                "position": row[12],  # p.POSITION
                "squad_name": row[13],  # p.SQUADNAME
            })
                
        return {
            "total_intel_reports": total_intel_reports,
            "page": page,
            "limit": limit,
            "reports": report_list
        }
        
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching intel reports: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/intel_reports/{intel_id}")
async def get_single_intel_report(intel_id: int, current_user: User = Depends(get_current_user)):
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Check which columns exist
        cursor.execute("DESCRIBE TABLE player_information")
        columns = cursor.fetchall()
        column_names = [col[0] for col in columns]
        
        has_player_id = 'PLAYER_ID' in column_names
        has_user_id = 'USER_ID' in column_names
        
        if has_player_id:
            sql = """
                SELECT
                    pi.ID,
                    pi.CREATED_AT,
                    p.PLAYERNAME,
                    pi.CONTACT_NAME,
                    pi.CONTACT_ORGANISATION,
                    pi.DATE_OF_INFORMATION,
                    pi.CONTRACT_EXPIRY,
                    pi.CONTRACT_OPTIONS,
                    pi.POTENTIAL_DEAL_TYPE,
                    pi.TRANSFER_FEE,
                    pi.CURRENT_WAGES,
                    pi.EXPECTED_WAGES,
                    pi.CONVERSATION_NOTES,
                    pi.ACTION_REQUIRED
                FROM player_information pi
                LEFT JOIN players p ON (pi.PLAYER_ID = p.PLAYERID OR pi.PLAYER_ID = p.CAFC_PLAYER_ID)
                WHERE pi.ID = %s
            """
        else:
            sql = """
                SELECT
                    pi.ID,
                    pi.CREATED_AT,
                    pi.CONTACT_NAME,
                    pi.CONTACT_ORGANISATION,
                    pi.DATE_OF_INFORMATION,
                    pi.CONTRACT_EXPIRY,
                    pi.CONTRACT_OPTIONS,
                    pi.POTENTIAL_DEAL_TYPE,
                    pi.TRANSFER_FEE,
                    pi.CURRENT_WAGES,
                    pi.EXPECTED_WAGES,
                    pi.CONVERSATION_NOTES,
                    pi.ACTION_REQUIRED
                FROM player_information pi
                WHERE pi.ID = %s
            """
        
        values = (intel_id,)
        
        # Apply role-based filtering if USER_ID exists
        if has_user_id and current_user.role == "scout":
            sql += " AND pi.USER_ID = %s"
            values = (intel_id, current_user.id)
        
        cursor.execute(sql, values)
        report_data = cursor.fetchone()
        
        if not report_data:
            raise HTTPException(status_code=404, detail="Intel report not found")
        
        if has_player_id:
            # Split potential_deal_types back into a list
            deal_types = report_data[8].split(',') if report_data[8] else []
            
            intel_report = {
                "intel_id": report_data[0],
                "created_at": str(report_data[1]),
                "player_name": report_data[2] if report_data[2] else "Unknown Player",
                "contact_name": report_data[3],
                "contact_organisation": report_data[4],
                "date_of_information": str(report_data[5]),
                "confirmed_contract_expiry": str(report_data[6]) if report_data[6] else None,
                "contract_options": report_data[7],
                "potential_deal_types": deal_types,
                "transfer_fee": report_data[9],
                "current_wages": str(report_data[10]) if report_data[10] else None,
                "expected_wages": str(report_data[11]) if report_data[11] else None,
                "conversation_notes": report_data[12],
                "action_required": report_data[13]
            }
        else:
            # Without PLAYER_ID column, offset indices by 1
            deal_types = report_data[7].split(',') if report_data[7] else []
            
            intel_report = {
                "intel_id": report_data[0],
                "created_at": str(report_data[1]),
                "player_name": "Player Name Not Available",
                "contact_name": report_data[2],
                "contact_organisation": report_data[3],
                "date_of_information": str(report_data[4]),
                "confirmed_contract_expiry": str(report_data[5]) if report_data[5] else None,
                "contract_options": report_data[6],
                "potential_deal_types": deal_types,
                "transfer_fee": report_data[8],
                "current_wages": str(report_data[9]) if report_data[9] else None,
                "expected_wages": str(report_data[10]) if report_data[10] else None,
                "conversation_notes": report_data[11],
                "action_required": report_data[12]
            }
        
        return intel_report
        
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching single intel report: {e}")
    finally:
        if conn:
            conn.close()

# --- Dropdown Data Endpoints ---
@app.get("/leagues")
async def get_leagues(current_user: User = Depends(get_current_user)):
    """Get all available leagues/competitions with caching"""
    cache_key = "leagues_list"
    
    # Check cache first
    cached_data = get_cache(cache_key)
    if cached_data is not None:
        return {"leagues": cached_data}
    
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT COMPETITIONNAME 
            FROM players 
            WHERE COMPETITIONNAME IS NOT NULL 
            ORDER BY COMPETITIONNAME
        """)
        leagues = cursor.fetchall()
        league_list = [row[0] for row in leagues if row[0]]
        
        # Cache for 60 minutes (leagues don't change often)
        set_cache(cache_key, league_list, expiry_minutes=60)
        
        return {"leagues": league_list}
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching leagues: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/clubs")
async def get_clubs(league: Optional[str] = None, current_user: User = Depends(get_current_user)):
    """Get all clubs, optionally filtered by league with caching"""
    cache_key = f"clubs_{league or 'all'}"
    
    # Check cache first
    cached_data = get_cache(cache_key)
    if cached_data is not None:
        return {"clubs": cached_data}
    
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        if league:
            # Get clubs from specific league - use prepared statement
            cursor.execute("""
                SELECT DISTINCT SQUADNAME 
                FROM players 
                WHERE COMPETITIONNAME = %s AND SQUADNAME IS NOT NULL 
                ORDER BY SQUADNAME
            """, (league,))
        else:
            # Get all clubs
            cursor.execute("""
                SELECT DISTINCT SQUADNAME 
                FROM players 
                WHERE SQUADNAME IS NOT NULL 
                ORDER BY SQUADNAME
            """)
        
        clubs = cursor.fetchall()
        # Clean up club names (some have multiple clubs listed)
        club_list = []
        for row in clubs:
            if row[0]:
                # Split multiple clubs and add individually
                club_names = [name.strip() for name in row[0].split(',')]
                club_list.extend(club_names)
        
        # Remove duplicates and sort
        unique_clubs = sorted(list(set(club_list)))
        
        # Cache for 30 minutes
        set_cache(cache_key, unique_clubs, expiry_minutes=30)
        
        return {"clubs": unique_clubs}
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching clubs: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/teams")
async def get_teams(current_user: User = Depends(get_current_user)):
    """Get all team names from matches for fixture creation with caching"""
    cache_key = "teams_list"
    
    # Check cache first
    cached_data = get_cache(cache_key)
    if cached_data is not None:
        return {"teams": cached_data}
    
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Optimized query using UNION ALL (faster than UNION)
        cursor.execute("""
            SELECT DISTINCT team_name FROM (
                SELECT HOMESQUADNAME as team_name FROM matches 
                WHERE HOMESQUADNAME IS NOT NULL
                UNION ALL
                SELECT AWAYSQUADNAME as team_name FROM matches 
                WHERE AWAYSQUADNAME IS NOT NULL
            ) teams
            ORDER BY team_name
        """)
        
        teams = cursor.fetchall()
        team_list = [row[0] for row in teams if row[0]]
        
        # Cache for 30 minutes
        set_cache(cache_key, team_list, expiry_minutes=30)
        
        return {"teams": team_list}
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching teams: {e}")
    finally:
        if conn:
            conn.close()

# --- Cache Management Endpoints ---
@app.post("/admin/clear-cache")
async def clear_cache(current_user: User = Depends(get_current_user)):
    """Clear all cached data"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    global _data_cache, _cache_expiry
    _data_cache.clear()
    _cache_expiry.clear()
    
    return {"message": "Cache cleared successfully"}

@app.get("/admin/cache-stats")
async def get_cache_stats(current_user: User = Depends(get_current_user)):
    """Get cache statistics"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    from datetime import datetime
    current_time = datetime.utcnow()
    
    stats = {
        "total_entries": len(_data_cache),
        "expired_entries": sum(1 for key, expiry in _cache_expiry.items() if current_time >= expiry),
        "cache_keys": list(_data_cache.keys())
    }
    
    return stats

@app.post("/admin/optimize-all")
async def optimize_all_operations(current_user: User = Depends(get_current_user)):
    """Run comprehensive database optimization"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        optimizations = []
        
        # 1. Update table statistics for better query planning
        try:
            cursor.execute("ALTER TABLE players REBUILD")
            optimizations.append("Rebuilt players table statistics")
        except:
            pass
        
        try:
            cursor.execute("ALTER TABLE matches REBUILD")
            optimizations.append("Rebuilt matches table statistics")
        except:
            pass
            
        try:
            cursor.execute("ALTER TABLE scout_reports REBUILD")
            optimizations.append("Rebuilt scout_reports table statistics")
        except:
            pass
        
        # 2. Create additional performance indexes
        performance_indexes = [
            "CREATE INDEX IF NOT EXISTS idx_players_competition ON players (COMPETITIONNAME)",
            "CREATE INDEX IF NOT EXISTS idx_players_squad_comp ON players (SQUADNAME, COMPETITIONNAME)",
            "CREATE INDEX IF NOT EXISTS idx_matches_home_away ON matches (HOMESQUADNAME, AWAYSQUADNAME)",
            "CREATE INDEX IF NOT EXISTS idx_matches_date ON matches (SCHEDULEDDATE)",
            "CREATE INDEX IF NOT EXISTS idx_scout_reports_composite ON scout_reports (PLAYER_ID, CREATED_AT DESC, USER_ID)"
        ]
        
        created_indexes = []
        for index_sql in performance_indexes:
            try:
                cursor.execute(index_sql)
                index_name = index_sql.split()[-3]  # Extract index name
                created_indexes.append(index_name)
            except Exception as e:
                logging.warning(f"Index creation failed: {e}")
                continue
        
        if created_indexes:
            optimizations.append(f"Created/verified indexes: {', '.join(created_indexes)}")
        
        # 3. Update column statistics
        try:
            cursor.execute("SELECT SYSTEM$CLUSTERING_INFORMATION('players', '(competitionname)')")
            optimizations.append("Updated players clustering information")
        except:
            pass
        
        # 4. Clear application cache to force fresh data
        global _data_cache, _cache_expiry
        _data_cache.clear()
        _cache_expiry.clear()
        optimizations.append("Cleared application cache")
        
        return {
            "message": "Database optimization completed successfully",
            "optimizations_applied": optimizations,
            "total_optimizations": len(optimizations)
        }
        
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error during optimization: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/admin/migrate-purpose-values")
async def migrate_purpose_values(current_user: User = Depends(get_current_user)):
    """Migrate PURPOSE values from Assessment to Report format (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        results = []
        
        # Check current values
        cursor.execute("SELECT DISTINCT PURPOSE, COUNT(*) FROM scout_reports WHERE PURPOSE IS NOT NULL GROUP BY PURPOSE ORDER BY PURPOSE")
        current_values = cursor.fetchall()
        results.append(f"Current PURPOSE values: {dict(current_values)}")
        
        # Update Player Assessment -> Player Report
        cursor.execute("UPDATE scout_reports SET PURPOSE = 'Player Report' WHERE PURPOSE = 'Player Assessment'")
        player_updates = cursor.rowcount
        results.append(f"Updated {player_updates} records from 'Player Assessment' to 'Player Report'")
        
        # Update Loan Assessment -> Loan Report  
        cursor.execute("UPDATE scout_reports SET PURPOSE = 'Loan Report' WHERE PURPOSE = 'Loan Assessment'")
        loan_updates = cursor.rowcount
        results.append(f"Updated {loan_updates} records from 'Loan Assessment' to 'Loan Report'")
        
        conn.commit()
        
        # Verify updates
        cursor.execute("SELECT DISTINCT PURPOSE, COUNT(*) FROM scout_reports WHERE PURPOSE IS NOT NULL GROUP BY PURPOSE ORDER BY PURPOSE")
        updated_values = cursor.fetchall()
        results.append(f"Updated PURPOSE values: {dict(updated_values)}")
        
        total_updates = player_updates + loan_updates
        results.append(f"Total records updated: {total_updates}")
        
        return {
            "message": "Purpose values migration completed successfully",
            "results": results,
            "total_updates": total_updates
        }
        
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error during migration: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/database/metadata")
async def get_database_metadata():
    """Get database metadata including counts and recent data info"""
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        metadata = {}
        
        # Get actual table metadata from INFORMATION_SCHEMA
        try:
            cursor.execute("""
                SELECT TABLE_NAME, CREATED, LAST_ALTERED 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = 'PUBLIC'
                AND TABLE_NAME IN ('PLAYERS', 'MATCHES')
                ORDER BY TABLE_NAME
            """)
            table_info = cursor.fetchall()
            
            for row in table_info:
                table_name, created, last_altered = row
                if table_name == 'PLAYERS':
                    cursor.execute("SELECT COUNT(*) FROM players")
                    player_count = cursor.fetchone()[0]
                    metadata["players_table"] = {
                        "count": player_count,
                        "created": str(created) if created else None,
                        "last_updated": str(last_altered) if last_altered else None
                    }
                elif table_name == 'MATCHES':
                    cursor.execute("SELECT COUNT(*) FROM matches")
                    matches_count = cursor.fetchone()[0]
                    metadata["matches_table"] = {
                        "count": matches_count,
                        "created": str(created) if created else None,
                        "last_updated": str(last_altered) if last_altered else None
                    }
                    
        except Exception as e:
            metadata["error"] = str(e)
            
        return metadata
        
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error fetching database metadata: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/analytics/player-coverage")
async def get_player_coverage_analytics(current_user: User = Depends(get_current_user)):
    """Get analytics on player coverage per game"""
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()

        # Query for ALL games (games with scout reports)
        cursor.execute("""
            SELECT
                m.ID as match_id,
                m.HOMESQUADNAME,
                m.AWAYSQUADNAME,
                m.SCHEDULEDDATE,
                sr.SCOUTING_TYPE,
                COUNT(DISTINCT sr.PLAYER_ID) as players_covered,
                COUNT(sr.ID) as total_reports
            FROM matches m
            INNER JOIN scout_reports sr ON m.ID = sr.MATCH_ID
            WHERE m.ID IS NOT NULL
            AND sr.PLAYER_ID IS NOT NULL
            GROUP BY m.ID, m.HOMESQUADNAME, m.AWAYSQUADNAME, m.SCHEDULEDDATE, sr.SCOUTING_TYPE
            ORDER BY m.SCHEDULEDDATE DESC
        """)

        all_games_data = cursor.fetchall()

        # Process results
        games_with_coverage = []
        all_games_stats = {
            'total_games': 0,
            'total_players_covered': 0,
            'total_reports': 0,
            'average_players_per_game': 0
        }

        live_games_stats = {
            'total_games': 0,
            'total_players_covered': 0,
            'total_reports': 0,
            'average_players_per_game': 0
        }

        total_players_all = 0
        total_players_live = 0
        games_dict = {}

        for row in all_games_data:
            match_id, home_team, away_team, scheduled_date, scouting_type, players_covered, total_reports = row

            # Create a unique key for each game
            game_key = f"{match_id}_{home_team}_{away_team}_{scheduled_date}"

            if game_key not in games_dict:
                games_dict[game_key] = {
                    'match_id': match_id,
                    'home_team': home_team,
                    'away_team': away_team,
                    'scheduled_date': str(scheduled_date),
                    'players_covered_all': 0,
                    'players_covered_live': 0,
                    'total_reports_all': 0,
                    'total_reports_live': 0,
                    'has_live': False,
                    'has_other': False
                }

            # Add to ALL games totals
            games_dict[game_key]['players_covered_all'] += players_covered
            games_dict[game_key]['total_reports_all'] += total_reports
            total_players_all += players_covered

            # Check if this is a LIVE scouting type
            if scouting_type and scouting_type.upper() == 'LIVE':
                games_dict[game_key]['players_covered_live'] += players_covered
                games_dict[game_key]['total_reports_live'] += total_reports
                games_dict[game_key]['has_live'] = True
                total_players_live += players_covered
            else:
                games_dict[game_key]['has_other'] = True

        # Convert dict to list and create game data entries
        for game_key, game_info in games_dict.items():
            # Add entry for ALL games
            game_data_all = {
                'match_id': game_info['match_id'],
                'home_team': game_info['home_team'],
                'away_team': game_info['away_team'],
                'scheduled_date': game_info['scheduled_date'],
                'players_covered': game_info['players_covered_all'],
                'total_reports': game_info['total_reports_all'],
                'scouting_type': 'ALL'
            }
            games_with_coverage.append(game_data_all)

            # Add entry for LIVE games if it has live scouting
            if game_info['has_live']:
                game_data_live = {
                    'match_id': game_info['match_id'],
                    'home_team': game_info['home_team'],
                    'away_team': game_info['away_team'],
                    'scheduled_date': game_info['scheduled_date'],
                    'players_covered': game_info['players_covered_live'],
                    'total_reports': game_info['total_reports_live'],
                    'scouting_type': 'LIVE'
                }
                games_with_coverage.append(game_data_live)

        # Count unique games for stats
        unique_games_all = len(games_dict)
        unique_games_live = len([g for g in games_dict.values() if g['has_live']])

        # Update stats
        all_games_stats['total_games'] = unique_games_all
        all_games_stats['total_reports'] = sum(g['total_reports_all'] for g in games_dict.values())

        live_games_stats['total_games'] = unique_games_live
        live_games_stats['total_reports'] = sum(g['total_reports_live'] for g in games_dict.values())

        # Calculate averages
        all_games_stats['total_players_covered'] = total_players_all
        if all_games_stats['total_games'] > 0:
            all_games_stats['average_players_per_game'] = round(total_players_all / all_games_stats['total_games'], 2)

        live_games_stats['total_players_covered'] = total_players_live
        if live_games_stats['total_games'] > 0:
            live_games_stats['average_players_per_game'] = round(total_players_live / live_games_stats['total_games'], 2)

        # Get additional insights
        cursor.execute("""
            SELECT
                COUNT(DISTINCT m.ID) as total_matches_in_db,
                COUNT(DISTINCT CASE WHEN sr.MATCH_ID IS NOT NULL THEN m.ID END) as matches_with_reports
            FROM matches m
            LEFT JOIN scout_reports sr ON m.ID = sr.MATCH_ID
        """)

        coverage_info = cursor.fetchone()
        total_matches_in_db, matches_with_reports = coverage_info

        # Get top covered games (LIVE scouting only)
        cursor.execute("""
            SELECT
                m.HOMESQUADNAME,
                m.AWAYSQUADNAME,
                m.SCHEDULEDDATE,
                COUNT(DISTINCT sr.PLAYER_ID) as players_covered,
                sr.SCOUTING_TYPE
            FROM matches m
            INNER JOIN scout_reports sr ON m.ID = sr.MATCH_ID
            WHERE m.ID IS NOT NULL AND sr.PLAYER_ID IS NOT NULL
            AND UPPER(sr.SCOUTING_TYPE) = 'LIVE'
            GROUP BY m.ID, m.HOMESQUADNAME, m.AWAYSQUADNAME, m.SCHEDULEDDATE, sr.SCOUTING_TYPE
            ORDER BY players_covered DESC
            LIMIT 10
        """)

        top_covered_games = []
        for row in cursor.fetchall():
            home_team, away_team, scheduled_date, players_covered, scouting_type = row
            top_covered_games.append({
                'match': f"{home_team} vs {away_team}",
                'date': str(scheduled_date),
                'players_covered': players_covered,
                'scouting_type': scouting_type
            })

        return {
            'all_games_stats': all_games_stats,
            'live_games_stats': live_games_stats,
            'games_with_coverage': games_with_coverage,
            'database_overview': {
                'total_matches_in_database': total_matches_in_db,
                'matches_with_scout_reports': matches_with_reports,
                'coverage_percentage': round((matches_with_reports / total_matches_in_db * 100), 2) if total_matches_in_db > 0 else 0
            },
            'top_covered_games': top_covered_games
        }

    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error retrieving player coverage analytics: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)