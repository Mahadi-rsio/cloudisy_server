import { Queue } from 'bullmq'
import { connection } from '../../infrastructure/cache/redis.js'

export const DATABASE_QUEUE = 'DATABASE_QUEUE'

export type DatabaseJobType = 'create_tenant_db' | 'update_tenant_db_config' | 'delete_tenant_db' | 'rotate_tenant_db_credentials'

export interface CreateTenantDbPayload {
  tenant_id: string
  tenant_name: string
  database_name: string
  cpu_shares: number
  ram_mb: number
  storage_mb: number
  idempotency_key: string
}

export interface UpdateTenantDbPayload {
  tenant_database_id: string
  tenant_id: string
  ram_mb?: number
  storage_mb?: number
  cpu_shares?: number
  credential_secret_ref?: string
  rotate_credentials?: boolean
  idempotency_key: string
}

export interface DeleteTenantDbPayload {
  tenant_database_id: string
  tenant_id: string
  idempotency_key: string
}

export interface RotateTenantDbPayload {
  tenant_database_id: string
  tenant_id: string
  idempotency_key: string
}

export type DatabaseJobData = CreateTenantDbPayload | UpdateTenantDbPayload | DeleteTenantDbPayload | RotateTenantDbPayload

export const queue = new Queue<DatabaseJobData>(DATABASE_QUEUE, { connection })
