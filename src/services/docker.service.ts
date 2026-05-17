import Docker from 'dockerode'
import { Client } from 'pg'

const docker = new Docker({
    socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock'
})

const POSTGRES_IMAGE = process.env.POSTGRES_IMAGE || 'postgres:16-alpine'

export type EnsurePostgresContainerInput = {
    containerName: string
    dbUser: string
    dbPassword: string
    dbName: string
    ramMb: number
    cpuMilli: number
}

export async function ensurePostgresContainer(input: EnsurePostgresContainerInput) {
    const networkName = process.env.DATABASE_CONTAINER_NETWORK || 'cloudisy_server_default'

    const existing = docker.getContainer(input.containerName)

    try {
        const inspect = await existing.inspect()
        if (!inspect.State?.Running) {
            await existing.start()
        }
        return existing
    } catch (error: any) {
        if (error?.statusCode !== 404) {
            throw error
        }
    }

    const container = await docker.createContainer({
        name: input.containerName,
        Image: POSTGRES_IMAGE,
        Env: [
            `POSTGRES_USER=${input.dbUser}`,
            `POSTGRES_PASSWORD=${input.dbPassword}`,
            `POSTGRES_DB=${input.dbName}`,
        ],
        ExposedPorts: {
            '5432/tcp': {}
        },
        HostConfig: {
            Memory: input.ramMb * 1024 * 1024,
            NanoCpus: input.cpuMilli * 1_000_000,
            NetworkMode: networkName,
            RestartPolicy: { Name: 'unless-stopped' }
        },
    })

    await container.start()

    return container
}

export async function waitForPostgresReady({
    host,
    port,
    user,
    password,
    database,
    timeoutMs = 90_000,
}: {
    host: string
    port: number
    user: string
    password: string
    database: string
    timeoutMs?: number
}) {
    const startedAt = Date.now()

    while ((Date.now() - startedAt) < timeoutMs) {
        const client = new Client({
            host,
            port,
            user,
            password,
            database,
            connectionTimeoutMillis: 3000,
        })

        try {
            await client.connect()
            await client.end()
            return
        } catch {
            await client.end().catch(() => undefined)
            await new Promise(resolve => setTimeout(resolve, 2000))
        }
    }

    throw new Error(`PostgreSQL container ${host} did not become ready in time`)
}

export async function cleanupContainer(containerName: string) {
    const container = docker.getContainer(containerName)

    try {
        const inspect = await container.inspect()
        if (inspect.State?.Running) {
            await container.stop({ t: 5 })
        }
        await container.remove({ force: true })
    } catch (error: any) {
        if (error?.statusCode !== 404) {
            throw error
        }
    }
}
