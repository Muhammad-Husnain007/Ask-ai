import { ensureCategories, runSeed } from './_helpers.js';

await runSeed('categories', async () => {
  const { categories } = await ensureCategories();
  categories.forEach((category, index) => {
    console.log(`${index + 1}. ${category.name}  slug=${category.slug}  createdBy=${category.createdBy}`);
  });
});
