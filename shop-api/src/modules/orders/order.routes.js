import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { cancel, getById, list, patch } from './order.controller.js';
import { listOrderSchema, orderIdSchema, updateOrderSchema } from './order.validation.js';

export const orderRouter = Router();

orderRouter.use(requireAuth);
orderRouter.get('/', validate(listOrderSchema), list);
orderRouter.get('/:id', validate(orderIdSchema), getById);
orderRouter.patch('/:id', requireRole('admin'), validate(updateOrderSchema), patch);
orderRouter.post('/:id/cancel', validate(orderIdSchema), cancel);
