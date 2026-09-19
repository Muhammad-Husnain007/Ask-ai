import { connectDb, disconnectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { User } from '../modules/auth/auth.model.js';
import { Category } from '../modules/categories/category.model.js';
import { Product } from '../modules/products/product.model.js';

await connectDb();

const passwordHash = await User.hashPassword(env.seedAdminPassword);
const admin = await User.findOneAndUpdate(
  { email: env.seedAdminEmail },
  { name: 'Shop Admin', email: env.seedAdminEmail, passwordHash, role: 'admin', isActive: true },
  { upsert: true, new: true },
);

const apparel = await Category.findOneAndUpdate(
  { slug: 'apparel' },
  { name: 'Apparel', slug: 'apparel', description: 'Clothing and wearables', isActive: true },
  { upsert: true, new: true },
);

await Product.findOneAndUpdate(
  { sku: 'TEE-001' },
  {
    title: 'Classic Tee',
    slug: 'classic-tee',
    sku: 'TEE-001',
    description: 'Soft cotton t-shirt',
    price: 24,
    stock: 40,
    category: apparel.id,
    isActive: true,
  },
  { upsert: true, new: true },
);

await Product.findOneAndUpdate(
  { sku: 'HAT-001' },
  {
    title: 'Canvas Cap',
    slug: 'canvas-cap',
    sku: 'HAT-001',
    description: 'Adjustable canvas cap',
    price: 18,
    stock: 25,
    category: apparel.id,
    isActive: true,
  },
  { upsert: true, new: true },
);

console.log(`Seeded admin ${admin.email} / ${env.seedAdminPassword}`);
await disconnectDb();
