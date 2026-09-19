import { connectDb, disconnectDb } from '../config/db.js';
import { User } from '../modules/auth/auth.model.js';
import { Category } from '../modules/categories/category.model.js';
import { Product } from '../modules/products/product.model.js';

export const TEST_PASSWORD = 'Test12345!';

export const SEED_USERS = [
  { name: 'Ali Khan', email: 'ali.khan@shop.test', city: 'Lahore', region: 'Punjab', postalCode: '54000' },
  { name: 'Sara Ahmed', email: 'sara.ahmed@shop.test', city: 'Karachi', region: 'Sindh', postalCode: '74000' },
  { name: 'Bilal Raza', email: 'bilal.raza@shop.test', city: 'Islamabad', region: 'ICT', postalCode: '44000' },
  { name: 'Hina Malik', email: 'hina.malik@shop.test', city: 'Rawalpindi', region: 'Punjab', postalCode: '46000' },
  { name: 'Usman Tariq', email: 'usman.tariq@shop.test', city: 'Faisalabad', region: 'Punjab', postalCode: '38000' },
  { name: 'Ayesha Noor', email: 'ayesha.noor@shop.test', city: 'Peshawar', region: 'KPK', postalCode: '25000' },
  { name: 'Hamza Sheikh', email: 'hamza.sheikh@shop.test', city: 'Multan', region: 'Punjab', postalCode: '60000' },
  { name: 'Fatima Zahra', email: 'fatima.zahra@shop.test', city: 'Quetta', region: 'Balochistan', postalCode: '87300' },
  { name: 'Omar Farooq', email: 'omar.farooq@shop.test', city: 'Sialkot', region: 'Punjab', postalCode: '51310' },
  { name: 'Nida Javed', email: 'nida.javed@shop.test', city: 'Hyderabad', region: 'Sindh', postalCode: '71000' },
];

export const SEED_CATEGORIES = [
  { name: 'Apparel', slug: 'seed-apparel', description: 'Clothing and wearables' },
  { name: 'Electronics', slug: 'seed-electronics', description: 'Gadgets and devices' },
  { name: 'Home', slug: 'seed-home', description: 'Home and living' },
  { name: 'Beauty', slug: 'seed-beauty', description: 'Skincare and makeup' },
  { name: 'Sports', slug: 'seed-sports', description: 'Fitness equipment' },
  { name: 'Books', slug: 'seed-books', description: 'Printed and digital books' },
  { name: 'Toys', slug: 'seed-toys', description: 'Kids toys and games' },
  { name: 'Grocery', slug: 'seed-grocery', description: 'Food and pantry' },
  { name: 'Automotive', slug: 'seed-automotive', description: 'Car accessories' },
  { name: 'Garden', slug: 'seed-garden', description: 'Outdoor and plants' },
];

export const SEED_PRODUCTS = [
  { title: 'Classic Tee', sku: 'SEED-TEE-01', price: 24, stock: 40 },
  { title: 'Wireless Earbuds', sku: 'SEED-EAR-02', price: 59, stock: 35 },
  { title: 'Cotton Throw', sku: 'SEED-THR-03', price: 32, stock: 20 },
  { title: 'Vitamin C Serum', sku: 'SEED-SER-04', price: 18, stock: 50 },
  { title: 'Yoga Mat', sku: 'SEED-YOG-05', price: 28, stock: 22 },
  { title: 'Urdu Novel', sku: 'SEED-BOK-06', price: 12, stock: 60 },
  { title: 'Building Blocks', sku: 'SEED-TOY-07', price: 22, stock: 30 },
  { title: 'Himalayan Salt', sku: 'SEED-SLT-08', price: 6, stock: 80 },
  { title: 'Phone Mount', sku: 'SEED-MNT-09', price: 15, stock: 45 },
  { title: 'Garden Gloves', sku: 'SEED-GLV-10', price: 9, stock: 55 },
];

export function addressFor(user, index) {
  const profile = SEED_USERS[index];
  return {
    fullName: user.name,
    line1: `House ${index + 1}, Street ${index + 4}`,
    line2: 'Test seed',
    city: profile.city,
    region: profile.region,
    postalCode: profile.postalCode,
    country: 'PK',
  };
}

export async function ensureUsers() {
  const passwordHash = await User.hashPassword(TEST_PASSWORD);
  const users = [];
  for (const [index, row] of SEED_USERS.entries()) {
    const user = await User.findOneAndUpdate(
      { email: row.email },
      {
        name: row.name,
        email: row.email,
        passwordHash,
        role: index === 0 ? 'admin' : 'customer',
        isActive: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    users.push(user);
  }
  return users;
}

export async function ensureCategories(users) {
  const list = users?.length ? users : await ensureUsers();
  const categories = [];
  for (const [index, row] of SEED_CATEGORIES.entries()) {
    const category = await Category.findOneAndUpdate(
      { slug: row.slug },
      {
        ...row,
        createdBy: list[index].id,
        isActive: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    categories.push(category);
  }
  return { users: list, categories };
}

export async function ensureProducts(users) {
  const { users: list, categories } = await ensureCategories(users);
  const products = [];
  for (const [index, row] of SEED_PRODUCTS.entries()) {
    const product = await Product.findOneAndUpdate(
      { sku: row.sku },
      {
        title: row.title,
        slug: `seed-${row.sku.toLowerCase()}`,
        sku: row.sku,
        description: `${row.title} seeded for ${list[index].name}`,
        price: row.price,
        stock: row.stock,
        category: categories[index].id,
        createdBy: list[index].id,
        isActive: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    products.push(product);
  }
  return { users: list, categories, products };
}

export async function runSeed(label, work) {
  await connectDb();
  try {
    const result = await work();
    console.log(`${label}: inserted/updated 10 documents`);
    return result;
  } finally {
    await disconnectDb();
  }
}
