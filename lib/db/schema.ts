import { date, pgTable, text, uuid } from "drizzle-orm/pg-core";


export const pages = pgTable("pages", {
    id: uuid("id").primaryKey().notNull().unique().defaultRandom(),
    tenant_name: text("tenant_name").notNull(),
    plan: text("plan").notNull().default("free"),
    domain: text("domain").notNull(),
    project_name: text('project_name').notNull(),
    createdAt: date("createdAt").defaultNow()
})
