import { Worker } from 'bullmq'
import { connection } from '../../infrastructure/cache/redis.js'
import { DATABASE_QUEUE, type CreateTenantDbPayload, type DeleteTenantDbPayload, type UpdateTenantDbPayload, type RotateTenantDbPayload } from '../jobs/database.job.js'
import {
  createTenantDatabase,
  deleteTenantDatabase,
  rotateTenantDatabaseCredentials,
  updateTenantDatabaseConfig
} from '../../services/database.service.js'

const databaseWorker = new Worker(DATABASE_QUEUE, async (job) => {
  const queueJobId = String(job.id)

  if (job.name === 'create_tenant_db') {
    await createTenantDatabase(job.data as CreateTenantDbPayload, queueJobId)
    return
  }

  if (job.name === 'update_tenant_db_config') {
    await updateTenantDatabaseConfig(job.data as UpdateTenantDbPayload, queueJobId)
    return
  }

  if (job.name === 'delete_tenant_db') {
    await deleteTenantDatabase(job.data as DeleteTenantDbPayload, queueJobId)
    return
  }

  if (job.name === 'rotate_tenant_db_credentials') {
    await rotateTenantDatabaseCredentials(job.data as RotateTenantDbPayload, queueJobId)
    return
  }

  throw new Error(`Unsupported database job name: ${job.name}`)
}, {
  connection,
  concurrency: 1
})

databaseWorker.on('completed', async (job) => {
  console.log(`[tenant-db] completed job=${job.id} name=${job.name}`)
})

databaseWorker.on('failed', async (job, err) => {
  console.error(`[tenant-db] failed job=${job?.id} name=${job?.name} error=${err.message}`)
})

console.log('database worker running...')
