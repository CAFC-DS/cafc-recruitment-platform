CREATE OR REPLACE FUNCTION {{schema}}."NORMALIZE_TEXT_UDF"("TEXT" VARCHAR)
RETURNS VARCHAR
LANGUAGE JAVASCRIPT
AS '
  if (!TEXT) return '''';
  var normalized = TEXT.normalize(''NFD'');
  var result = normalized.replace(/[\\u0300-\\u036f]/g, '''');
  return result.toLowerCase();
';
