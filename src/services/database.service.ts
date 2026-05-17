import { createHash, randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'
import { db } from '../infrastructure/db/db.js'
import { databaseProvisionings } from '../infrastructure/db/schema.js'
import { queue as DatabaseQueue } from '../queue/jobs/database.job.js'
import { cleanupContainer, ensurePostgresContainer, waitForPostgresReady } from './docker.service.js'
import { buildSupavisorConnectionUrl, registerSupavisorTenant } from './supavisor.service.js'

function normalizeUsername(rawUsername: string) {
    const normalized = rawUsername.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24)
    if (!normalized) {
        throw new Error('username is invalid after normalization')
    }
    return normalized
}

function buildStableJobId({
    tenantId,
    username,
    ramMb,
    cpuMilli,
}: {
    tenantId: string
    username: string
    ramMb: number
    cpuMilli: number
}) {
    const digest = createHash('sha256')
        .update(`${tenantId}:${username}:${ramMb}:${cpuMilli}`)
        .digest('hex')
        .slice(0, 24)

    return `db-${digest}`
}

function buildResourceNames(username: string, provisioningId: string) {
    const suffix = provisioningId.replace(/-/g, '').slice(0, 8)
    const base = normalizeUsername(username)

    const databaseUser = `${base}_${suffix}`.slice(0, 30)
    const databaseName = `db_${base}_${suffix}`.slice(0, 40)
    const containerName = `pg_${base}_${suffix}`.slice(0, 50)
    const supavisorTenant = `tenant_${base}_${suffix}`.slice(0, 50)

    return { databaseUser, databaseName, containerName, supavisorTenant }
}

export async function enqueueDatabaseProvisioning({
    tenantId,
    username,
    ramMb,
    cpuMilli,
}: {
    tenantId: string
    username: string
    ramMb: number
    cpuMilli: number
}) {
    const normalizedUsername = normalizeUsername(username)

    const jobId = buildStableJobId({
        tenantId,
        username: normalizedUsername,
        ramMb,
        cpuMilli,
    })

    const existing = await db.select().from(databaseProvisionings)
        .where(eq(databaseProvisionings.job_id, jobId))
        .limit(1)

    if (existing.length) {
        return {
            jobId,
            status: existing[0]!.status,
            created: false,
            provisioning: existing[0]!,
        }
    }

    const inserted = await db.insert(databaseProvisionings).values({
        job_id: jobId,
        tenant_id: tenantId,
        username: normalizedUsername,
        ram_mb: ramMb,
        cpu_milli: cpuMilli,
        status: 'queued',
    }).returning()

    const provisioning = inserted[0]!

    await DatabaseQueue.add('provision-database', {
        provisioningId: provisioning.id,
    }, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: false,
        removeOnFail: false,
    })

    return {
        jobId,
        status: 'queued',
        created: true,
        provisioning,
    }
}

export async function getDatabaseProvisioningByJob({
    jobId,
    tenantId,
}: {
    jobId: string
    tenantId: string
}) {
    const rows = await db.select().from(databaseProvisionings)
        .where(and(
            eq(databaseProvisionings.job_id, jobId),
            eq(databaseProvisionings.tenant_id, tenantId)
        ))
        .limit(1)

    return rows[0] || null
}

export async function processDatabaseProvisioning(provisioningId: string) {
    const rows = await db.select().from(databaseProvisionings)
        .where(eq(databaseProvisionings.id, provisioningId))
        .limit(1)

    if (!rows.length) {
        throw new Error(`Provisioning record ${provisioningId} not found`)
    }

    const record = rows[0]!

    if (record.status === 'ready' && record.connection_url) {
        return {
            connectionUrl: record.connection_url,
            provisioningId: record.id,
        }
    }

    const names = buildResourceNames(record.username, record.id)
    const databasePassword = randomBytes(16).toString('hex')

    await db.update(databaseProvisionings)
        .set({
            status: 'provisioning',
            container_name: names.containerName,
            database_name: names.databaseName,
            database_user: names.databaseUser,
            database_password: databasePassword,
            supavisor_tenant: names.supavisorTenant,
            error_message: null,
            updatedAt: new Date(),
        })
        .where(eq(databaseProvisionings.id, record.id))

    try {
        await ensurePostgresContainer({
            containerName: names.containerName,
            dbUser: names.databaseUser,
            dbPassword: databasePassword,
            dbName: names.databaseName,
            ramMb: record.ram_mb,
            cpuMilli: record.cpu_milli,
        })

        await waitForPostgresReady({
            host: names.containerName,
            port: 5432,
            user: names.databaseUser,
            password: databasePassword,
            database: names.databaseName,
            timeoutMs: Number(process.env.DATABASE_READY_TIMEOUT_MS || 90_000),
        })

        await registerSupavisorTenant({
            tenant: names.supavisorTenant,
            dbHost: names.containerName,
            dbPort: 5432,
            dbDatabase: names.databaseName,
            dbUser: names.databaseUser,
            dbPassword: databasePassword,
        })

        const connectionUrl = buildSupavisorConnectionUrl({
            dbName: names.databaseName,
            dbUser: names.databaseUser,
            dbPassword: databasePassword,
        })

        await db.update(databaseProvisionings)
            .set({
                status: 'ready',
                connection_url: connectionUrl,
                error_message: null,
                updatedAt: new Date(),
            })
            .where(eq(databaseProvisionings.id, record.id))

        return {
            connectionUrl,
            provisioningId: record.id,
        }
    } catch (error: any) {
        await cleanupContainer(names.containerName).catch(() => undefined)

        await db.update(databaseProvisionings)
            .set({
                status: 'failed',
                error_message: error?.message || 'Unknown provisioning error',
                updatedAt: new Date(),
            })
            .where(eq(databaseProvisionings.id, record.id))

        throw error
    }
}
