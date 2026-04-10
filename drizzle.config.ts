import { defineConfig } from 'drizzle-kit'
import 'dotenv/config'

export default defineConfig({
    schema: "./lib/db/schema.ts",
    dialect: "postgresql",
    out: "./drizzle",
    dbCredentials: {
        url: process.env.DB!
    }
})
