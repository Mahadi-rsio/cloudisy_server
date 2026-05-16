import { databaseProvisioningConfig } from '../../config/database.config.js'

interface RegisterTenantPayload {
  tenantId: string
  tenantDatabaseId: string
  databaseName: string
  username: string
  password: string
  host: string
  port: number
}

interface SupavisorRegisterResult {
  poolerId: string
  pooledUrl: string
  directUrl: string
}

function baseHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${databaseProvisioningConfig.supavisorApiToken}`
  }
}

function redactPassword(url: string): string {
  return url.replace(/:(.*?)@/, ':***@')
}

export async function registerSupavisorTenant(payload: RegisterTenantPayload): Promise<SupavisorRegisterResult> {
  if (!databaseProvisioningConfig.supavisorApiUrl || !databaseProvisioningConfig.supavisorApiToken) {
    const pooled = `postgresql://${payload.username}:***@${payload.host}:${payload.port}/${payload.databaseName}`
    return {
      poolerId: `local-${payload.tenantDatabaseId}`,
      pooledUrl: pooled,
      directUrl: pooled
    }
  }

  const response = await fetch(`${databaseProvisioningConfig.supavisorApiUrl}/tenants`, {
    method: 'POST',
    headers: baseHeaders(),
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Supavisor register failed: ${message}`)
  }

  const data = await response.json() as { poolerId?: string, pooledUrl?: string, directUrl?: string }

  return {
    poolerId: data.poolerId || `supavisor-${payload.tenantDatabaseId}`,
    pooledUrl: redactPassword(data.pooledUrl || ''),
    directUrl: redactPassword(data.directUrl || '')
  }
}

export async function updateSupavisorTenant(tenantDatabaseId: string, payload: Record<string, unknown>): Promise<void> {
  if (!databaseProvisioningConfig.supavisorApiUrl || !databaseProvisioningConfig.supavisorApiToken) {
    return
  }

  const response = await fetch(`${databaseProvisioningConfig.supavisorApiUrl}/tenants/${tenantDatabaseId}`, {
    method: 'PATCH',
    headers: baseHeaders(),
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Supavisor update failed: ${message}`)
  }
}

export async function rotateSupavisorTenantCredentials(tenantDatabaseId: string): Promise<void> {
  if (!databaseProvisioningConfig.supavisorApiUrl || !databaseProvisioningConfig.supavisorApiToken) {
    return
  }

  const response = await fetch(`${databaseProvisioningConfig.supavisorApiUrl}/tenants/${tenantDatabaseId}/rotate-credentials`, {
    method: 'POST',
    headers: baseHeaders()
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Supavisor credential rotation failed: ${message}`)
  }
}

export async function revokeSupavisorTenant(tenantDatabaseId: string): Promise<void> {
  if (!databaseProvisioningConfig.supavisorApiUrl || !databaseProvisioningConfig.supavisorApiToken) {
    return
  }

  const response = await fetch(`${databaseProvisioningConfig.supavisorApiUrl}/tenants/${tenantDatabaseId}`, {
    method: 'DELETE',
    headers: baseHeaders()
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Supavisor revoke failed: ${message}`)
  }
}
