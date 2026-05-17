import { Worker } from 'bullmq'
import { type DatabaseJobData, DATABASE_QUEUE } from '../jobs/database.job.js'
import { processDatabaseProvisioning } from '../../services/database.service.js'
import { connection } from '../../infrastructure/cache/redis.js'

const worker = new Worker<DatabaseJobData>(DATABASE_QUEUE, async (job) => {
    console.log(`Processing database job ${job.id}...`)
    return processDatabaseProvisioning(job.data.provisioningId)
}, { connection, concurrency: 1 })

worker.on('completed', (job) => {
    console.log(`Database job ${job?.id} completed`)
})

worker.on('failed', (job, err) => {
    console.error(`Database job ${job?.id} failed:`, err)
})

console.log('database worker running...')
