import { Checkout } from '../modules/checkout/checkout.model.js';
import { Order } from '../modules/orders/order.model.js';
import { addressFor, ensureProducts, runSeed } from './_helpers.js';

await runSeed('orders', async () => {
  const { users, products } = await ensureProducts();
  const statuses = ['placed', 'paid', 'packed', 'shipped', 'delivered', 'cancelled', 'paid', 'packed', 'shipped', 'delivered'];

  for (const [index, user] of users.entries()) {
    const product = products[index];
    const quantity = 1;
    const unitPrice = product.price;
    const shipping = 5;
    const subtotal = unitPrice * quantity;
    const items = [{
      product: product.id,
      title: product.title,
      sku: product.sku,
      quantity,
      unitPrice,
    }];
    const address = addressFor(user, index);

    const checkout = await Checkout.findOneAndUpdate(
      { user: user.id, paymentRef: `seed-order-checkout-${index + 1}` },
      {
        user: user.id,
        items,
        address,
        subtotal,
        shipping,
        total: subtotal + shipping,
        currency: 'USD',
        status: 'paid',
        paymentRef: `seed-order-checkout-${index + 1}`,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const order = await Order.findOneAndUpdate(
      { paymentRef: `seed-order-${index + 1}` },
      {
        user: user.id,
        checkout: checkout.id,
        items,
        address,
        subtotal,
        shipping,
        total: subtotal + shipping,
        currency: 'USD',
        status: statuses[index],
        paymentRef: `seed-order-${index + 1}`,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    checkout.order = order.id;
    await checkout.save();
    console.log(`${index + 1}. order ${order.id}  user=${user.email}  status=${order.status}`);
  }
});
