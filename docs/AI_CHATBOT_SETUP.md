# AI Analytics Chatbot Setup Guide

## Overview
The AI Analytics Chatbot allows users to query the recruitment database using natural language. It uses Ollama for local AI processing and includes comprehensive security controls.

## Prerequisites

### 1. Install Ollama
Download and install Ollama from: https://ollama.ai/

### 2. Install Required AI Model
After installing Ollama, run:
```bash
ollama pull llama3:8b
```

### 3. Verify Ollama is Running
```bash
# Check if Ollama service is running
curl http://localhost:11434/api/tags

# Should return JSON with available models
```

## Backend Setup

### 1. Install New Dependencies
```bash
cd backend
pip install httpx>=0.25.0 sqlparse>=0.4.4
```

### 2. Verify Service Structure
The following new files should be present:
- `backend/services/__init__.py`
- `backend/services/ollama_service.py`
- `backend/services/schema_service.py`
- `backend/services/sql_generator.py`

### 3. Test Backend Endpoints
Start the backend and test:
```bash
# Health check
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8000/chatbot/health

# Schema info
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8000/chatbot/schema

# Test query
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"query": "How many scout reports are in the database?"}' \
     http://localhost:8000/chatbot/query
```

## Frontend Integration

The chatbot is automatically integrated into the Analytics page (`/analytics`) and appears as a collapsible card at the bottom.

### Features:
- **Health Status Indicator**: Shows if Ollama and database are accessible
- **Suggested Queries**: Pre-defined example questions
- **Conversation History**: Maintains context for follow-up questions
- **Result Tables**: Displays query results in formatted tables
- **SQL Display**: Shows generated SQL queries for transparency

## Security Features

### 1. Access Control
- Only managers and administrators can use the chatbot
- All API endpoints require authentication and role verification

### 2. SQL Security
- Only SELECT queries are allowed
- Comprehensive SQL injection prevention
- Table access restricted to: scout_reports, players, matches, users (limited)
- Automatic query limits (max 1000 rows)

### 3. Data Privacy
- User table access is limited to basic role information
- No sensitive data (passwords, emails) exposed to AI
- All queries are logged for security review

## Testing the System

### 1. Health Check
- Navigate to Analytics page
- Click on the AI Assistant card
- Verify green status indicator

### 2. Sample Queries to Test
Try these queries to verify functionality:

**Basic Queries:**
- "How many scout reports are in the database?"
- "Who are the top 5 highest-rated players?"
- "Show me all the scouts in the system"

**Advanced Queries:**
- "Which scouts have submitted reports in the last 30 days?"
- "What's the average performance score by position?"
- "Show me match coverage statistics for this month"

**Complex Queries:**
- "Find players with performance score above 8 who play as forwards"
- "Compare live vs video scouting productivity by scout"

### 3. Expected Behavior
- ✅ Queries should return formatted results in tables
- ✅ SQL queries should be displayed for transparency
- ✅ Conversation context should be maintained
- ✅ Security violations should be blocked with clear error messages

## Troubleshooting

### Common Issues

**"Ollama service unavailable"**
- Ensure Ollama is installed and running: `ollama serve`
- Check if the model is downloaded: `ollama list`

**"No compatible AI models found"**
- Install the required model: `ollama pull llama3:8b`
- Verify installation: `ollama list`

**"Access denied" errors**
- Ensure user has manager or admin role
- Check authentication token is valid

**Poor AI responses**
- Model may need more context - try rephrasing questions
- Check if database contains relevant data for the query
- Review the AI system prompt in `ollama_service.py`

### Performance Tips

**For Better AI Responses:**
1. Be specific in questions ("players with score > 8" vs "good players")
2. Include relevant context ("this month", "forwards only")
3. Use database terminology when possible

**For Better Performance:**
1. Use appropriate hardware (8GB+ RAM recommended for llama3.1:8b)
2. Keep queries focused to avoid large result sets
3. Use the suggested queries as templates

## Development Notes

### Customizing AI Behavior
Edit the system prompt in `services/ollama_service.py` to:
- Add new query patterns
- Modify response formatting
- Include additional context about the data

### Adding New Tables
To expose new tables to the AI:
1. Add table name to `allowed_tables` in `schema_service.py`
2. Add table description in `_get_table_description()`
3. Add column descriptions in `_get_column_description()`
4. Update security validation in `sql_generator.py`

### Model Alternatives
You can use different Ollama models by updating the `model` parameter in `ollama_service.py`:
- `llama3:8b` (recommended - good balance)
- `llama3:70b` (better accuracy, requires more resources)
- `mixtral:8x7b` (alternative option)

## Security Considerations

⚠️ **Important Security Notes:**
- This feature is experimental and should be monitored closely
- All generated SQL is logged and should be reviewed periodically
- Users should be trained to verify important insights with actual data
- Consider implementing additional query logging and monitoring
- Review AI responses regularly to ensure accuracy

## Support

For issues with the AI chatbot:
1. Check Ollama service status first
2. Review backend logs for SQL generation errors
3. Test with simple queries before complex ones
4. Verify user permissions and authentication

The system includes comprehensive error handling and user feedback to help diagnose issues.