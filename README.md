# Cloudisy Server

Cloudisy Server is a TypeScript/Express backend for multi-tenant static site hosting.
It manages project/page provisioning, ZIP-based deployments to MinIO, dynamic Caddy routing, request/bandwidth metering, and periodic usage sync to PostgreSQL.

## What this project does

- Creates tenant pages (project + domain records in PostgreSQL)
- Creates one MinIO bucket per project and makes it publicly readable
- Uploads ZIP builds and extracts files into `dist/` inside the bucket
- Dynamically configures Caddy routes for project domains
- Collects access logs via Vector and increments usage counters in Redis
- Periodically syncs Redis counters into PostgreSQL

## Tech stack

- Node.js + TypeScript
- Express 5
- PostgreSQL + Drizzle ORM
- Redis + BullMQ
- MinIO (S3-compatible storage)
- Caddy (reverse proxy + dynamic route admin API)
- Vector (log shipping)

## Architecture (high level)

1. Client calls API (authenticated JWT bearer token)
2. API creates page metadata in DB and bucket in MinIO
3. API asks Caddy admin API to add route for the page domain
4. Client uploads ZIP to `/upload/:bucket`
5. Upload worker extracts and uploads files to MinIO under `dist/`
6. Caddy access logs are tailed by Vector and sent to `/internal/log`
7. Log worker increments Redis counters (`requests:*`, `bandwidth:*`)
8. Sync worker periodically flushes Redis usage into PostgreSQL

## Repository structure

- `src/server.ts` - app startup + route restoration + sync cron scheduling
- `src/app.ts` - Express app + rate limiting middleware
- `src/routes/` - API routes
- `src/controllers/` - HTTP handlers
- `src/services/` - business logic
- `src/infrastructure/`
  - `db/` PostgreSQL/Drizzle
  - `cache/` Redis
  - `storage/` MinIO
  - `proxy/` Caddy dynamic routing
- `src/queue/jobs/` - BullMQ queue definitions
- `src/queue/workers/` - background workers
- `config/Caddyfile` - Caddy base config
- `config/vector.toml` - Vector pipeline config
- `docker-compose.yml` - full local stack

## Prerequisites

- Docker + Docker Compose (recommended)
- Node.js 20+ and pnpm (for non-Docker development)

## Environment setup

The repo contains an `env` file template. Docker Compose expects `.env`.

```bash
cd <project-directory>  # example: cloudisy_server
cp env .env
```

Important variables used by the app:

- `DB` - PostgreSQL connection string for runtime app
- `DRIZZLE_CONNECTION` - PostgreSQL connection for drizzle-kit
- `REDIS_URL` - Redis URL for direct Redis client
- `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `DOCKER_SOCKET_PATH`, `DOCKER_NETWORK`, `TENANT_DB_IMAGE`, `TENANT_DB_PORT`
- `TENANT_DB_DEFAULT_RAM_MB`, `TENANT_DB_DEFAULT_CPU_SHARES`
- `TENANT_DB_MIN_RAM_MB`, `TENANT_DB_MAX_RAM_MB`, `TENANT_DB_MIN_STORAGE_MB`, `TENANT_DB_MAX_STORAGE_MB`
- `SUPAVISOR_API_URL`, `SUPAVISOR_API_TOKEN`

## Run with Docker (recommended)

```bash
cd <project-directory>  # example: cloudisy_server
docker compose up --build
```

Services started:

- `app` (Express API) on `3000`
- `upload_worker`, `log_worker`, `sync_worker`, `database_worker`
- `db` (PostgreSQL)
- `redis`
- `minio`
- `caddy` (ports `80`, `443`, admin `2019`)
- `vector`

Useful URLs:

- API direct: `http://localhost:3000`
- API via Caddy: `http://api.localhost`
- Caddy admin: `http://localhost:2019`
- MinIO API: `http://localhost:9000`

## Run without Docker (advanced)

You must provide PostgreSQL, Redis, MinIO, and Caddy manually and ensure hostnames/ports match app expectations.
Then:

```bash
cd <project-directory>  # example: cloudisy_server
pnpm install
pnpm run build
node dist/src/server.js
```

