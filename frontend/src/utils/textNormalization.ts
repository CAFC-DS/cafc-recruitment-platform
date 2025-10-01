/**
 * Text normalization utilities for accent-insensitive search
 */

/**
 * Normalize text by removing diacritical marks (accents)
 * This allows for accent-insensitive search
 *
 * @param text - The text to normalize
 * @returns Normalized text without accents
 *
 * @example
 * normalizeText("Óscar Gil") // returns "Oscar Gil"
 * normalizeText("José María") // returns "Jose Maria"
 * normalizeText("Müller") // returns "Muller"
 */
export const normalizeText = (text: string): string => {
  return text
    .normalize("NFD") // Decompose combined characters
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritical marks
    .toLowerCase();
};

/**
 * Check if a text contains a search query using accent-insensitive matching
 *
 * @param text - The text to search in
 * @param query - The search query
 * @returns True if the text contains the query (accent-insensitive)
 *
 * @example
 * containsAccentInsensitive("Óscar Gil", "oscar") // returns true
 * containsAccentInsensitive("Óscar Gil", "Gil") // returns true
 */
export const containsAccentInsensitive = (
  text: string,
  query: string,
): boolean => {
  const normalizedText = normalizeText(text);
  const normalizedQuery = normalizeText(query);
  return normalizedText.includes(normalizedQuery);
};

/**
 * Sort array of objects by a text field using accent-insensitive comparison
 *
 * @param items - Array of objects to sort
 * @param getTextField - Function to extract the text field for comparison
 * @returns Sorted array
 */
export const sortByTextAccentInsensitive = <T>(
  items: T[],
  getTextField: (item: T) => string,
): T[] => {
  return items.sort((a, b) => {
    const textA = normalizeText(getTextField(a));
    const textB = normalizeText(getTextField(b));
    return textA.localeCompare(textB);
  });
};
