import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const addCartItemSchema = z.object({
  body: z.object({
    productId: objectId,
    quantity: z.number().int().min(1).max(99).optional().default(1),
  }),
});

export const updateCartItemSchema = z.object({
  params: z.object({ productId: objectId }),
  body: z.object({
    quantity: z.number().int().min(1).max(99),
  }),
});

export const cartItemIdSchema = z.object({
  params: z.object({ productId: objectId }),
});
