// Unified color utility functions for consistent scoring colors across the platform

/**
 * Get standardized performance score color (1-10 scale)
 * 1-3: Red variants (darkest red for 1)
 * 4-5: Amber/Orange
 * 6-8: Green variants
 * 9-10: Dark green (darkest green for 10)
 */
export const getPerformanceScoreColor = (score: number): string => {
  if (score <= 0) return '#ef4444'; // Red for invalid scores

  if (score <= 1) return '#991b1b'; // Darkest red
  if (score <= 2) return '#dc2626'; // Dark red
  if (score <= 3) return '#ef4444'; // Red
  if (score <= 4) return '#f97316'; // Orange-ish
  if (score <= 5) return '#f59e0b'; // Amber
  if (score <= 6) return '#84cc16'; // Light green
  if (score <= 7) return '#1ebc58ff'; // Green
  if (score <= 8) return '#16a34a'; // Darker green
  if (score <= 9) return '#15803d'; // Dark green
  return '#166534'; // Darkest green for 10
};

/**
 * Get standardized attribute score color (0-100 scale)
 * 1-30: Red variants
 * 40-50: Amber/Orange
 * 60-80: Green variants
 * 80-100: Dark green
 */
export const getAttributeScoreColor = (score: number): string => {
  if (score <= 0) return '#ef4444'; // Red for invalid scores

  if (score <= 10) return '#991b1b'; // Darkest red
  if (score <= 20) return '#dc2626'; // Red
  if (score <= 30) return '#ef4444'; // Light red
  if (score <= 40) return '#f97316'; // Amber
  if (score <= 50) return '#f59e0b'; // Light amber
  if (score <= 60) return '#84cc16'; // Light green
  if (score <= 70) return '#1ebc58ff'; // Green
  if (score <= 80) return '#16a34a'; // Darker green
  if (score <= 90) return '#15803d'; // Dark green
  return '#166534'; // Darkest green for 90-100
};

/**
 * Get Bootstrap badge variant for performance scores
 * For backwards compatibility with existing badge components
 */
export const getPerformanceScoreVariant = (score: number): string => {
  if (score <= 3) return 'danger';
  if (score <= 5) return 'warning';
  if (score <= 8) return 'success';
  if (score === 9) return 'silver';
  if (score === 10) return 'gold';
  return 'success';
};

/**
 * Get Bootstrap badge variant for attribute scores
 * For backwards compatibility with existing badge components
 */
export const getAttributeScoreVariant = (score: number): string => {
  if (score <= 30) return 'danger';
  if (score <= 50) return 'warning';
  if (score <= 80) return 'success';
  if (score >= 90) return 'silver';
  if (score === 100) return 'gold';
  return 'success';
};

/**
 * Flag colors as specified:
 * - Positive: Green (similar to score 7 equivalent)
 * - Neutral: Grey (#6b7280)
 * - Negative: Amber (similar to score 2 equivalent)
 */
export const getFlagColor = (flagType: string): string => {
  switch (flagType?.toLowerCase()) {
    case 'positive':
      return '#22c55e'; // Green (score 7 equivalent)
    case 'neutral':
      return '#6b7280'; // Grey
    case 'negative':
      return '#ef4444'; // Red (score 2 equivalent)
    default:
      return '#6b7280'; // Default to neutral grey
  }
};

/**
 * Get text color (white/black) based on background color
 * For optimal contrast and readability
 */
export const getContrastTextColor = (backgroundColor: string): string => {
  // Convert hex to RGB and calculate brightness
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Calculate brightness using relative luminance formula
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  return brightness > 128 ? '#000000' : '#ffffff';
};