Run workers in separate processes:

```bash
node dist/src/queue/workers/upload.worker.js
node dist/src/queue/workers/log.worker.js
node dist/src/queue/workers/sync.worker.js
node dist/src/queue/workers/database.worker.js
```

## Authentication

Most API routes require:

```http
Authorization: Bearer <jwt>
```

JWT is verified against remote JWKS:
`https://cloudisy.vercel.app/api/auth/jwks`

## Database setup (project metadata + tenant DB lifecycle)

Main app metadata (pages, usage, tenant DB job logs) is stored in the main PostgreSQL configured by `DB`.

Run Drizzle once your DB is ready:

```bash
npm run gen   # generate migration files from schema changes
npm run mig   # apply migrations
npm run push  # push schema directly (alternative workflow)
```

Schema source: `src/infrastructure/db/schema.ts`

Tenant databases are provisioned asynchronously through `DATABASE_QUEUE` + `database_worker` using `/api/tenant-db*` endpoints.

## API endpoints summary

### Health

- `GET /health` (auth required)

### Pages

- `POST /api/pages/create` (auth)  
  Body:
  ```json
  { "project_name": "myproject" }
  ```
- `GET /api/pages` (auth)
- `GET /api/pages/usage/:domain` (auth)
- `DELETE /api/pages/:id` (auth)

### Uploads

- `POST /upload/:bucket` (auth, multipart/form-data, field name: `file`)  
  Accepts ZIP file (max ~250MB)
- `GET /upload/status/:jobId` (auth)

### Internal ingestion

- `POST /internal/log` (internal use by Vector)

### Tenant database lifecycle

- `POST /api/tenant-db` (auth) enqueue create tenant DB
- `GET /api/tenant-db` (auth) list tenant DB records
- `GET /api/tenant-db/:id` (auth) read tenant DB status/metadata
- `PATCH /api/tenant-db/:id` (auth) enqueue config update
- `DELETE /api/tenant-db/:id` (auth) enqueue delete
- `POST /api/tenant-db/:id/rotate-credentials` (auth) enqueue credentials rotation
- `GET /api/tenant-db/jobs/:jobId` (auth) queue + operation log status

## Create pages properly (recommended flow)

1. Create the page record with `POST /api/pages/create`.
2. Use returned `project_name` as MinIO bucket name for upload endpoint.
3. Upload a ZIP file to `POST /upload/:bucket` using `file` form field.
4. Poll `GET /upload/status/:jobId` until state is `completed`.
5. Verify page list + usage with `/api/pages` and `/api/pages/usage/:domain`.
6. Delete with `DELETE /api/pages/:id` when no longer needed.

Notes:
- `project_name` must be at least 3 characters.
- If project name exists, server appends a random suffix.
- Current top-level domain in code is `localhost` (`TOP_LEVEL_DOMAIN`).

## Create/manage tenant databases properly

Tenant DB operations are async queue jobs.

1. Create DB job: `POST /api/tenant-db` with:
   - `database_name` (regex: `^[a-zA-Z][a-zA-Z0-9_]{2,62}$`)
   - `ram_mb` (256-8192)
   - `storage_mb` (512-102400)
   - `cpu_shares` (128-4096)
   - `idempotency_key` (8-128 chars)
2. Poll `GET /api/tenant-db/jobs/:jobId` for queue/operation state.
3. List active tenant DBs with `GET /api/tenant-db`.
4. Update config with `PATCH /api/tenant-db/:id` (`idempotency_key` required + at least one updatable field).
5. Rotate credentials with `POST /api/tenant-db/:id/rotate-credentials`.
6. Delete with `DELETE /api/tenant-db/:id` (`idempotency_key` required).

Only one in-flight tenant DB operation is allowed per tenant at a time.

## API usage with curl

Set variables first:

```bash
export API_BASE="http://localhost:3000"
export TOKEN="<jwt>"
```

### Health

```bash
curl -sS "$API_BASE/health" \
  -H "Authorization: Bearer $TOKEN"
```

### Create page

```bash
curl -sS -X POST "$API_BASE/api/pages/create" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"project_name":"myproject"}'
```

### List pages

