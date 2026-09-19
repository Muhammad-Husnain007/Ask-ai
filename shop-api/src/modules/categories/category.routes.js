import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { create, getById, list, patch, remove } from './category.controller.js';
import { categoryIdSchema, createCategorySchema, updateCategorySchema } from './category.validation.js';

export const categoryRouter = Router();

categoryRouter.get('/', list);
categoryRouter.get('/:id', validate(categoryIdSchema), getById);
categoryRouter.post('/', requireAuth, requireRole('admin'), validate(createCategorySchema), create);
categoryRouter.patch('/:id', requireAuth, requireRole('admin'), validate(updateCategorySchema), patch);
categoryRouter.delete('/:id', requireAuth, requireRole('admin'), validate(categoryIdSchema), remove);
