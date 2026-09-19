import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  slug: { type: String, required: true, unique: true, lowercase: true },
  sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: { type: String, default: '', maxlength: 4000 },
  price: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'USD', uppercase: true, maxlength: 3 },
  stock: { type: Number, required: true, min: 0, default: 0 },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  images: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

productSchema.index({ title: 'text', description: 'text', sku: 1 });

export const Product = mongoose.model('Product', productSchema);
