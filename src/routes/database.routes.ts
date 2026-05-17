import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { createDatabaseHandler, getDatabaseProvisioningStatusHandler } from '../controllers/database.controller.js'

const router = Router()

router.post('/api/databases', authMiddleware, createDatabaseHandler)
router.get('/api/databases/status/:jobId', authMiddleware, getDatabaseProvisioningStatusHandler)

export default router
