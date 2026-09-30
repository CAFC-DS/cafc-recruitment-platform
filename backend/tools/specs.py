"""Compat-view specs consumed by tools/gen_compat_sql.py. One entry per migrated domain.

`columns` maps every column of the LEGACY table, in legacy order, to the SQL expression that rebuilds it from the
normalized tables; gen_compat_sql wraps each one in a CAST to the live column type.
"""

SPECS = {
    "intel": {
        "legacy": "PLAYER_INFORMATION",
        "view": "V_COMPAT_PLAYER_INFORMATION",
        "view_file": "051_compat_intel.sql",
        "parity_file": "intel.sql",
        "tag": "intel",
        "legacy_added_columns": ["CANONICAL_PLAYER_ID"],
        "header": """-- 051_compat_intel.sql
-- The LEGACY-SHAPED compatibility view over the normalized intel tables: same 25 columns, same order, same types,
-- same values as the legacy PLAYER_INFORMATION table. At the swap the legacy table is renamed *_LEGACY and a view
-- with the legacy NAME selects from this, so the app's read queries (and the dbt APP_COMPAT view) are unchanged.
-- Pure view, safe to re-create at any time. Checked against the real legacy table by parity/intel.sql.""",
        "ctes": """WITH deals AS (
    SELECT INTEL_REPORT_ID, LISTAGG(${CORE}.INTEL_DEAL_TYPE_CODE(DEAL_TYPE_CODE), ',') WITHIN GROUP (ORDER BY SEQ) AS V
    FROM ${CORE}.INTEL_DEAL_TYPES GROUP BY INTEL_REPORT_ID
), rels AS (
    SELECT INTEL_REPORT_ID, LISTAGG(RELATIONSHIP_CODE, ',') WITHIN GROUP (ORDER BY SEQ) AS V
    FROM ${CORE}.INTEL_RELATIONSHIPS GROUP BY INTEL_REPORT_ID
), fee AS (
    SELECT * FROM ${CORE}.INTEL_TERMS WHERE TERM_TYPE = 'TRANSFER_FEE'
), cur AS (
    SELECT * FROM ${CORE}.INTEL_TERMS WHERE TERM_TYPE = 'CURRENT_WAGES'
), exp AS (
    SELECT * FROM ${CORE}.INTEL_TERMS WHERE TERM_TYPE = 'EXPECTED_WAGES'
)""",
        "columns": {
            "ID": "r.ID",
            "CONTACT_NAME": "c.CONTACT_NAME",
            "CONTACT_ORGANISATION": "c.CONTACT_ORGANISATION",
            "DATE_OF_INFORMATION": "r.DATE_OF_INFORMATION",
            "CONTRACT_EXPIRY": "r.CONTRACT_EXPIRY",
            "CONTRACT_OPTIONS": "r.CONTRACT_OPTIONS",
            "POTENTIAL_DEAL_TYPE": "deals.V",
            "TRANSFER_FEE": "fee.RAW_TEXT",
            "CURRENT_WAGES": "cur.AMOUNT",
            "EXPECTED_WAGES": "exp.AMOUNT",
            "CONVERSATION_NOTES": "r.CONVERSATION_NOTES",
            "ACTION_REQUIRED": "r.ACTION_REQUIRED",
            "CREATED_AT": "r.CREATED_AT",
            "PLAYER_ID": "r.PLAYER_ID",
            "USER_ID": "r.USER_ID",
            "DATA_SOURCE": "r.DATA_SOURCE",
            "EXPECTED_WAGES_MAX": "exp.AMOUNT_MAX",
            "EXPECTED_WAGES_MIN": "exp.AMOUNT_MIN",
            "CURRENT_WAGES_MAX": "cur.AMOUNT_MAX",
            "CURRENT_WAGES_MIN": "cur.AMOUNT_MIN",
            "INTEL_TYPE": "r.INTEL_TYPE",
            "RELATIONSHIP_TO_PLAYER": "rels.V",
            "LENGTH_OF_RELATIONSHIP": "ref.LENGTH_OF_RELATIONSHIP",
            "RELEVANCE_OF_RELATIONSHIP": "ref.RELEVANCE_OF_RELATIONSHIP",
            "REFERENCE_RATING": "ref.REFERENCE_RATING",
        },
        "from": """FROM ${CORE}.INTEL_REPORTS r
LEFT JOIN ${CORE}.CONTACTS c ON c.CONTACT_ID = r.CONTACT_ID
LEFT JOIN deals ON deals.INTEL_REPORT_ID = r.ID
LEFT JOIN rels  ON rels.INTEL_REPORT_ID  = r.ID
LEFT JOIN fee ON fee.INTEL_REPORT_ID = r.ID
LEFT JOIN cur ON cur.INTEL_REPORT_ID = r.ID
LEFT JOIN exp ON exp.INTEL_REPORT_ID = r.ID
LEFT JOIN ${CORE}.INTEL_REFERENCE_DETAILS ref ON ref.INTEL_REPORT_ID = r.ID""",
    },
}
