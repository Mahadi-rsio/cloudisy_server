import { bigint, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";


export const pages = pgTable("pages", {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    tenant_id: text('tenant_id').notNull(),
    tenant_name: text("tenant_name").notNull(),
    plan: text("plan").notNull().default("free"),
    domain: text("domain").notNull(),
    project_name: text('project_name').notNull(),

    request: bigint("request", { mode: 'number' }).notNull().default(0),
    request_limit: bigint("request_limit", { mode: 'number' }).notNull().default(100000),

    bandwidth_usage: bigint("bandwidth_usage", { mode: "number" }).notNull().default(0),

    // 2 GB limit (in bytes)
    bandwidth_limit: bigint("bandwidth_limit", { mode: 'number' })
        .notNull()
        .default(2147483648),

    createdAt: timestamp("createdAt").defaultNow().notNull()
});

export const tenantDatabases = pgTable('tenant_databases', {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    tenant_id: text('tenant_id').notNull(),
    tenant_name: text('tenant_name').notNull(),
    database_name: text('database_name').notNull(),
    container_name: text('container_name').notNull(),
    status: text('status').notNull().default('pending_create'),

    ram_mb: integer('ram_mb').notNull().default(512),
    storage_mb: integer('storage_mb').notNull().default(5120),
    cpu_shares: integer('cpu_shares').notNull().default(512),

    credential_username: text('credential_username').notNull(),
    credential_secret_ref: text('credential_secret_ref'),
    credential_rotated_at: timestamp('credential_rotated_at'),

    supavisor_pooler_id: text('supavisor_pooler_id'),
    supavisor_pooled_url: text('supavisor_pooled_url'),
    supavisor_direct_url: text('supavisor_direct_url'),

    docker_container_id: text('docker_container_id'),
    docker_volume_id: text('docker_volume_id'),
    host: text('host'),
    port: integer('port'),

    last_error: text('last_error'),
    last_operation_stage: text('last_operation_stage').notNull().default('queued'),

    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
    updatedAt: timestamp('updatedAt').defaultNow().notNull()
})

export const tenantDatabaseJobs = pgTable('tenant_database_jobs', {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    tenant_database_id: uuid('tenant_database_id').notNull(),
    tenant_id: text('tenant_id').notNull(),
    operation: text('operation').notNull(),
    state: text('state').notNull().default('queued'),
    stage: text('stage').notNull().default('queued'),
    payload: text('payload'),
    idempotency_key: text('idempotency_key').notNull(),
    queue_job_id: text('queue_job_id'),
    last_error: text('last_error'),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
    updatedAt: timestamp('updatedAt').defaultNow().notNull()
})
