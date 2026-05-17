CREATE TABLE IF NOT EXISTS tenant_databases (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  tenant_name text NOT NULL,
  database_name text NOT NULL,
  container_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending_create',
  ram_mb integer NOT NULL DEFAULT 512,
  storage_mb integer NOT NULL DEFAULT 5120,
  cpu_shares integer NOT NULL DEFAULT 512,
  credential_username text NOT NULL,
  credential_secret_ref text,
  credential_rotated_at timestamp,
  supavisor_pooler_id text,
  supavisor_pooled_url text,
  supavisor_direct_url text,
  docker_container_id text,
  docker_volume_id text,
  host text,
  port integer,
  last_error text,
  last_operation_stage text NOT NULL DEFAULT 'queued',
  deleted_at timestamp,
  createdAt timestamp NOT NULL DEFAULT now(),
  updatedAt timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_databases_tenant_id ON tenant_databases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_databases_status ON tenant_databases(status);

CREATE TABLE IF NOT EXISTS tenant_database_jobs (
  id uuid PRIMARY KEY,
  tenant_database_id uuid NOT NULL,
  tenant_id text NOT NULL,
  operation text NOT NULL,
  state text NOT NULL DEFAULT 'queued',
  stage text NOT NULL DEFAULT 'queued',
  payload text,
  idempotency_key text NOT NULL,
  queue_job_id text,
  last_error text,
  createdAt timestamp NOT NULL DEFAULT now(),
  updatedAt timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_database_jobs_tenant_id ON tenant_database_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_database_jobs_queue_job_id ON tenant_database_jobs(queue_job_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_database_jobs_idempotency ON tenant_database_jobs(tenant_id, operation, idempotency_key);
