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
- `src/queue/workers/` - background workers (upload/log/sync/database)
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

## API endpoints

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

### Databases

- `POST /api/databases` (auth)
  Body:
  ```json
  { "username": "demo", "ram": 512, "cpu": 0.5 }
  ```
- `GET /api/databases/status/:jobId` (auth)

## Queue/workers behavior

- `UPLOAD_QUEUE`: unzip + upload files to MinIO
- `LOGS_QUEUE`: increment Redis usage counters from access logs
- `SYNC_QUEUE`: flush counters to PostgreSQL
- `DATABASE_QUEUE`: create tenant PostgreSQL container, register in Supavisor, and persist connection URL

Sync cron is scheduled at startup from `src/server.ts` with BullMQ 6-field cron syntax (`sec min hour day month dayOfWeek`):

- `0 */2 * * * *` (every 2 minutes at second `0`)

## Database and migrations

Drizzle scripts:

```bash
npm run gen   # generate migration files
npm run mig   # apply migrations
npm run push  # push schema directly
```

Schema file: `src/infrastructure/db/schema.ts`

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

## Quick workflow summary

1. Start stack with Docker Compose
2. Create page via `/api/pages/create`
3. Upload ZIP via `/upload/:bucket`
4. Check deployment and usage endpoints
5. Delete page via `/api/pages/:id` when no longer needed
   
## Next implement 
1. Site performance tracking with unlitehouse
2. Site monitoring with umami to track peak time, bandwidth, visitor, region 
