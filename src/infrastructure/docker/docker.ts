import Docker from 'dockerode'
import { databaseProvisioningConfig } from '../../config/database.config.js'

const docker = new Docker({ socketPath: databaseProvisioningConfig.dockerSocketPath })

export interface TenantContainerConfig {
  tenantDbId: string
  tenantId: string
  containerName: string
  volumeName: string
  dbName: string
  dbUser: string
  dbPassword: string
  ramMb: number
  cpuShares: number
  storageMb: number
  postgresPort: number
}

export interface DockerProvisionResult {
  containerId: string
  volumeName: string
  host: string
  port: number
}

function toBytes(megabytes: number): number {
  return megabytes * 1024 * 1024
}

export async function createDockerVolume(volumeName: string): Promise<string> {
  await docker.createVolume({ Name: volumeName })
  return volumeName
}

export async function removeDockerVolume(volumeName: string): Promise<void> {
  const volume = docker.getVolume(volumeName)
  await volume.remove({ force: true })
}

export async function createTenantPostgresContainer(cfg: TenantContainerConfig): Promise<DockerProvisionResult> {
  await createDockerVolume(cfg.volumeName)

  const container = await docker.createContainer({
    Image: databaseProvisioningConfig.dockerImage,
    name: cfg.containerName,
    Env: [
      `POSTGRES_DB=${cfg.dbName}`,
      `POSTGRES_USER=${cfg.dbUser}`,
      `POSTGRES_PASSWORD=${cfg.dbPassword}`
    ],
    HostConfig: {
      CpuShares: cfg.cpuShares,
      Memory: toBytes(cfg.ramMb),
      NetworkMode: databaseProvisioningConfig.dockerNetwork,
      Binds: [`${cfg.volumeName}:/var/lib/postgresql/data`],
      RestartPolicy : {
        Name : 'unless-stopped'
      } 
    },
    ExposedPorts: {
      '5432/tcp': {}
    },
    Labels: {
      'cloudisy.tenant_id': cfg.tenantId,
      'cloudisy.tenant_db_id': cfg.tenantDbId
    }
  })

  await container.start()

  return {
    containerId: container.id,
    volumeName: cfg.volumeName,
    host: cfg.containerName,
    port: cfg.postgresPort
  }
}

export async function stopAndRemoveTenantContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId)

  try {
    await container.stop({ t: 10 })
  } catch {
    // ignore stop failures for already stopped containers
  }

  await container.remove({ force: true })
}

export async function waitForContainerHealthy(containerId: string, timeoutMs = 30_000): Promise<void> {
  const container = docker.getContainer(containerId)
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const inspect = await container.inspect()
    if (inspect.State.Running) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error('Tenant DB container failed to become healthy in time')
}

export async function inspectTenantContainer(containerId: string): Promise<Record<string, unknown>> {
  const container = docker.getContainer(containerId)
  const inspect = await container.inspect()
  return {
    id: inspect.Id,
    name: inspect.Name,
    state: inspect.State.Status,
    running: inspect.State.Running,
    memoryLimit: inspect.HostConfig.Memory,
    cpuShares: inspect.HostConfig.CpuShares
  }
}

export async function updateTenantContainerResources(containerId: string, ramMb: number, cpuShares: number): Promise<void> {
  const container = docker.getContainer(containerId)
  await container.update({
    Memory: toBytes(ramMb),
    CpuShares: cpuShares
  })
}
