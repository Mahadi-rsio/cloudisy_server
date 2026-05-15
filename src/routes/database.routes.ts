import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.middleware.js'
import {
    createManagedDatabaseHandler,
    deleteManagedDatabaseHandler,
    getManagedDatabaseByIdHandler,
    listManagedDatabasesHandler,
    updateManagedDatabaseHandler
} from '../controllers/database.controller.js'

const router = Router()

router.post('/api/databases', authMiddleware, createManagedDatabaseHandler)
router.get('/api/databases', authMiddleware, listManagedDatabasesHandler)
router.get('/api/databases/:id', authMiddleware, getManagedDatabaseByIdHandler)
router.patch('/api/databases/:id', authMiddleware, updateManagedDatabaseHandler)
router.delete('/api/databases/:id', authMiddleware, deleteManagedDatabaseHandler)

export default router
