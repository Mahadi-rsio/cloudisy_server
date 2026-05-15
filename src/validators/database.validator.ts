import { z } from 'zod'
import {
    MANAGED_DB_MAX_RAM_MB,
    MANAGED_DB_MAX_STORAGE_MB,
    MANAGED_DB_MIN_RAM_MB,
    MANAGED_DB_MIN_STORAGE_MB
} from '../constants/index.js'

const dbIdentifier = z.string()
    .min(3)
    .max(63)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'must start with letter and contain only letters, numbers, underscore')

export const createManagedDatabaseSchema = z.object({
    user_name: dbIdentifier,
    database_name: dbIdentifier,
    storage: z.number().int().min(MANAGED_DB_MIN_STORAGE_MB).max(MANAGED_DB_MAX_STORAGE_MB),
    ram: z.number().int().min(MANAGED_DB_MIN_RAM_MB).max(MANAGED_DB_MAX_RAM_MB)
})

export const updateManagedDatabaseSchema = z.object({
    ram: z.number().int().min(MANAGED_DB_MIN_RAM_MB).max(MANAGED_DB_MAX_RAM_MB).optional(),
    storage: z.number().int().optional(),
    user_name: z.string().optional(),
    database_name: z.string().optional()
}).refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided'
})

export type CreateManagedDatabaseInput = z.infer<typeof createManagedDatabaseSchema>
export type UpdateManagedDatabaseInput = z.infer<typeof updateManagedDatabaseSchema>
