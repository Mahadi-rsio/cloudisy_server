CREATE TABLE IF NOT EXISTS "database_provisionings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "username" text NOT NULL,
  "ram_mb" integer NOT NULL,
  "cpu_milli" integer NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "container_name" text,
  "database_name" text,
  "database_user" text,
  "database_password" text,
  "supavisor_tenant" text,
  "connection_url" text,
  "error_message" text,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "database_provisionings_job_id_idx"
ON "database_provisionings" ("job_id");

CREATE INDEX IF NOT EXISTS "database_provisionings_tenant_id_idx"
ON "database_provisionings" ("tenant_id");
