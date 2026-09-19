import mongoose from 'mongoose';
import { ApiError } from '../../utils/ApiError.js';
import { clearCart, getOrCreateCart } from '../cart/cart.service.js';
import { Order } from '../orders/order.model.js';
import { Product } from '../products/product.model.js';
import { Checkout } from './checkout.model.js';

function assertOwner(checkout, user) {
  if (String(checkout.user) !== user.id && user.role !== 'admin') {
    throw ApiError.forbidden('Not your checkout');
  }
}

export async function createCheckout(user, { address, shipping = 0 }) {
  const cart = await getOrCreateCart(user.id);
  if (!cart.items.length) throw ApiError.badRequest('Cart is empty');

  const items = [];
  for (const item of cart.items) {
    const product = await Product.findById(item.product._id || item.product);
    if (!product || !product.isActive) throw ApiError.badRequest('A product is no longer available');
    if (product.stock < item.quantity) throw ApiError.badRequest(`${product.title} is out of stock`);
    items.push({
      product: product.id,
      title: product.title,
      sku: product.sku,
      quantity: item.quantity,
      unitPrice: product.price,
    });
  }

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  return Checkout.create({
    user: user.id,
    items,
    address,
    subtotal,
    shipping,
    total: subtotal + shipping,
    currency: 'USD',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
}

export async function getCheckout(id, user) {
  const checkout = await Checkout.findById(id);
  if (!checkout) throw ApiError.notFound('Checkout not found');
  assertOwner(checkout, user);
  if (checkout.status === 'pending' && checkout.expiresAt < new Date()) {
    checkout.status = 'expired';
    await checkout.save();
  }
  return checkout;
}

export async function confirmCheckout(id, user, paymentRef) {
  const checkout = await getCheckout(id, user);
  if (checkout.status === 'expired') throw ApiError.badRequest('Checkout expired');
  if (checkout.status === 'paid') throw ApiError.conflict('Checkout already paid');
  if (checkout.status !== 'pending') throw ApiError.badRequest('Checkout cannot be confirmed');

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    for (const item of checkout.items) {
      const updated = await Product.findOneAndUpdate(
        { _id: item.product, stock: { $gte: item.quantity }, isActive: true },
        { $inc: { stock: -item.quantity } },
        { new: true, session },
      );
      if (!updated) throw ApiError.badRequest('Stock changed, recreate checkout');
    }

    const [order] = await Order.create([{
      user: user.id,
      checkout: checkout.id,
      items: checkout.items,
      address: checkout.address,
      subtotal: checkout.subtotal,
      shipping: checkout.shipping,
      total: checkout.total,
      currency: checkout.currency,
      status: 'paid',
      paymentRef: paymentRef || `pay_${checkout.id}`,
    }], { session });

    checkout.status = 'paid';
    checkout.paymentRef = order.paymentRef;
    checkout.order = order.id;
    await checkout.save({ session });
    await session.commitTransaction();
    await clearCart(user.id);
    return { checkout, order };
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
