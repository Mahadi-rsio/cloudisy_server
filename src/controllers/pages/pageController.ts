import type { Request, Response } from 'express'
import { z } from 'zod'
import { db } from '../../../lib/db/db.js'
import { pages } from '../../../lib/db/schema.js'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { createPageBucket } from './minio.js'
import { addCustomDomain } from './../../../lib/caddy.js'
import { log } from 'node:console'

const createPageSchema = z.object({
    tenant_name: z.string().min(1),
    plan: z.string().min(1),
    project_name: z.string().min(1)
})

const TOP_LEVEL_DOMAIN = 'localhost:80'

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



        const domain = `${project_name}.${TOP_LEVEL_DOMAIN}`

        const insert = await db.insert(pages).values({
            tenant_name,
            plan,
            project_name,
            domain
        }).returning()

        await createPageBucket(project_name)

        addCustomDomain({
            tenantId: insert[0]?.id!,
            projectName: insert[0]?.project_name!,
            customDomain: insert[0]?.domain!
        })

        log(`Added Domain ${insert[0]?.domain}`)



        return res.json(insert[0])

    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Internal Server Error" })
    }
}
