import slugify from 'slugify';
import { ApiError } from '../../utils/ApiError.js';
import { paginated, parsePagination } from '../../utils/pagination.js';
import { Category } from '../categories/category.model.js';
import { Product } from './product.model.js';

function makeSlug(title) {
  return `${slugify(title, { lower: true, strict: true })}-${Date.now().toString(36)}`;
}

async function assertCategory(categoryId) {
  const category = await Category.findById(categoryId);
  if (!category || !category.isActive) throw ApiError.badRequest('Category is invalid');
  return category;
}

export async function createProduct(payload) {
  await assertCategory(payload.category);
  return Product.create({
    ...payload,
    sku: payload.sku.toUpperCase(),
    slug: makeSlug(payload.title),
    stock: payload.stock ?? 0,
    images: payload.images || [],
  });
}

export async function listProducts(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { isActive: true };
  if (query.category) filter.category = query.category;
  if (query.q) filter.$text = { $search: query.q };
  const [items, total] = await Promise.all([
    Product.find(filter).populate('category', 'name slug').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Product.countDocuments(filter),
  ]);
  return paginated(items, total, { page, limit });
}

export async function getProduct(id) {
  const product = await Product.findById(id).populate('category', 'name slug');
  if (!product) throw ApiError.notFound('Product not found');
  return product;
}

export async function updateProduct(id, payload) {
  const product = await getProduct(id);
  if (payload.category) await assertCategory(payload.category);
  if (payload.title && payload.title !== product.title) product.slug = makeSlug(payload.title);
  if (payload.sku) payload.sku = payload.sku.toUpperCase();
  Object.assign(product, payload);
  return product.save();
}

export async function deleteProduct(id) {
  const product = await getProduct(id);
  await product.deleteOne();
  return { id };
}
