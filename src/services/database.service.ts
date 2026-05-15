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
    const routerName = `managedpg${seed}`
    const serviceName = `managedpgsvc${seed}`

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

    try {
        const containerId = await createManagedPostgresContainer({
            containerName,
            volumeName,
            dbName,
            dbUser,
            dbPassword: password,
            ramMb: data.ram,
            externalPort,
            networkName: MANAGED_DB_NETWORK,
            image: MANAGED_DB_DEFAULT_IMAGE,
            routerName,
            serviceName
        })

        const updated = await db.update(managedDatabases)
            .set({
                container_id: containerId,
                status: 'running',
                updatedAt: new Date()
            })
            .where(eq(managedDatabases.id, record.id))
            .returning()

        return toApiModel(updated[0]!)
    } catch (error) {
        await removeManagedPostgresContainer(containerName, volumeName).catch(() => {})

        await db.update(managedDatabases)
            .set({
                status: 'failed',
                updatedAt: new Date()
            })
            .where(eq(managedDatabases.id, record.id))

        throw error
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

    try {
        await updateManagedPostgresRam(current.container_name, patch.ram)

        const updated = await db.update(managedDatabases)
            .set({
                ram_mb: patch.ram,
                status: 'running',
                updatedAt: new Date()
            })
            .where(eq(managedDatabases.id, id))
            .returning()

        return toApiModel(updated[0]!)
    } catch (error) {
        await db.update(managedDatabases)
            .set({ status: 'failed', updatedAt: new Date() })
            .where(eq(managedDatabases.id, id))

        throw error
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

    const current = rows[0]!

    await db.update(managedDatabases)
        .set({ status: 'deleting', updatedAt: new Date() })
        .where(eq(managedDatabases.id, current.id))

    await removeManagedPostgresContainer(current.container_name, current.volume_name)

    await db.update(managedDatabases)
        .set({ status: 'deleted', updatedAt: new Date() })
        .where(eq(managedDatabases.id, current.id))

    return { success: true, id: current.id }
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
