import { Queue } from 'bullmq'
import { connection } from '../../infrastructure/cache/redis.js'

export const DATABASE_QUEUE = 'DATABASE_QUEUE'

export interface DatabaseJobData {
    provisioningId: string
}

export const queue = new Queue<DatabaseJobData>(DATABASE_QUEUE, { connection })
