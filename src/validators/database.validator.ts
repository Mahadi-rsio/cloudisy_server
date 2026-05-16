import { z } from 'zod'

const idempotencySchema = z.string().min(8).max(128)

export const createTenantDatabaseSchema = z.object({
  database_name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{2,62}$/),
  ram_mb: z.number().int().min(256).max(8192).default(512),
  storage_mb: z.number().int().min(512).max(102400).default(5120),
  cpu_shares: z.number().int().min(128).max(4096).default(512),
  idempotency_key: idempotencySchema
})

export const updateTenantDatabaseSchema = z.object({
  ram_mb: z.number().int().min(256).max(8192).optional(),
  storage_mb: z.number().int().min(512).max(102400).optional(),
  cpu_shares: z.number().int().min(128).max(4096).optional(),
  credential_secret_ref: z.string().min(3).max(256).optional(),
  rotate_credentials: z.boolean().optional().default(false),
  idempotency_key: idempotencySchema
}).refine((data) => (
  data.ram_mb !== undefined ||
  data.storage_mb !== undefined ||
  data.cpu_shares !== undefined ||
  data.credential_secret_ref !== undefined ||
  data.rotate_credentials === true
), {
  message: 'Provide at least one updatable field'
})

export const deleteTenantDatabaseSchema = z.object({
  idempotency_key: idempotencySchema
})

export const rotateTenantDatabaseSchema = z.object({
  idempotency_key: idempotencySchema
})

export type CreateTenantDatabaseInput = z.infer<typeof createTenantDatabaseSchema>
export type UpdateTenantDatabaseInput = z.infer<typeof updateTenantDatabaseSchema>
export type DeleteTenantDatabaseInput = z.infer<typeof deleteTenantDatabaseSchema>
export type RotateTenantDatabaseInput = z.infer<typeof rotateTenantDatabaseSchema>
