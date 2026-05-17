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
    'Accept': 'application/json',
    Authorization: `Bearer ${databaseProvisioningConfig.supavisorApiToken}`
  }
}

// PUT /api/tenants/:tenantId — add or update
export async function registerSupavisorTenant(payload: RegisterTenantPayload): Promise<SupavisorRegisterResult> {
  if (!databaseProvisioningConfig.supavisorApiUrl || !databaseProvisioningConfig.supavisorApiToken) {
    const pooled = `postgresql://${payload.username}.${payload.tenantDatabaseId}:${payload.password}@localhost:6543/${payload.databaseName}`
    const direct = `postgresql://${payload.username}:${payload.password}@${payload.host}:${payload.port}/${payload.databaseName}`
    return {
      poolerId: `local-${payload.tenantDatabaseId}`,
      pooledUrl: pooled,
      directUrl: direct
    }
  }

  // correct endpoint from docs: PUT /api/tenants/:tenantId
  const response = await fetch(
    `${databaseProvisioningConfig.supavisorApiUrl}/api/tenants/${payload.tenantDatabaseId}`,
    {
      method: 'PUT',
      headers: baseHeaders(),
      body: JSON.stringify({
        tenant: {
          db_host: payload.host,
          db_port: payload.port,
          db_database: payload.databaseName,
          ip_version: 'auto',
          enforce_ssl: false,
          require_user: true,
          users: [
            {
              db_user: payload.username,
              db_password: payload.password,
              pool_size: 10,
              mode_type: 'transaction',
              is_manager: true
            }
          ]
        }
      })
    }
  )

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Supavisor register failed: ${message}`)
  }

  // build connection URLs
  // format from docs: username.tenantId @ host:6543
  const host = databaseProvisioningConfig.supavisorPublicHost || 'localhost'
  const pooledUrl = `postgresql://${payload.username}.${payload.tenantDatabaseId}:${payload.password}@${host}:6543/${payload.databaseName}?sslmode=disable`
  const directUrl = `postgresql://${payload.username}:${payload.password}@${payload.host}:${payload.port}/${payload.databaseName}`

  return {
    poolerId: payload.tenantDatabaseId,
    pooledUrl,
    directUrl
  }
}

// DELETE /api/tenants/:tenantId
export async function revokeSupavisorTenant(tenantDatabaseId: string): Promise<void> {
  if (!databaseProvisioningConfig.supavisorApiUrl || !databaseProvisioningConfig.supavisorApiToken) {
    return
  }

  const response = await fetch(
    `${databaseProvisioningConfig.supavisorApiUrl}/api/tenants/${tenantDatabaseId}`,
    {
      method: 'DELETE',
      headers: baseHeaders()
    }
  )

  if (!response.ok && response.status !== 404) {
    const message = await response.text()
    throw new Error(`Supavisor revoke failed: ${message}`)
  }
}

// PUT /api/tenants/:tenantId — same endpoint, just update fields
export async function updateSupavisorTenant(tenantDatabaseId: string, payload: Record<string, unknown>): Promise<void> {
  if (!databaseProvisioningConfig.supavisorApiUrl || !databaseProvisioningConfig.supavisorApiToken) {
    return
  }

  const response = await fetch(
    `${databaseProvisioningConfig.supavisorApiUrl}/api/tenants/${tenantDatabaseId}`,
    {
      method: 'PUT',
      headers: baseHeaders(),
      body: JSON.stringify({ tenant: payload })
    }
  )

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Supavisor update failed: ${message}`)
  }
}

// rotate credentials — update user password via PUT
export async function rotateSupavisorTenantCredentials(tenantDatabaseId: string): Promise<void> {
  if (!databaseProvisioningConfig.supavisorApiUrl || !databaseProvisioningConfig.supavisorApiToken) {
    return
  }

  // supavisor has no dedicated rotate endpoint
  // re-PUT the tenant with a new password
  // you need to generate new password and update your DB too — handle in service layer
  throw new Error('rotateSupavisorTenantCredentials: implement new password generation in service layer first')
}