```bash
curl -sS "$API_BASE/api/pages" \
  -H "Authorization: Bearer $TOKEN"
```

### Upload ZIP build to page bucket

```bash
curl -sS -X POST "$API_BASE/upload/myproject" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./build.zip"
```

### Get upload job status

```bash
curl -sS "$API_BASE/upload/status/<jobId>" \
  -H "Authorization: Bearer $TOKEN"
```

### Get page usage by domain

```bash
curl -sS "$API_BASE/api/pages/usage/myproject.localhost" \
  -H "Authorization: Bearer $TOKEN"
```

### Delete page

```bash
curl -sS -X DELETE "$API_BASE/api/pages/<pageId>" \
  -H "Authorization: Bearer $TOKEN"
```

### Create tenant database (async)

```bash
curl -sS -X POST "$API_BASE/api/tenant-db" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "database_name":"tenantdb1",
    "ram_mb":512,
    "storage_mb":5120,
    "cpu_shares":512,
    "idempotency_key":"create-db-0001"
  }'
```

### Check tenant DB job status

```bash
curl -sS "$API_BASE/api/tenant-db/jobs/<jobId>" \
  -H "Authorization: Bearer $TOKEN"
```

### List tenant databases

```bash
curl -sS "$API_BASE/api/tenant-db" \
  -H "Authorization: Bearer $TOKEN"
```

### Update tenant database config

```bash
curl -sS -X PATCH "$API_BASE/api/tenant-db/<tenantDatabaseId>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ram_mb":1024,
    "idempotency_key":"update-db-0001"
  }'
```

### Rotate tenant DB credentials

```bash
curl -sS -X POST "$API_BASE/api/tenant-db/<tenantDatabaseId>/rotate-credentials" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"idempotency_key":"rotate-db-0001"}'
```

### Delete tenant database

```bash
curl -sS -X DELETE "$API_BASE/api/tenant-db/<tenantDatabaseId>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"idempotency_key":"delete-db-0001"}'
```

## Queue/workers behavior

- `UPLOAD_QUEUE`: unzip + upload files to MinIO
- `LOGS_QUEUE`: increment Redis usage counters from access logs
- `SYNC_QUEUE`: flush counters to PostgreSQL
- `DATABASE_QUEUE`: create/update/delete/rotate tenant PostgreSQL containers via worker orchestration + Supavisor registration

Sync cron is scheduled at startup from `src/server.ts` with BullMQ 6-field cron syntax (`sec min hour day month dayOfWeek`):

- `0 */2 * * * *` (every 2 minutes at second `0`)

## Notes on usage accounting

- Live counters are kept in Redis (`requests:<domain>`, `bandwidth:<domain>`)
- Periodic sync adds counters into DB columns (`request` column, `bandwidth_usage`)
- Usage API combines DB totals + live Redis values
- Redis key `requests` is plural, while DB column `request` is singular due to current schema naming
- Treat this naming mismatch as technical debt to normalize in a future schema/key cleanup

## Development status and validation

- There is currently no implemented automated test suite (`npm test` exits with placeholder error)
- Build command is `npm run build`/`pnpm run build`
- Current validation is manual: run the stack, call page/upload endpoints, and verify worker/log outputs

## Troubleshooting

- If API cannot connect to DB/Redis/MinIO, verify `.env` values and container health
- If custom domains do not serve content, verify:
  - bucket exists in MinIO
  - files uploaded under `dist/`
  - Caddy admin API reachable (`:2019`)
- If usage is not updating, check `vector`, `log_worker`, and `sync_worker` logs
- If tenant DB jobs fail, check `database_worker` logs and `tenant_database_jobs` table state/stage

## Quick workflow summary

1. Start stack with Docker Compose
2. Create page via `/api/pages/create`
3. Upload ZIP via `/upload/:bucket`
4. Track upload with `/upload/status/:jobId`
5. Check deployment and usage endpoints
6. (Optional) create/manage tenant DB via `/api/tenant-db*`
7. Delete page via `/api/pages/:id` when no longer needed
   
## Next implement 
1. Site performance tracking with unlitehouse
2. Site monitoring with umami to track peak time, bandwidth, visitor, region 
