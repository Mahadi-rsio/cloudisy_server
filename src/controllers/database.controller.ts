import type { Request, Response } from 'express'
import { queue as DatabaseQueue } from '../queue/jobs/database.job.js'
import {
  createTenantDatabaseSchema,
  deleteTenantDatabaseSchema,
  rotateTenantDatabaseSchema,
  updateTenantDatabaseSchema
} from '../validators/database.validator.js'
import { getTenantDatabaseById, getTenantDatabaseJobByQueueJob, listTenantDatabases } from '../services/database.service.js'

function authTenant(req: Request): { tenantId: string, tenantName: string } | null {
  const tenantId = String((req as any).id || '')
  const tenantName = String((req as any).name || '')
  if (!tenantId || !tenantName) return null
  return { tenantId, tenantName }
}

export async function createTenantDatabaseHandler(req: Request, res: Response) {
  const auth = authTenant(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  const validated = createTenantDatabaseSchema.safeParse(req.body)
  if (!validated.success) {
    return res.status(400).json({ error: validated.error.format() })
  }

  const job = await DatabaseQueue.add('create_tenant_db', {
    tenant_id: auth.tenantId,
    tenant_name: auth.tenantName,
    database_name: validated.data.database_name,
    ram_mb: validated.data.ram_mb,
    storage_mb: validated.data.storage_mb,
    cpu_shares: validated.data.cpu_shares,
    idempotency_key: validated.data.idempotency_key
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 4000 },
    removeOnComplete: 200,
    removeOnFail: 500
  })

  return res.status(202).json({
    status: 'queued',
    operation: 'create_tenant_db',
    jobId: job.id
  })
}

export async function updateTenantDatabaseHandler(req: Request, res: Response) {
  const auth = authTenant(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  const tenantDatabaseId = req.params['id'] as string
  if (!tenantDatabaseId) return res.status(400).json({ error: 'tenant database id required' })

  const validated = updateTenantDatabaseSchema.safeParse(req.body)
  if (!validated.success) {
    return res.status(400).json({ error: validated.error.format() })
  }

  const job = await DatabaseQueue.add('update_tenant_db_config', {
    tenant_database_id: tenantDatabaseId,
    tenant_id: auth.tenantId,
    ram_mb: validated.data.ram_mb,
    storage_mb: validated.data.storage_mb,
    cpu_shares: validated.data.cpu_shares,
    credential_secret_ref: validated.data.credential_secret_ref,
    rotate_credentials: validated.data.rotate_credentials,
    idempotency_key: validated.data.idempotency_key
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 4000 },
    removeOnComplete: 200,
    removeOnFail: 500
  })

  return res.status(202).json({
    status: 'queued',
    operation: 'update_tenant_db_config',
    jobId: job.id
  })
}

export async function deleteTenantDatabaseHandler(req: Request, res: Response) {
  const auth = authTenant(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  const tenantDatabaseId = req.params['id'] as string
  if (!tenantDatabaseId) return res.status(400).json({ error: 'tenant database id required' })

  const validated = deleteTenantDatabaseSchema.safeParse(req.body)
  if (!validated.success) {
    return res.status(400).json({ error: validated.error.format() })
  }

  const job = await DatabaseQueue.add('delete_tenant_db', {
    tenant_database_id: tenantDatabaseId,
    tenant_id: auth.tenantId,
    idempotency_key: validated.data.idempotency_key
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 4000 },
    removeOnComplete: 200,
    removeOnFail: 500
  })

  return res.status(202).json({
    status: 'queued',
    operation: 'delete_tenant_db',
    jobId: job.id
  })
}

export async function rotateTenantDatabaseCredentialsHandler(req: Request, res: Response) {
  const auth = authTenant(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  const tenantDatabaseId = req.params['id'] as string
  if (!tenantDatabaseId) return res.status(400).json({ error: 'tenant database id required' })

  const validated = rotateTenantDatabaseSchema.safeParse(req.body)
  if (!validated.success) {
    return res.status(400).json({ error: validated.error.format() })
  }

  const job = await DatabaseQueue.add('rotate_tenant_db_credentials', {
    tenant_database_id: tenantDatabaseId,
    tenant_id: auth.tenantId,
    idempotency_key: validated.data.idempotency_key
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 4000 },
    removeOnComplete: 200,
    removeOnFail: 500
  })

  return res.status(202).json({
    status: 'queued',
    operation: 'rotate_tenant_db_credentials',
    jobId: job.id
  })
}

export async function getTenantDatabaseHandler(req: Request, res: Response) {
  const auth = authTenant(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  const tenantDatabaseId = req.params['id'] as string
  if (!tenantDatabaseId) return res.status(400).json({ error: 'tenant database id required' })

  const tenantDb = await getTenantDatabaseById(tenantDatabaseId, auth.tenantId)
  if (!tenantDb) return res.status(404).json({ error: 'Not found' })

  return res.json(tenantDb)
}

export async function listTenantDatabaseHandler(req: Request, res: Response) {
  const auth = authTenant(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  const list = await listTenantDatabases(auth.tenantId)
  return res.json(list)
}

export async function getTenantDatabaseJobStatusHandler(req: Request, res: Response) {
  const auth = authTenant(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  const jobId = req.params['jobId'] as string
  if (!jobId) return res.status(400).json({ error: 'job id required' })

  const queueJob = await DatabaseQueue.getJob(jobId)
  if (!queueJob) return res.status(404).json({ error: 'Job not found' })

  if (String((queueJob.data as any).tenant_id || '') !== auth.tenantId) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const state = await queueJob.getState()
  const opLog = await getTenantDatabaseJobByQueueJob(jobId, auth.tenantId)

  return res.json({
    jobId: queueJob.id,
    name: queueJob.name,
    state,
    failedReason: queueJob.failedReason || null,
    operationLog: opLog
  })
}
