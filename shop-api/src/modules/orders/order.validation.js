import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const listOrderSchema = z.object({
  query: z.object({
    status: z.enum(['placed', 'paid', 'packed', 'shipped', 'delivered', 'cancelled']).optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

export const orderIdSchema = z.object({
  params: z.object({ id: objectId }),
});

export const updateOrderSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(['placed', 'paid', 'packed', 'shipped', 'delivered', 'cancelled']),
  }),
});
