import type { Request, Response } from 'express'
import {
    createManagedDatabase,
    deleteManagedDatabase,
    getManagedDatabaseById,
    listManagedDatabases,
    updateManagedDatabase
} from '../services/database.service.js'
import { createManagedDatabaseSchema, updateManagedDatabaseSchema } from '../validators/database.validator.js'

export async function createManagedDatabaseHandler(req: Request, res: Response) {
    const parsed = createManagedDatabaseSchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() })
    }

    try {
        const result = await createManagedDatabase(parsed.data, {
            tenant_id: (req as any).id,
            tenant_name: (req as any).name
        })

        if ('error' in result) {
            return res.status(400).json(result)
        }

        return res.status(201).json(result)
    } catch (error) {
        console.error(error)
        return res.status(500).json({ error: 'Failed to create managed database' })
    }
}

export async function listManagedDatabasesHandler(req: Request, res: Response) {
    const tenantId = (req as any).id as string | undefined
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' })

    try {
        const result = await listManagedDatabases(tenantId)
        return res.json(result)
    } catch (error) {
        console.error(error)
        return res.status(500).json({ error: 'Failed to list managed databases' })
    }
}

export async function getManagedDatabaseByIdHandler(req: Request, res: Response) {
    const tenantId = (req as any).id as string | undefined
    const id = req.params['id'] as string | undefined

    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' })
    if (!id) return res.status(400).json({ error: 'Database ID is required' })

    try {
        const result = await getManagedDatabaseById(id, tenantId)
        if (!result) return res.status(404).json({ error: 'Managed database not found' })

        return res.json(result)
    } catch (error) {
        console.error(error)
        return res.status(500).json({ error: 'Failed to get managed database' })
    }
}

export async function updateManagedDatabaseHandler(req: Request, res: Response) {
    const tenantId = (req as any).id as string | undefined
    const id = req.params['id'] as string | undefined

    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' })
    if (!id) return res.status(400).json({ error: 'Database ID is required' })

    const parsed = updateManagedDatabaseSchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() })
    }

    try {
        const result = await updateManagedDatabase(id, tenantId, parsed.data)

        if ('error' in result) {
            const status = result.error.includes('not found') ? 404 : 400
            return res.status(status).json(result)
        }

        return res.json(result)
    } catch (error) {
        console.error(error)
        return res.status(500).json({ error: 'Failed to update managed database' })
    }
}

export async function deleteManagedDatabaseHandler(req: Request, res: Response) {
    const tenantId = (req as any).id as string | undefined
    const id = req.params['id'] as string | undefined

    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' })
    if (!id) return res.status(400).json({ error: 'Database ID is required' })

    try {
        const result = await deleteManagedDatabase(id, tenantId)

        if ('error' in result) {
            const status = result.error.includes('not found') ? 404 : 400
            return res.status(status).json(result)
        }

        return res.json(result)
    } catch (error) {
        console.error(error)
        return res.status(500).json({ error: 'Failed to delete managed database' })
    }
}
