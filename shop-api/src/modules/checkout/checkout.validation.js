import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const address = z.object({
  fullName: z.string().min(2).max(80),
  line1: z.string().min(3).max(160),
  line2: z.string().max(160).optional(),
  city: z.string().min(2).max(80),
  region: z.string().max(80).optional(),
  postalCode: z.string().min(3).max(20),
  country: z.string().min(2).max(56),
});

export const createCheckoutSchema = z.object({
  body: z.object({
    address,
    shipping: z.number().nonnegative().optional(),
  }),
});

export const checkoutIdSchema = z.object({
  params: z.object({ id: objectId }),
});

export const confirmCheckoutSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    paymentRef: z.string().min(4).max(80).optional(),
  }),
});
