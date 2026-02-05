-- Create Snowflake JavaScript UDF for accent-insensitive text normalization
-- This function removes diacritical marks (accents) from text
-- Usage: SELECT NORMALIZE_TEXT_UDF('Róbert') -> 'robert'

CREATE OR REPLACE FUNCTION NORMALIZE_TEXT_UDF(text VARCHAR)
RETURNS VARCHAR
LANGUAGE JAVASCRIPT
AS $$
  if (!TEXT) return '';

  // Normalize to NFD (decompose combined characters)
  // Then remove all combining diacritical marks (Unicode category Mn)
  var normalized = TEXT.normalize('NFD');
  var result = normalized.replace(/[\u0300-\u036f]/g, '');

  // Return lowercase for case-insensitive matching
  return result.toLowerCase();
$$;

-- Test the function
SELECT
    NORMALIZE_TEXT_UDF('Róbert') AS test_robert,
    NORMALIZE_TEXT_UDF('Boženík') AS test_bozenik,
    NORMALIZE_TEXT_UDF('José') AS test_jose,
    NORMALIZE_TEXT_UDF('Óscar') AS test_oscar,
    NORMALIZE_TEXT_UDF('Márton') AS test_marton,
    NORMALIZE_TEXT_UDF('João') AS test_joao;

-- Expected output:
-- robert | bozenik | jose | oscar | marton | joao

-- Usage in queries:
-- WHERE NORMALIZE_TEXT_UDF(PLAYERNAME) ILIKE CONCAT('%', NORMALIZE_TEXT_UDF('Robert'), '%')

-- Or with parameter:
-- WHERE NORMALIZE_TEXT_UDF(PLAYERNAME) ILIKE CONCAT('%', NORMALIZE_TEXT_UDF(?), '%')
