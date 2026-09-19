import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const createProductSchema = z.object({
  body: z.object({
    title: z.string().min(2).max(160),
    sku: z.string().min(2).max(40),
    description: z.string().max(4000).optional(),
    price: z.number().nonnegative(),
    currency: z.string().length(3).optional(),
    stock: z.number().int().nonnegative().optional(),
    category: objectId,
    images: z.array(z.string().url()).max(8).optional(),
  }),
});

export const updateProductSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    title: z.string().min(2).max(160).optional(),
    sku: z.string().min(2).max(40).optional(),
    description: z.string().max(4000).optional(),
    price: z.number().nonnegative().optional(),
    currency: z.string().length(3).optional(),
    stock: z.number().int().nonnegative().optional(),
    category: objectId.optional(),
    images: z.array(z.string().url()).max(8).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const productIdSchema = z.object({
  params: z.object({ id: objectId }),
});

export const listProductSchema = z.object({
  query: z.object({
    q: z.string().optional(),
    category: objectId.optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});
