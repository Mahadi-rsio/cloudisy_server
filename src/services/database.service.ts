import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../infrastructure/db/db.js'
import { tenantDatabases, tenantDatabaseJobs } from '../infrastructure/db/schema.js'
import { databaseProvisioningConfig } from '../config/database.config.js'
import {
  createTenantPostgresContainer,
  inspectTenantContainer,
  removeDockerVolume,
  stopAndRemoveTenantContainer,
  updateTenantContainerResources,
  waitForContainerHealthy
} from '../infrastructure/docker/docker.js'
import {
  registerSupavisorTenant,
  revokeSupavisorTenant,
  rotateSupavisorTenantCredentials,
  updateSupavisorTenant
} from '../infrastructure/supavisor/supavisor.js'
import type { CreateTenantDbPayload, DeleteTenantDbPayload, RotateTenantDbPayload, UpdateTenantDbPayload } from '../queue/jobs/database.job.js'

type TenantDbStatus = 'pending_create' | 'active' | 'pending_update' | 'pending_delete' | 'failed' | 'deleted'

function makeLog(operation: string, tenantId: string, stage: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({
    scope: 'tenant-db',
    operation,
    tenantId,
    stage,
    ...(extra || {})
  }))
}

async function createOperationLog(
  tenantDatabaseId: string,
  tenantId: string,
  operation: 'create' | 'update' | 'delete' | 'rotate_credentials',
  idempotencyKey: string,
  payload: unknown,
  queueJobId?: string
) {
  const redactedPayload = JSON.stringify(payload).replace(/("password"\s*:\s*")[^"]+"/gi, '$1***"')

  const existing = await db.select().from(tenantDatabaseJobs).where(and(
    eq(tenantDatabaseJobs.idempotency_key, idempotencyKey),
    eq(tenantDatabaseJobs.tenant_id, tenantId),
    eq(tenantDatabaseJobs.operation, operation)
  )).limit(1)

  if (existing.length > 0) return existing[0]!

  const inserted = await db.insert(tenantDatabaseJobs).values({
    id: randomUUID(),
    tenant_database_id: tenantDatabaseId,
    tenant_id: tenantId,
    operation,
    state: 'queued',
    payload: redactedPayload,
    idempotency_key: idempotencyKey,
    queue_job_id: queueJobId || null
  }).returning()

  return inserted[0]!
}

async function updateOperationState(
  id: string,
  state: 'queued' | 'running' | 'completed' | 'failed',
  stage: string,
  lastError?: string
) {
  await db.update(tenantDatabaseJobs).set({
    state,
    stage,
    last_error: lastError || null,
    updatedAt: new Date()
  }).where(eq(tenantDatabaseJobs.id, id))
}

async function findLatestActiveTenantDbByName(tenantId: string, dbName: string) {
  const rows = await db.select().from(tenantDatabases).where(and(
    eq(tenantDatabases.tenant_id, tenantId),
    eq(tenantDatabases.database_name, dbName),
    isNull(tenantDatabases.deletedAt)
  )).orderBy(desc(tenantDatabases.createdAt)).limit(1)

  return rows[0] || null
}

async function ensureNoInflightOperation(tenantId: string) {
  const inflight = await db.select().from(tenantDatabases).where(and(
    eq(tenantDatabases.tenant_id, tenantId),
    inArray(tenantDatabases.status, ['pending_create', 'pending_update', 'pending_delete']),
    isNull(tenantDatabases.deletedAt)
  )).limit(1)

  if (inflight.length > 0) {
    throw new Error('Another tenant DB operation is already in progress')
  }
}

function makeName(prefix: string, tenantId: string): string {
  const normalized = tenantId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)
  return `${prefix}_${normalized}_${randomUUID().replace(/-/g, '').slice(0, 8)}`
}

