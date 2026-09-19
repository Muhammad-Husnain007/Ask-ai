import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(2).max(80),
    description: z.string().max(400).optional(),
  }),
});

export const updateCategorySchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    name: z.string().min(2).max(80).optional(),
    description: z.string().max(400).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const categoryIdSchema = z.object({
  params: z.object({ id: objectId }),
});
