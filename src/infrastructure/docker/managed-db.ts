import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function runDocker(args: string[]) {
    try {
        const { stdout } = await execFileAsync('docker', args, { maxBuffer: 10 * 1024 * 1024 })
        return stdout.trim()
    } catch (error: any) {
        const stderr = error?.stderr ? String(error.stderr).trim() : ''
        const message = stderr || error?.message || 'docker command failed'
        throw new Error(message)
    }
}

export type CreateManagedDbContainerArgs = {
    containerName: string
    volumeName: string
    dbName: string
    dbUser: string
    dbPassword: string
    ramMb: number
    externalPort: number
    networkName: string
    image: string
    routerName: string
    serviceName: string
}

export async function createManagedPostgresContainer(args: CreateManagedDbContainerArgs) {
    await runDocker(['volume', 'create', args.volumeName])

    await runDocker(['rm', '-f', args.containerName]).catch(() => {})

    const dockerArgs = [
        'run', '-d',
        '--name', args.containerName,
        '--restart', 'unless-stopped',
        '--network', args.networkName,
        '--memory', `${args.ramMb}m`,
        '-e', `POSTGRES_DB=${args.dbName}`,
        '-e', `POSTGRES_USER=${args.dbUser}`,
        '-e', `POSTGRES_PASSWORD=${args.dbPassword}`,
        '-v', `${args.volumeName}:/var/lib/postgresql/data`,
        '--label', 'traefik.enable=true',
        '--label', `traefik.docker.network=${args.networkName}`,
        '--label', `traefik.tcp.routers.${args.routerName}.entrypoints=pg${args.externalPort}`,
        '--label', `traefik.tcp.routers.${args.routerName}.rule=HostSNI(\`*\`)`,
        '--label', `traefik.tcp.routers.${args.routerName}.service=${args.serviceName}`,
        '--label', `traefik.tcp.services.${args.serviceName}.loadbalancer.server.port=5432`,
        args.image
    ]

    const containerId = await runDocker(dockerArgs)
    return containerId
}

export async function updateManagedPostgresRam(containerName: string, ramMb: number) {
    await runDocker(['update', '--memory', `${ramMb}m`, containerName])
}

export async function removeManagedPostgresContainer(containerName: string, volumeName: string) {
    await runDocker(['rm', '-f', containerName]).catch(() => {})
    await runDocker(['volume', 'rm', volumeName]).catch(() => {})
}

export async function isManagedContainerRunning(containerName: string) {
    try {
        const output = await runDocker(['inspect', '-f', '{{.State.Running}}', containerName])
        return output === 'true'
    } catch {
        return false
    }
}
