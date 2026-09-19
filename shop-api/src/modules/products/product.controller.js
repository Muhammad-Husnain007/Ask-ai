import { asyncHandler } from '../../utils/asyncHandler.js';
import { createProduct, deleteProduct, getProduct, listProducts, updateProduct } from './product.service.js';

export const create = asyncHandler(async (req, res) => {
  const product = await createProduct(req.validated.body);
  res.status(201).json({ ok: true, product });
});

export const list = asyncHandler(async (req, res) => {
  const data = await listProducts(req.validated.query);
  res.json({ ok: true, ...data });
});

export const getById = asyncHandler(async (req, res) => {
  const product = await getProduct(req.validated.params.id);
  res.json({ ok: true, product });
});

export const patch = asyncHandler(async (req, res) => {
  const product = await updateProduct(req.validated.params.id, req.validated.body);
  res.json({ ok: true, product });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await deleteProduct(req.validated.params.id);
  res.json({ ok: true, ...result });
});
