import { Cart } from '../modules/cart/cart.model.js';
import { ensureProducts, runSeed } from './_helpers.js';

await runSeed('cart', async () => {
  const { users, products } = await ensureProducts();
  for (const [index, user] of users.entries()) {
    const product = products[index];
    const cart = await Cart.findOneAndUpdate(
      { user: user.id },
      {
        user: user.id,
        items: [{
          product: product.id,
          quantity: index + 1,
          unitPrice: product.price,
        }],
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    console.log(`${index + 1}. cart ${cart.id}  user=${user.email}  item=${product.sku} x${index + 1}`);
  }
});
