import { asyncHandler } from '../../utils/asyncHandler.js';
import { cancelOrder, getOrder, listOrders, updateOrderStatus } from './order.service.js';

export const list = asyncHandler(async (req, res) => {
  const data = await listOrders(req.user, req.validated.query);
  res.json({ ok: true, ...data });
});

export const getById = asyncHandler(async (req, res) => {
  const order = await getOrder(req.validated.params.id, req.user);
  res.json({ ok: true, order });
});

export const patch = asyncHandler(async (req, res) => {
  const order = await updateOrderStatus(req.validated.params.id, req.user, req.validated.body.status);
  res.json({ ok: true, order });
});

export const cancel = asyncHandler(async (req, res) => {
  const order = await cancelOrder(req.validated.params.id, req.user);
  res.json({ ok: true, order });
});
