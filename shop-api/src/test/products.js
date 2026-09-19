import { ensureProducts, runSeed } from './_helpers.js';

await runSeed('products', async () => {
  const { products } = await ensureProducts();
  products.forEach((product, index) => {
    console.log(`${index + 1}. ${product.title}  sku=${product.sku}  createdBy=${product.createdBy}`);
  });
});
