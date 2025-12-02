-- Migration: Add IS_ARCHIVED column to SCOUT_REPORTS table
-- Date: 2025-11-11
-- Purpose: Mark imported historical/archived reports to exclude from analytics

-- Add IS_ARCHIVED column with default FALSE
ALTER TABLE SCOUT_REPORTS
ADD COLUMN IS_ARCHIVED BOOLEAN DEFAULT FALSE;

-- Verify the column was added
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'SCOUT_REPORTS' AND COLUMN_NAME = 'IS_ARCHIVED';

-- Check current data (should show FALSE for all existing reports)
SELECT COUNT(*) as total_reports,
       SUM(CASE WHEN IS_ARCHIVED = TRUE THEN 1 ELSE 0 END) as archived_reports,
       SUM(CASE WHEN IS_ARCHIVED = FALSE OR IS_ARCHIVED IS NULL THEN 1 ELSE 0 END) as active_reports
FROM SCOUT_REPORTS;
