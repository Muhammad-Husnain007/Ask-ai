import { Router } from 'express';
import { handleScannedData } from '../controllers/ai.controller.js';

const router = Router();

// Endpoint: POST /api/v1/ai/scan
router.post('/scan', handleScannedData);

export default router;