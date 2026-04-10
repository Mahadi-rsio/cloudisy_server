import type { Request, Response } from 'express'
import { z } from 'zod'
import { db } from '../../../lib/db/db.js'
import { pages } from '../../../lib/db/schema.js'

const createPageSchema = z.object({
    tenant_name: z.string().min(1),
    plan: z.string().min(1),
    domain: z.string().min(1),
    project_name: z.string().min(1)
})

export async function createPage(req: Request, res: Response) {
    const body = req.body

    const validate = createPageSchema.safeParse(body)

    if (!validate.success) {
        return res.status(400).json({
            error: validate.error.format()
        })
    }

    const { tenant_name, plan, domain, project_name } = validate.data

    try {

        const insert = await db.insert(pages).values({
            tenant_name: tenant_name,
            plan: plan,
            domain: domain,
            project_name: project_name
        }).returning()

        return res.json(insert[0])
    } catch (err) {
        console.log(err);

    }
}


