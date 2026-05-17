import type { Request, Response } from 'express'
import { queue as DatabaseQueue } from '../queue/jobs/database.job.js'
import { createDatabaseSchema } from '../validators/database.validator.js'
import { enqueueDatabaseProvisioning, getDatabaseProvisioningByJob } from '../services/database.service.js'

export async function createDatabaseHandler(req: Request, res: Response) {
    const parsed = createDatabaseSchema.safeParse(req.body)

    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() })
    }

    const tenantId = (req as any).id as string | undefined
    if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' })
    }

    const cpuMilli = Math.round(parsed.data.cpu * 1000)

    try {
        const result = await enqueueDatabaseProvisioning({
            tenantId,
            username: parsed.data.username,
            ramMb: parsed.data.ram,
            cpuMilli,
        })

        return res.status(202).json({
            jobId: result.jobId,
            status: result.status,
            created: result.created,
        })
    } catch (error) {
        console.error('createDatabaseHandler failed:', error)
        return res.status(500).json({ error: 'Failed to queue database provisioning' })
    }
}

export async function getDatabaseProvisioningStatusHandler(req: Request, res: Response) {
    const jobId = req.params['jobId'] as string
    const tenantId = (req as any).id as string | undefined

    if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' })
    }

    if (!jobId) {
        return res.status(400).json({ error: 'jobId is required' })
    }

    try {
        const provisioning = await getDatabaseProvisioningByJob({ jobId, tenantId })

        if (!provisioning) {
            return res.status(404).json({ error: 'Job not found' })
        }

        const job = await DatabaseQueue.getJob(jobId)
        const queueState = job ? await job.getState() : null

        return res.json({
            jobId,
            queueState,
            status: provisioning.status,
            username: provisioning.username,
            ram: provisioning.ram_mb,
            cpu: provisioning.cpu_milli / 1000,
            connectionUrl: provisioning.connection_url,
            error: provisioning.error_message,
            createdAt: provisioning.createdAt,
            updatedAt: provisioning.updatedAt,
        })
    } catch (error) {
        console.error('getDatabaseProvisioningStatusHandler failed:', error)
        return res.status(500).json({ error: 'Failed to fetch job status' })
    }
}
