import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { create, getById, list, patch, remove } from './product.controller.js';
import { createProductSchema, listProductSchema, productIdSchema, updateProductSchema } from './product.validation.js';

export const productRouter = Router();

productRouter.get('/', validate(listProductSchema), list);
productRouter.get('/:id', validate(productIdSchema), getById);
productRouter.post('/', requireAuth, requireRole('admin'), validate(createProductSchema), create);
productRouter.patch('/:id', requireAuth, requireRole('admin'), validate(updateProductSchema), patch);
productRouter.delete('/:id', requireAuth, requireRole('admin'), validate(productIdSchema), remove);
