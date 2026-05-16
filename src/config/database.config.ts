import 'dotenv/config'

function toInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const databaseProvisioningConfig = {
  dockerSocketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock',
  dockerNetwork: process.env.DOCKER_NETWORK || 'bridge',
  dockerImage: process.env.TENANT_DB_IMAGE || 'postgres:16-alpine',
  postgresPort: toInt(process.env.TENANT_DB_PORT, 5432),
  defaultRamMb: toInt(process.env.TENANT_DB_DEFAULT_RAM_MB, 512),
  defaultCpuShares: toInt(process.env.TENANT_DB_DEFAULT_CPU_SHARES, 512),
  minRamMb: toInt(process.env.TENANT_DB_MIN_RAM_MB, 256),
  maxRamMb: toInt(process.env.TENANT_DB_MAX_RAM_MB, 8192),
  minStorageMb: toInt(process.env.TENANT_DB_MIN_STORAGE_MB, 512),
  maxStorageMb: toInt(process.env.TENANT_DB_MAX_STORAGE_MB, 102400),
  supavisorApiUrl: process.env.SUPAVISOR_API_URL || '',
  supavisorApiToken: process.env.SUPAVISOR_API_TOKEN || ''
}

export function validateDatabaseProvisioningEnv() {
  const missing: string[] = []

  if (!databaseProvisioningConfig.supavisorApiUrl) {
    missing.push('SUPAVISOR_API_URL')
  }

  if (!databaseProvisioningConfig.supavisorApiToken) {
    missing.push('SUPAVISOR_API_TOKEN')
  }

  if (missing.length > 0) {
    console.warn(`[tenant-db] Missing optional provisioning env(s): ${missing.join(', ')}`)
  }
}
