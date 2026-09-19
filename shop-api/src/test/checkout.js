import { Checkout } from '../modules/checkout/checkout.model.js';
import { addressFor, ensureProducts, runSeed } from './_helpers.js';

await runSeed('checkout', async () => {
  const { users, products } = await ensureProducts();
  for (const [index, user] of users.entries()) {
    const product = products[index];
    const quantity = 1;
    const unitPrice = product.price;
    const shipping = 5;
    const subtotal = unitPrice * quantity;
    const checkout = await Checkout.findOneAndUpdate(
      { user: user.id, paymentRef: `seed-checkout-${index + 1}` },
      {
        user: user.id,
        items: [{
          product: product.id,
          title: product.title,
          sku: product.sku,
          quantity,
          unitPrice,
        }],
        address: addressFor(user, index),
        subtotal,
        shipping,
        total: subtotal + shipping,
        currency: 'USD',
        status: 'pending',
        paymentRef: `seed-checkout-${index + 1}`,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    console.log(`${index + 1}. checkout ${checkout.id}  user=${user.email}  total=${checkout.total}`);
  }
});
