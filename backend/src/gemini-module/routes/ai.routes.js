import { Router } from 'express';
import { handleAssistantTurn } from '../controllers/ai.controller.js';

const router = Router();

router.post('/scan', handleAssistantTurn);

export default router;
