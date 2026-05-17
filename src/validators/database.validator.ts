import { z } from 'zod'

export const createDatabaseSchema = z.object({
    username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
    ram: z.number().int().min(256).max(16384),
    cpu: z.number().min(0.25).max(8),
})

export type CreateDatabaseInput = z.infer<typeof createDatabaseSchema>
