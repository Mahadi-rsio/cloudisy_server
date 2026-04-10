import type { Request, Response } from 'express'
import { z } from 'zod'
import { db } from '../../../lib/db/db.js'
import { pages } from '../../../lib/db/schema.js'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import axios from 'axios'

const createPageSchema = z.object({
    tenant_name: z.string().min(1),
    plan: z.string().min(1),
    project_name: z.string().min(1)
})

const CADDY_ADMIN = 'http://localhost:2019'

export async function createPage(req: Request, res: Response) {
    const validate = createPageSchema.safeParse(req.body)
    if (!validate.success) {
        return res.status(400).json({ error: validate.error.format() })
    }

    let { tenant_name, plan, project_name } = validate.data

    try {
        const existing = await db.select().from(pages).where(eq(pages.project_name, project_name))
        if (existing.length > 0) {
            project_name = `${project_name}-${nanoid(4)}`.toLowerCase()
        }

        const domain = `${project_name}.cloudisy.top`

        await axios.post(
            `${CADDY_ADMIN}/config/apps/http/servers/srv0/routes`,
            {
                match: [{ host: [domain] }],
                handle: [{
                    handler: "static_response",
                    body: `Welcome to ${project_name} on Cloudisy!`
                }],
                terminal: true
            },
            {
                headers: { 'Content-Type': 'application/json' }
            }
        )

        const insert = await db.insert(pages).values({
            tenant_name,
            plan,
            project_name,
            domain
        }).returning()

        return res.json(insert[0])

    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}
