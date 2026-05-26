-- Add boolean column to distinguish potential vs performance scores
-- FALSE = Performance score (current ability)
-- TRUE = Potential score (future ceiling/ability)

ALTER TABLE SCOUT_REPORTS
ADD COLUMN IS_POTENTIAL BOOLEAN DEFAULT FALSE;

-- Add comment for clarity
COMMENT ON COLUMN SCOUT_REPORTS.IS_POTENTIAL IS
'FALSE = Performance score (current ability), TRUE = Potential score (future ceiling)';

-- Update existing records to explicitly set as performance scores
UPDATE SCOUT_REPORTS
SET IS_POTENTIAL = FALSE
WHERE IS_POTENTIAL IS NULL;

-- Verify the column was added
SELECT COUNT(*) as total_reports,
       SUM(CASE WHEN IS_POTENTIAL = TRUE THEN 1 ELSE 0 END) as potential_scores,
       SUM(CASE WHEN IS_POTENTIAL = FALSE THEN 1 ELSE 0 END) as performance_scores
FROM SCOUT_REPORTS;
