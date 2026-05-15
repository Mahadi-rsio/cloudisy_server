import { Queue } from 'bullmq'
import { connection } from '../../infrastructure/cache/redis.js'

export const DATABASE_QUEUE = 'DATABASE_QUEUE'

export type DatabaseAction = 'create' | 'update_ram' | 'delete'

export interface DatabaseJobData {
    action: DatabaseAction
    databaseId: string
    tenantId: string
    ram?: number
}

export const queue = new Queue<DatabaseJobData>(DATABASE_QUEUE, { connection })
