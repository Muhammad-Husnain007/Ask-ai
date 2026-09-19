import slugify from 'slugify';
import { ApiError } from '../../utils/ApiError.js';
import { Category } from './category.model.js';

function makeSlug(name) {
  return slugify(name, { lower: true, strict: true });
}

export async function createCategory(payload) {
  return Category.create({
    name: payload.name,
    slug: makeSlug(payload.name),
    description: payload.description || '',
  });
}

export async function listCategories() {
  return Category.find().sort({ name: 1 });
}

export async function getCategory(id) {
  const category = await Category.findById(id);
  if (!category) throw ApiError.notFound('Category not found');
  return category;
}

export async function updateCategory(id, payload) {
  const category = await getCategory(id);
  if (payload.name) {
    category.name = payload.name;
    category.slug = makeSlug(payload.name);
  }
  if (payload.description !== undefined) category.description = payload.description;
  if (payload.isActive !== undefined) category.isActive = payload.isActive;
  return category.save();
}

export async function deleteCategory(id) {
  const category = await getCategory(id);
  await category.deleteOne();
  return { id };
}
