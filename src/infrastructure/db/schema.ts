import { bigint, boolean, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
})

export const managedDatabaseStatusEnum = pgEnum('managed_database_status', [
    'creating',
    'running',
    'updating',
    'failed',
    'deleting',
    'deleted'
])

export const managedDatabases = pgTable('managed_databases', {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    tenant_id: text('tenant_id').notNull(),
    tenant_name: text('tenant_name').notNull(),

    db_name: text('db_name').notNull(),
    db_user: text('db_user').notNull(),
    db_password: text('db_password').notNull(),

    ram_mb: integer('ram_mb').notNull(),
    storage_mb: integer('storage_mb').notNull(),

    container_name: text('container_name').notNull(),
    container_id: text('container_id'),
    volume_name: text('volume_name').notNull(),
    network_name: text('network_name').notNull(),

    external_host: text('external_host').notNull(),
    external_port: integer('external_port').notNull(),
    external_url: text('external_url').notNull(),
    ssl_enabled: boolean('ssl_enabled').notNull().default(false),

    status: managedDatabaseStatusEnum('status').notNull().default('creating'),

    createdAt: timestamp('createdAt').defaultNow().notNull(),
    updatedAt: timestamp('updatedAt').defaultNow().notNull()
})
