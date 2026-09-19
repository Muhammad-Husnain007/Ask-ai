import { ApiError } from '../../utils/ApiError.js';
import { Product } from '../products/product.model.js';
import { Cart } from './cart.model.js';

export async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId }).populate('items.product', 'title sku price stock isActive');
  if (!cart) cart = await Cart.create({ user: userId, items: [] });
  return cart;
}

export async function addCartItem(userId, { productId, quantity }) {
  const product = await Product.findById(productId);
  if (!product || !product.isActive) throw ApiError.notFound('Product not found');
  if (product.stock < quantity) throw ApiError.badRequest('Not enough stock');

  const cart = await getOrCreateCart(userId);
  const existing = cart.items.find((item) => item.product.equals?.(productId) || String(item.product._id || item.product) === productId);
  if (existing) {
    const nextQty = existing.quantity + quantity;
    if (product.stock < nextQty) throw ApiError.badRequest('Not enough stock');
    existing.quantity = nextQty;
    existing.unitPrice = product.price;
  } else {
    cart.items.push({ product: product.id, quantity, unitPrice: product.price });
  }
  await cart.save();
  return getOrCreateCart(userId);
}

export async function updateCartItem(userId, productId, quantity) {
  const cart = await getOrCreateCart(userId);
  const item = cart.items.find((entry) => String(entry.product._id || entry.product) === productId);
  if (!item) throw ApiError.notFound('Item not in cart');
  const product = await Product.findById(productId);
  if (!product || product.stock < quantity) throw ApiError.badRequest('Not enough stock');
  item.quantity = quantity;
  item.unitPrice = product.price;
  await cart.save();
  return getOrCreateCart(userId);
}

export async function removeCartItem(userId, productId) {
  const cart = await getOrCreateCart(userId);
  cart.items = cart.items.filter((entry) => String(entry.product._id || entry.product) !== productId);
  await cart.save();
  return getOrCreateCart(userId);
}

export async function clearCart(userId) {
  const cart = await getOrCreateCart(userId);
  cart.items = [];
  await cart.save();
  return cart;
}
