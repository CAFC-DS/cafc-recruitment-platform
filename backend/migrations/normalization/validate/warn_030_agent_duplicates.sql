-- Informational: probable duplicate agents the key could not merge (same name, different
-- email). These need a human merge decision before the agent portal cuts over.

SELECT NORMALIZE_NAME_KEY_VALUE AS NAME_KEY, COUNT(*) AS AGENTS, LISTAGG(AGENT_ID, ',') AS AGENT_IDS
FROM (
    SELECT AGENT_ID, ${CORE}.NORMALIZE_NAME_KEY(AGENT_NAME) AS NORMALIZE_NAME_KEY_VALUE
    FROM ${CORE}.AGENTS
    WHERE ${CORE}.NORMALIZE_NAME_KEY(AGENT_NAME) IS NOT NULL
)
GROUP BY NORMALIZE_NAME_KEY_VALUE
HAVING COUNT(*) > 1;
