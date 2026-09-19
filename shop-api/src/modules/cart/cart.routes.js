import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { addItem, clear, getCart, patchItem, removeItem } from './cart.controller.js';
import { addCartItemSchema, cartItemIdSchema, updateCartItemSchema } from './cart.validation.js';

export const cartRouter = Router();

cartRouter.use(requireAuth);
cartRouter.get('/', getCart);
cartRouter.post('/items', validate(addCartItemSchema), addItem);
cartRouter.patch('/items/:productId', validate(updateCartItemSchema), patchItem);
cartRouter.delete('/items/:productId', validate(cartItemIdSchema), removeItem);
cartRouter.delete('/', clear);
