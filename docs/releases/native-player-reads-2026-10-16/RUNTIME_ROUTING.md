# Published frontend and runtime routing — 16 October 2026

The public frontend at https://cafc-recruitment-platform.vercel.app serves
/static/js/main.cc82ceb7.js. Its published Axios configuration explicitly sets
baseURL to https://dependable-adventure-production.up.railway.app. This proves
the default API destination for that published frontend, independently of the
source fallback to the older Railway service. Asset SHA256 and the relevant
configuration excerpt are saved in published-frontend-routing.json.

Vercel's latest production-target deployment inspected is
`dpl_qnPfTKvHpWyjQLZrVWg1Bgq92DmS`, revision 3fcbb6fe1a5db1471378b929f8f8d1bcfd6f71c2.
The latest cutover/full preview is dpl_QkhJVdjFLBUypnpfEJyi6NWx6e14, revision
3db15bb03693b2edcaa99c8aa4c62ed1969fb1ae. A preview's READY status alone does
not establish the production alias target. The public asset inspection is the
routing evidence; no deployment was promoted or changed.

The selected Railway service is live at deployment
b8ba0b81-e22c-48ce-b395-404cc1de0c48, consistent with the reconciled branch base.
Its current deployment startup logs explicitly confirm:

- Environment: production.
- Role: APP_ROLE; warehouse: COMPUTE_WH.
- READ_PREFIX=CAFC_DB.APP_COMPAT; WRITE_PREFIX=CAFC_DB.CORE.

The service's existing /health/debug endpoint returns HTTP 200 and confirms all
required connection settings are present. Its CORS allowlist includes the public
frontend. /health/snowflake returns HTTP 200, status success, result 1, proving
that the running service can authenticate and execute a basic database query.
This does not prove SELECT access to the two missing native summary tables,
correct application-user authorisation, or the full native projection.

Service logs from earlier deployments on October 16 show actual sessions using
CAFC_DB.CORE. Current-deployment session defaults remain unverified: Railway OAuth
returns variable names but withholds their values, and the current health endpoint
only exposes presence. A read-only query-history probe returned no matching visible
rows, so no conclusion is drawn from it. The exact current SNOWFLAKE_PROD_DATABASE
and SNOWFLAKE_PROD_SCHEMA values have been requested from the operator; neither
is a credential. No keys, passwords or tokens are requested or saved.

The frontend routing and basic runtime connection subchecks are complete. The
combined configuration gate remains open pending those current default values.
Permissions and actual native-source access still require a separate check after
the reviewed grants are applied. Production data, privileges, flags and services
were not changed by this audit.

## Operator confirmation

The user confirmed in this conversation that the current Railway values are
SNOWFLAKE_PROD_DATABASE=CAFC_DB and SNOWFLAKE_PROD_SCHEMA=CORE. Together with the
published asset, deployment logs and successful live health query, this closes
the configuration gate. This is operator-confirmed configuration, not an
independent CURRENT_DATABASE()/CURRENT_SCHEMA() query from the running service.
The earlier unverified-default statements above describe the audit before that
confirmation. Missing native-table grants and performance gates remain open.

## Subsequent permission stage

On 16 October the two live SELECT grants were explicitly authorised, applied
and verified using the matching application principal. See READ_PERMISSIONS.md.
Earlier statements about missing grants or unchanged permissions describe the
preceding inspection/rehearsal stage. Persistent dbt deployment remains pending;
player data and native-read activation flags remain unchanged.
