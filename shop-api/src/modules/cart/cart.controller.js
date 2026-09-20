import { asyncHandler } from '../../utils/asyncHandler.js';
import { addCartItem, clearCart, getOrCreateCart, removeCartItem, updateCartItem } from './cart.service.js';

export const getCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user.id);
  res.json({ ok: true, cart });
});

export const addItem = asyncHandler(async (req, res) => {
  const cart = await addCartItem(req.user.id, req.validated.body);
  res.status(201).json({ ok: true, cart });
});

export const patchItem = asyncHandler(async (req, res) => {
  const cart = await updateCartIte(req.user.id, req.validated.params.productId, req.validated.body.quantity);
  res.json({ ok: true, cart });
});

export const removeItem = asyncHandler(async (req, res) => {
  const cart = await removeCartItem(req.user.id, req.validated.params.productId);
  res.json({ ok: true, cart });
});

export const clear = asyncHandler(async (req, res) => {
  const cart = await clearCart(req.user.id);
  res.json({ ok: true, cart });
});
