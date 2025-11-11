// Utility functions for working with scout reports

/**
 * Extract VSS score from report summary text
 * VSS scores are stored in archived reports as "VSS SCORE: 30"
 * @param summary - The report summary text
 * @returns The VSS score as a string, or null if not found
 */
export const extractVSSScore = (summary: string): string | null => {
  if (!summary) return null;

  const match = summary.match(/VSS SCORE:\s*(\d+)/i);
  return match ? match[1] : null;
};

/**
 * Check if a report is archived
 * @param report - The report object
 * @returns True if the report is archived, false otherwise
 */
export const isArchivedReport = (report: any): boolean => {
  return report?.is_archived === true;
};

/**
 * Format VSS score for display
 * @param vssScore - The VSS score value
 * @param maxScore - The maximum VSS score (default: 32)
 * @returns Formatted VSS score string (e.g., "30/32")
 */
export const formatVSSScore = (vssScore: string | number, maxScore: number = 32): string => {
  return `${vssScore}/${maxScore}`;
};
