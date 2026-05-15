import { randomBytes } from 'node:crypto'
import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import { db } from '../infrastructure/db/db.js'
import { managedDatabases } from '../infrastructure/db/schema.js'
import {
    createManagedPostgresContainer,
    isManagedContainerRunning,
    removeManagedPostgresContainer,
    updateManagedPostgresRam
} from '../infrastructure/docker/managed-db.js'
import {
    MANAGED_DB_DEFAULT_IMAGE,
    MANAGED_DB_EXTERNAL_HOST,
    MANAGED_DB_NETWORK,
    MANAGED_DB_PORT_END,
    MANAGED_DB_PORT_START
} from '../constants/index.js'
import type { CreateManagedDatabaseInput, UpdateManagedDatabaseInput } from '../validators/database.validator.js'
import { queue as DatabaseQueue } from '../queue/jobs/database.job.js'

function sanitizeName(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9_]/g, '_')
}

function generatePassword() {
    return randomBytes(18).toString('base64url')
}

function buildConnectionUrl({ user, password, host, port, dbName }: {
    user: string
    password: string
    host: string
    port: number
    dbName: string
}) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(dbName)}?sslmode=disable`
}

function deriveTraefikNames(containerName: string) {
    const seed = containerName.replace(/^managed-pg-/, '')
    return {
        routerName: `managedpg${seed}`,
        serviceName: `managedpgsvc${seed}`
    }
}

async function allocatePort() {
    const usedRows = await db.select({ port: managedDatabases.external_port })
        .from(managedDatabases)
        .where(ne(managedDatabases.status, 'deleted'))

    const used = new Set(usedRows.map((row) => row.port))

    for (let port = MANAGED_DB_PORT_START; port <= MANAGED_DB_PORT_END; port++) {
        if (!used.has(port)) return port
    }

    throw new Error('No external database ports available')
}

function toApiModel(record: typeof managedDatabases.$inferSelect) {
    return {
        id: record.id,
        tenant_id: record.tenant_id,
        tenant_name: record.tenant_name,
        database_name: record.db_name,
        user_name: record.db_user,
        storage_mb: record.storage_mb,
        ram_mb: record.ram_mb,
        external_host: record.external_host,
        external_port: record.external_port,
        external_url: record.external_url,
        ssl_enabled: record.ssl_enabled,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
    }
}

async function getManagedDatabaseRecord(id: string) {
    const rows = await db.select().from(managedDatabases)
        .where(eq(managedDatabases.id, id))
        .limit(1)

    return rows[0] || null
}

export async function createManagedDatabase(data: CreateManagedDatabaseInput, reqHeader: { tenant_name: string, tenant_id: string }) {
    if (!reqHeader.tenant_id || !reqHeader.tenant_name) {
        return { error: 'token is not valid' }
    }

    const dbName = sanitizeName(data.database_name)
    const dbUser = sanitizeName(data.user_name)

    const existing = await db.select({ id: managedDatabases.id })
        .from(managedDatabases)
        .where(and(
            eq(managedDatabases.tenant_id, reqHeader.tenant_id),
            eq(managedDatabases.db_name, dbName),
            ne(managedDatabases.status, 'deleted')
        ))
        .limit(1)

    if (existing.length) {
        return { error: 'Database name already exists for this tenant' }
    }

    const externalPort = await allocatePort()
    const password = generatePassword()

    const seed = randomBytes(6).toString('hex')
    const containerName = `managed-pg-${seed}`
    const volumeName = `managed-pg-vol-${seed}`

    const externalUrl = buildConnectionUrl({
        user: dbUser,
        password,
        host: MANAGED_DB_EXTERNAL_HOST,
        port: externalPort,
        dbName
    })

    const inserted = await db.insert(managedDatabases).values({
        tenant_id: reqHeader.tenant_id,
        tenant_name: reqHeader.tenant_name,
        db_name: dbName,
        db_user: dbUser,
        db_password: password,
        ram_mb: data.ram,
        storage_mb: data.storage,
        container_name: containerName,
        volume_name: volumeName,
        network_name: MANAGED_DB_NETWORK,
        external_host: MANAGED_DB_EXTERNAL_HOST,
        external_port: externalPort,
        external_url: externalUrl,
        ssl_enabled: false,
        status: 'creating'
    }).returning()

    const record = inserted[0]!

    const job = await DatabaseQueue.add('db-create', {
        action: 'create',
        databaseId: record.id,
        tenantId: reqHeader.tenant_id
    }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
    })

    return {
        ...toApiModel(record),
        operation_job_id: job.id
    }
}

export async function listManagedDatabases(tenantId: string) {
    const rows = await db.select().from(managedDatabases)
        .where(and(
            eq(managedDatabases.tenant_id, tenantId),
            ne(managedDatabases.status, 'deleted')
        ))
        .orderBy(asc(managedDatabases.createdAt))

    return rows.map(toApiModel)
}

export async function getManagedDatabaseById(id: string, tenantId: string) {
    const rows = await db.select().from(managedDatabases)
        .where(and(
            eq(managedDatabases.id, id),
            eq(managedDatabases.tenant_id, tenantId),
            ne(managedDatabases.status, 'deleted')
        ))
        .limit(1)

    if (!rows.length) return null
    return toApiModel(rows[0]!)
}

export async function updateManagedDatabase(id: string, tenantId: string, patch: UpdateManagedDatabaseInput) {
    if (patch.storage !== undefined || patch.user_name !== undefined || patch.database_name !== undefined) {
        return {
            error: 'Updating storage, user_name, or database_name is not supported in v1. Only ram is supported.'
        }
    }

    const rows = await db.select().from(managedDatabases)
        .where(and(
            eq(managedDatabases.id, id),
            eq(managedDatabases.tenant_id, tenantId),
            ne(managedDatabases.status, 'deleted')
        ))
        .limit(1)

    if (!rows.length) {
        return { error: 'Managed database not found' }
    }

    const current = rows[0]!

    if (patch.ram === undefined || patch.ram === current.ram_mb) {
        return toApiModel(current)
    }

    await db.update(managedDatabases)
        .set({ status: 'updating', updatedAt: new Date() })
        .where(eq(managedDatabases.id, id))

    const job = await DatabaseQueue.add('db-update-ram', {
        action: 'update_ram',
        databaseId: id,
        tenantId,
        ram: patch.ram
    }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
    })

    const refreshedRows = await db.select().from(managedDatabases)
        .where(eq(managedDatabases.id, id))
        .limit(1)

    const refreshed = refreshedRows[0]!

    return {
        ...toApiModel(refreshed),
        operation_job_id: job.id
    }
}

export async function deleteManagedDatabase(id: string, tenantId: string) {
    const rows = await db.select().from(managedDatabases)
        .where(and(
            eq(managedDatabases.id, id),
            eq(managedDatabases.tenant_id, tenantId),
            ne(managedDatabases.status, 'deleted')
        ))
        .limit(1)

    if (!rows.length) {
        return { error: 'Managed database not found' }
    }

    await db.update(managedDatabases)
        .set({ status: 'deleting', updatedAt: new Date() })
        .where(eq(managedDatabases.id, id))

    const job = await DatabaseQueue.add('db-delete', {
        action: 'delete',
        databaseId: id,
        tenantId
    }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
    })

    return { success: true, id, status: 'deleting', operation_job_id: job.id }
}

export async function getManagedDatabaseOperationStatus(jobId: string, tenantId: string) {
    const job = await DatabaseQueue.getJob(jobId)
    if (!job) {
        return { error: 'Job not found' }
    }

    if (job.data.tenantId !== tenantId) {
        return { error: 'Forbidden' }
    }

    const state = await job.getState()

    return {
        jobId: job.id,
        databaseId: job.data.databaseId,
        action: job.data.action,
        state,
        failedReason: job.failedReason || null,
        result: job.returnvalue || null
    }
}

export async function processManagedDatabaseCreate(databaseId: string) {
    const record = await getManagedDatabaseRecord(databaseId)
    if (!record || record.status === 'deleted') return

    const { routerName, serviceName } = deriveTraefikNames(record.container_name)

    try {
        const containerId = await createManagedPostgresContainer({
            containerName: record.container_name,
            volumeName: record.volume_name,
            dbName: record.db_name,
            dbUser: record.db_user,
            dbPassword: record.db_password,
            ramMb: record.ram_mb,
            externalPort: record.external_port,
            networkName: record.network_name,
            image: MANAGED_DB_DEFAULT_IMAGE,
            routerName,
            serviceName
        })

        await db.update(managedDatabases)
            .set({
                container_id: containerId,
                status: 'running',
                updatedAt: new Date()
            })
            .where(eq(managedDatabases.id, record.id))
    } catch (error) {
        await db.update(managedDatabases)
            .set({ status: 'failed', updatedAt: new Date() })
            .where(eq(managedDatabases.id, record.id))
        throw error
    }
}

export async function processManagedDatabaseRamUpdate(databaseId: string, ramMb: number) {
    const record = await getManagedDatabaseRecord(databaseId)
    if (!record || record.status === 'deleted') return

    try {
        await updateManagedPostgresRam(record.container_name, ramMb)

        await db.update(managedDatabases)
            .set({
                ram_mb: ramMb,
                status: 'running',
                updatedAt: new Date()
            })
            .where(eq(managedDatabases.id, record.id))
    } catch (error) {
        await db.update(managedDatabases)
            .set({ status: 'failed', updatedAt: new Date() })
            .where(eq(managedDatabases.id, record.id))

        throw error
    }
}

export async function processManagedDatabaseDelete(databaseId: string) {
    const record = await getManagedDatabaseRecord(databaseId)
    if (!record || record.status === 'deleted') return

    try {
        await removeManagedPostgresContainer(record.container_name, record.volume_name)

        await db.update(managedDatabases)
            .set({ status: 'deleted', updatedAt: new Date() })
            .where(eq(managedDatabases.id, record.id))
    } catch (error) {
        await db.update(managedDatabases)
            .set({ status: 'failed', updatedAt: new Date() })
            .where(eq(managedDatabases.id, record.id))

        throw error
    }
}

export async function reconcileManagedDatabases() {
    const rows = await db.select().from(managedDatabases)
        .where(inArray(managedDatabases.status, ['creating', 'running', 'updating', 'failed']))

    for (const row of rows) {
        const isRunning = await isManagedContainerRunning(row.container_name)

        if (isRunning && row.status !== 'running') {
            await db.update(managedDatabases)
                .set({ status: 'running', updatedAt: new Date() })
                .where(eq(managedDatabases.id, row.id))
            continue
        }

        if (!isRunning && row.status === 'running') {
            await db.update(managedDatabases)
                .set({ status: 'failed', updatedAt: new Date() })
                .where(eq(managedDatabases.id, row.id))
        }
    }
}