function bounded(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

export async function createTenantDatabase(payload: CreateTenantDbPayload, queueJobId?: string) {
  await ensureNoInflightOperation(payload.tenant_id)

  const existingByName = await findLatestActiveTenantDbByName(payload.tenant_id, payload.database_name)
  if (existingByName) {
    throw new Error('Database name already exists for tenant')
  }

  const tenantDbId = randomUUID()
  const containerName = makeName('tenantdb', payload.tenant_id)
  const volumeName = makeName('tenantvol', payload.tenant_id)
  const dbUser = makeName('u', payload.tenant_id)
  const dbPassword = randomUUID().replace(/-/g, '')

  const ramMb = bounded(payload.ram_mb, databaseProvisioningConfig.minRamMb, databaseProvisioningConfig.maxRamMb)
  const storageMb = bounded(payload.storage_mb, databaseProvisioningConfig.minStorageMb, databaseProvisioningConfig.maxStorageMb)
  const cpuShares = payload.cpu_shares

  const inserted = await db.insert(tenantDatabases).values({
    id: tenantDbId,
    tenant_id: payload.tenant_id,
    tenant_name: payload.tenant_name,
    database_name: payload.database_name,
    container_name: containerName,
    status: 'pending_create',
    ram_mb: ramMb,
    storage_mb: storageMb,
    cpu_shares: cpuShares,
    credential_username: dbUser,
    credential_secret_ref: `tenant-db:${tenantDbId}:credentials`,
    last_operation_stage: 'queued'
  }).returning()

  const operationLog = await createOperationLog(tenantDbId, payload.tenant_id, 'create', payload.idempotency_key, {
    tenant_id: payload.tenant_id,
    tenant_database_id: tenantDbId,
    database_name: payload.database_name,
    ram_mb: ramMb,
    storage_mb: storageMb,
    cpu_shares: cpuShares
  }, queueJobId)

  try {
    await updateOperationState(operationLog.id, 'running', 'docker_create')

    makeLog('create', payload.tenant_id, 'docker_create', { tenantDbId })
    const docker = await createTenantPostgresContainer({
      tenantDbId,
      tenantId: payload.tenant_id,
      containerName,
      volumeName,
      dbName: payload.database_name,
      dbUser,
      dbPassword,
      ramMb,
      cpuShares,
      storageMb,
      postgresPort: databaseProvisioningConfig.postgresPort
    })

    await waitForContainerHealthy(docker.containerId)

    await db.update(tenantDatabases).set({
      docker_container_id: docker.containerId,
      docker_volume_id: docker.volumeName,
      host: docker.host,
      port: docker.port,
      last_operation_stage: 'supavisor_register',
      updatedAt: new Date()
    }).where(eq(tenantDatabases.id, tenantDbId))

    makeLog('create', payload.tenant_id, 'supavisor_register', { tenantDbId })
    const supavisor = await registerSupavisorTenant({
      tenantId: payload.tenant_id,
      tenantDatabaseId: tenantDbId,
      databaseName: payload.database_name,
      username: dbUser,
      password: dbPassword,
      host: docker.host,
      port: docker.port
    })

    await db.update(tenantDatabases).set({
      status: 'active',
      supavisor_pooler_id: supavisor.poolerId,
      supavisor_pooled_url: supavisor.pooledUrl,
      supavisor_direct_url: supavisor.directUrl,
      last_error: null,
      last_operation_stage: 'completed',
      updatedAt: new Date()
    }).where(eq(tenantDatabases.id, tenantDbId))

    await updateOperationState(operationLog.id, 'completed', 'completed')
    makeLog('create', payload.tenant_id, 'completed', { tenantDbId })

    return inserted[0]!
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'create operation failed'

    await db.update(tenantDatabases).set({
      status: 'failed',
      last_error: errMessage,
      last_operation_stage: 'failed',
      updatedAt: new Date()
    }).where(eq(tenantDatabases.id, tenantDbId))

    await updateOperationState(operationLog.id, 'failed', 'failed', errMessage)

    const tenantDb = await db.select().from(tenantDatabases).where(eq(tenantDatabases.id, tenantDbId)).limit(1)
    const containerId = tenantDb[0]?.docker_container_id
    const volumeId = tenantDb[0]?.docker_volume_id

    if (containerId) {
      await stopAndRemoveTenantContainer(containerId).catch(() => undefined)
    }

    if (volumeId) {
      await removeDockerVolume(volumeId).catch(() => undefined)
    }

    throw error
  }
}

async function getOwnedTenantDb(tenantDatabaseId: string, tenantId: string) {
  const rows = await db.select().from(tenantDatabases).where(and(
    eq(tenantDatabases.id, tenantDatabaseId),
    eq(tenantDatabases.tenant_id, tenantId)
  )).limit(1)

  if (rows.length === 0) {
    throw new Error('Tenant database not found')
  }

  return rows[0]!
}

export async function updateTenantDatabaseConfig(payload: UpdateTenantDbPayload, queueJobId?: string) {
  await ensureNoInflightOperation(payload.tenant_id)

  const target = await getOwnedTenantDb(payload.tenant_database_id, payload.tenant_id)

  const operationLog = await createOperationLog(target.id, payload.tenant_id, 'update', payload.idempotency_key, {
    tenant_database_id: payload.tenant_database_id,
    ram_mb: payload.ram_mb,
    storage_mb: payload.storage_mb,
    cpu_shares: payload.cpu_shares,
    rotate_credentials: payload.rotate_credentials ?? false
  }, queueJobId)

  try {
    await updateOperationState(operationLog.id, 'running', 'updating')

    const ramMb = payload.ram_mb
      ? bounded(payload.ram_mb, databaseProvisioningConfig.minRamMb, databaseProvisioningConfig.maxRamMb)
      : target.ram_mb

    const storageMb = payload.storage_mb
      ? bounded(payload.storage_mb, databaseProvisioningConfig.minStorageMb, databaseProvisioningConfig.maxStorageMb)
      : target.storage_mb

    const cpuShares = payload.cpu_shares || target.cpu_shares

    await db.update(tenantDatabases).set({
      status: 'pending_update',
      last_operation_stage: 'container_update',
      updatedAt: new Date()
    }).where(eq(tenantDatabases.id, target.id))

    if (target.docker_container_id) {
      await updateTenantContainerResources(target.docker_container_id, ramMb, cpuShares)
    }

    await updateSupavisorTenant(target.id, {
      ram_mb: ramMb,
      storage_mb: storageMb,
      cpu_shares: cpuShares,
      credential_secret_ref: payload.credential_secret_ref || target.credential_secret_ref
    })

    if (payload.rotate_credentials) {
      await rotateSupavisorTenantCredentials(target.id)
    }

    await db.update(tenantDatabases).set({
      status: 'active',
      ram_mb: ramMb,
      storage_mb: storageMb,
      cpu_shares: cpuShares,
      credential_secret_ref: payload.credential_secret_ref || target.credential_secret_ref,
      credential_rotated_at: payload.rotate_credentials ? new Date() : target.credential_rotated_at,
      last_error: null,
      last_operation_stage: 'completed',
      updatedAt: new Date()
    }).where(eq(tenantDatabases.id, target.id))

    await updateOperationState(operationLog.id, 'completed', 'completed')
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'update operation failed'

    await db.update(tenantDatabases).set({
      status: 'failed',
      last_error: errMessage,
      last_operation_stage: 'failed',
      updatedAt: new Date()
    }).where(eq(tenantDatabases.id, target.id))

    await updateOperationState(operationLog.id, 'failed', 'failed', errMessage)
    throw error
  }
}

export async function deleteTenantDatabase(payload: DeleteTenantDbPayload, queueJobId?: string) {
  await ensureNoInflightOperation(payload.tenant_id)

  const target = await getOwnedTenantDb(payload.tenant_database_id, payload.tenant_id)

  const operationLog = await createOperationLog(target.id, payload.tenant_id, 'delete', payload.idempotency_key, {
    tenant_database_id: payload.tenant_database_id
  }, queueJobId)

  try {
    await updateOperationState(operationLog.id, 'running', 'deleting')

    await db.update(tenantDatabases).set({
      status: 'pending_delete',
      last_operation_stage: 'supavisor_revoke',
      updatedAt: new Date()
    }).where(eq(tenantDatabases.id, target.id))

    await revokeSupavisorTenant(target.id).catch(() => undefined)

    if (target.docker_container_id) {
      await stopAndRemoveTenantContainer(target.docker_container_id)
    }

    if (target.docker_volume_id) {
      await removeDockerVolume(target.docker_volume_id)
    }

    await db.update(tenantDatabases).set({
      status: 'deleted',
      credential_secret_ref: null,
      supavisor_pooled_url: null,
      supavisor_direct_url: null,
      docker_container_id: null,
      docker_volume_id: null,
      last_error: null,
      last_operation_stage: 'completed',
      deletedAt: new Date(),
      updatedAt: new Date()
    }).where(eq(tenantDatabases.id, target.id))

    await updateOperationState(operationLog.id, 'completed', 'completed')
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'delete operation failed'

    await db.update(tenantDatabases).set({
      status: 'failed',
      last_error: errMessage,
      last_operation_stage: 'failed',
      updatedAt: new Date()
    }).where(eq(tenantDatabases.id, target.id))

    await updateOperationState(operationLog.id, 'failed', 'failed', errMessage)
    throw error
  }
}

export async function rotateTenantDatabaseCredentials(payload: RotateTenantDbPayload, queueJobId?: string) {
  await ensureNoInflightOperation(payload.tenant_id)

  const target = await getOwnedTenantDb(payload.tenant_database_id, payload.tenant_id)

  const operationLog = await createOperationLog(target.id, payload.tenant_id, 'rotate_credentials', payload.idempotency_key, {
    tenant_database_id: payload.tenant_database_id
  }, queueJobId)

  try {
    await updateOperationState(operationLog.id, 'running', 'rotating_credentials')

    await rotateSupavisorTenantCredentials(target.id)

    await db.update(tenantDatabases).set({
      credential_rotated_at: new Date(),
      last_error: null,
      last_operation_stage: 'completed',
      updatedAt: new Date()
    }).where(eq(tenantDatabases.id, target.id))

    await updateOperationState(operationLog.id, 'completed', 'completed')
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'rotate credentials operation failed'

    await db.update(tenantDatabases).set({
      status: 'failed',
      last_error: errMessage,
      last_operation_stage: 'failed',
      updatedAt: new Date()
    }).where(eq(tenantDatabases.id, target.id))

    await updateOperationState(operationLog.id, 'failed', 'failed', errMessage)
    throw error
  }
}

export async function getTenantDatabaseById(tenantDatabaseId: string, tenantId: string) {
  const rows = await db.select().from(tenantDatabases).where(and(
    eq(tenantDatabases.id, tenantDatabaseId),
    eq(tenantDatabases.tenant_id, tenantId)
  )).limit(1)

  if (rows.length === 0) return null

  const row = rows[0]!

  const inspect = row.docker_container_id
    ? await inspectTenantContainer(row.docker_container_id).catch(() => null)
    : null

  return {
    ...row,
    credential_secret_ref: row.credential_secret_ref,
    docker_inspect: inspect
  }
}

export async function getTenantDatabaseJobByQueueJob(queueJobId: string, tenantId: string) {
  const rows = await db.select().from(tenantDatabaseJobs).where(and(
    eq(tenantDatabaseJobs.queue_job_id, queueJobId),
    eq(tenantDatabaseJobs.tenant_id, tenantId)
  )).orderBy(desc(tenantDatabaseJobs.createdAt)).limit(1)

  if (rows.length === 0) return null

  return rows[0]!
}

export async function listTenantDatabases(tenantId: string) {
  return db.select({
    id: tenantDatabases.id,
    tenant_id: tenantDatabases.tenant_id,
    tenant_name: tenantDatabases.tenant_name,
    database_name: tenantDatabases.database_name,
    status: tenantDatabases.status,
    ram_mb: tenantDatabases.ram_mb,
    storage_mb: tenantDatabases.storage_mb,
    cpu_shares: tenantDatabases.cpu_shares,
    supavisor_pooler_id: tenantDatabases.supavisor_pooler_id,
    supavisor_pooled_url: tenantDatabases.supavisor_pooled_url,
    supavisor_direct_url: tenantDatabases.supavisor_direct_url,
    container_name: tenantDatabases.container_name,
    host: tenantDatabases.host,
    port: tenantDatabases.port,
    credential_username: tenantDatabases.credential_username,
    credential_rotated_at: tenantDatabases.credential_rotated_at,
    credential_secret_ref: tenantDatabases.credential_secret_ref,
    last_error: tenantDatabases.last_error,
    last_operation_stage: tenantDatabases.last_operation_stage,
    deletedAt: tenantDatabases.deletedAt,
    createdAt: tenantDatabases.createdAt,
    updatedAt: tenantDatabases.updatedAt
  }).from(tenantDatabases)
    .where(and(eq(tenantDatabases.tenant_id, tenantId), isNull(tenantDatabases.deletedAt)))
    .orderBy(sql`${tenantDatabases.createdAt} desc`)
}
