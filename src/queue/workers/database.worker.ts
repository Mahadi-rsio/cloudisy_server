import { Job, Worker } from 'bullmq'
import { connection } from '../../infrastructure/cache/redis.js'
import { DATABASE_QUEUE, type DatabaseJobData } from '../jobs/database.job.js'
import {
    processManagedDatabaseCreate,
    processManagedDatabaseDelete,
    processManagedDatabaseRamUpdate
} from '../../services/database.service.js'

const databaseWorker = new Worker<DatabaseJobData>(DATABASE_QUEUE,
    async (job: Job<DatabaseJobData>) => {
        if (job.data.action === 'create') {
            await processManagedDatabaseCreate(job.data.databaseId)
            return { success: true }
        }

        if (job.data.action === 'update_ram') {
            if (job.data.ram === undefined) {
                throw new Error('RAM value is required for update action')
            }
            await processManagedDatabaseRamUpdate(job.data.databaseId, job.data.ram)
            return { success: true }
        }

        if (job.data.action === 'delete') {
            await processManagedDatabaseDelete(job.data.databaseId)
            return { success: true }
        }

        throw new Error('Unknown database action')
    },
    { connection, concurrency: 2 }
)

databaseWorker.on('completed', async (job) => {
    console.log(`Managed database job completed: ${job.id}`)
})

databaseWorker.on('failed', async (job, error) => {
    console.error(`Managed database job failed: ${job?.id}`, error)
})

console.log('database worker running')
