import { asyncHandler } from '../../utils/asyncHandler.js';
import { confirmCheckout, createCheckout, getCheckout } from './checkout.service.js';

export const create = asyncHandler(async (req, res) => {
  const checkout = await createCheckout(req.user, req.validated.body);
  res.status(201).json({ ok: true, checkout });
});

export const getById = asyncHandler(async (req, res) => {
  const checkout = await getCheckout(req.validated.params.id, req.user);
  res.json({ ok: true, checkout });
});

export const confirm = asyncHandler(async (req, res) => {
  const result = await confirmCheckout(req.validated.params.id, req.user, req.validated.body.paymentRef);
  res.json({ ok: true, ...result });
});
