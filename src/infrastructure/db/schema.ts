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

export const databaseProvisionings = pgTable('database_provisionings', {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    job_id: text('job_id').notNull(),
    tenant_id: text('tenant_id').notNull(),
    username: text('username').notNull(),
    ram_mb: integer('ram_mb').notNull(),
    cpu_milli: integer('cpu_milli').notNull(),
    status: text('status').notNull().default('queued'),
    container_name: text('container_name'),
    database_name: text('database_name'),
    database_user: text('database_user'),
    database_password: text('database_password'),
    supavisor_tenant: text('supavisor_tenant'),
    connection_url: text('connection_url'),
    error_message: text('error_message'),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
    updatedAt: timestamp('updatedAt').defaultNow().notNull()
})
