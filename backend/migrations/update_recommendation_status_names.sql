-- Update recommendation status names to include "Added / Already in" phrasing

-- Step 1: Update player_recommendations table - Emerging Talent Process
UPDATE player_recommendations
SET
    STATUS = 'Added / Already in Emerging Talent Process',
    UPDATED_AT = CURRENT_TIMESTAMP()
WHERE STATUS = 'Added to Emerging Talent Process';

-- Step 2: Update player_recommendations table - First Team Scouting Process
UPDATE player_recommendations
SET
    STATUS = 'Added / Already in First Team Scouting Process',
    UPDATED_AT = CURRENT_TIMESTAMP()
WHERE STATUS = 'Added to Scouting Process';

-- Step 3: Update status_history table - OLD_STATUS field for ETP
UPDATE status_history
SET OLD_STATUS = 'Added / Already in Emerging Talent Process'
WHERE OLD_STATUS = 'Added to Emerging Talent Process';

-- Step 4: Update status_history table - NEW_STATUS field for ETP
UPDATE status_history
SET NEW_STATUS = 'Added / Already in Emerging Talent Process'
WHERE NEW_STATUS = 'Added to Emerging Talent Process';

-- Step 5: Update status_history table - OLD_STATUS field for FTP
UPDATE status_history
SET OLD_STATUS = 'Added / Already in First Team Scouting Process'
WHERE OLD_STATUS = 'Added to Scouting Process';

-- Step 6: Update status_history table - NEW_STATUS field for FTP
UPDATE status_history
SET NEW_STATUS = 'Added / Already in First Team Scouting Process'
WHERE NEW_STATUS = 'Added to Scouting Process';

-- Step 7: Check results
SELECT
    'Current status distribution' as report,
    STATUS,
    COUNT(*) as count
FROM player_recommendations
GROUP BY STATUS
ORDER BY count DESC;

-- Step 8: Show sample of updated ETP records
SELECT
    ID,
    PLAYER_NAME,
    STATUS,
    UPDATED_AT
FROM player_recommendations
WHERE STATUS = 'Added / Already in Emerging Talent Process'
ORDER BY UPDATED_AT DESC
LIMIT 5;

-- Step 9: Show sample of updated FTP records
SELECT
    ID,
    PLAYER_NAME,
    STATUS,
    UPDATED_AT
FROM player_recommendations
WHERE STATUS = 'Added / Already in First Team Scouting Process'
ORDER BY UPDATED_AT DESC
LIMIT 5;
