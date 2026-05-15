import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.middleware.js'
import {
    createManagedDatabaseHandler,
    deleteManagedDatabaseHandler,
    getManagedDatabaseByIdHandler,
    getManagedDatabaseOperationStatusHandler,
    listManagedDatabasesHandler,
    updateManagedDatabaseHandler
} from '../controllers/database.controller.js'

const router = Router()

router.post('/api/databases', authMiddleware, createManagedDatabaseHandler)
router.get('/api/databases', authMiddleware, listManagedDatabasesHandler)
router.get('/api/databases/:id', authMiddleware, getManagedDatabaseByIdHandler)
router.patch('/api/databases/:id', authMiddleware, updateManagedDatabaseHandler)
router.delete('/api/databases/:id', authMiddleware, deleteManagedDatabaseHandler)
router.get('/api/databases/operations/:jobId', authMiddleware, getManagedDatabaseOperationStatusHandler)

export default router
