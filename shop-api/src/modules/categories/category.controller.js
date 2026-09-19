import { asyncHandler } from '../../utils/asyncHandler.js';
import { createCategory, deleteCategory, getCategory, listCategories, updateCategory } from './category.service.js';

export const create = asyncHandler(async (req, res) => {
  const category = await createCategory(req.validated.body);
  res.status(201).json({ ok: true, category });
});

export const list = asyncHandler(async (_req, res) => {
  const categories = await listCategories();
  res.json({ ok: true, categories });
});

export const getById = asyncHandler(async (req, res) => {
  const category = await getCategory(req.validated.params.id);
  res.json({ ok: true, category });
});

export const patch = asyncHandler(async (req, res) => {
  const category = await updateCategory(req.validated.params.id, req.validated.body);
  res.json({ ok: true, category });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await deleteCategory(req.validated.params.id);
  res.json({ ok: true, ...result });
});
