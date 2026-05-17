import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.middleware.js'
import {
  createTenantDatabaseHandler,
  deleteTenantDatabaseHandler,
  getTenantDatabaseHandler,
  getTenantDatabaseJobStatusHandler,
  listTenantDatabaseHandler,
  rotateTenantDatabaseCredentialsHandler,
  updateTenantDatabaseHandler
} from '../controllers/database.controller.js'

const router = Router()

router.post('/api/tenant-db', authMiddleware, createTenantDatabaseHandler)
router.get('/api/tenant-db', authMiddleware, listTenantDatabaseHandler)
router.get('/api/tenant-db/:id', authMiddleware, getTenantDatabaseHandler)
router.patch('/api/tenant-db/:id', authMiddleware, updateTenantDatabaseHandler)
router.delete('/api/tenant-db/:id', authMiddleware, deleteTenantDatabaseHandler)
router.post('/api/tenant-db/:id/rotate-credentials', authMiddleware, rotateTenantDatabaseCredentialsHandler)
router.get('/api/tenant-db/jobs/:jobId', authMiddleware, getTenantDatabaseJobStatusHandler)

export default router
