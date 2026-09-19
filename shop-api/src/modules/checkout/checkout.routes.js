import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { confirm, create, getById } from './checkout.controller.js';
import { checkoutIdSchema, confirmCheckoutSchema, createCheckoutSchema } from './checkout.validation.js';

export const checkoutRouter = Router();

checkoutRouter.use(requireAuth);
checkoutRouter.post('/', validate(createCheckoutSchema), create);
checkoutRouter.get('/:id', validate(checkoutIdSchema), getById);
checkoutRouter.post('/:id/confirm', validate(confirmCheckoutSchema), confirm);
