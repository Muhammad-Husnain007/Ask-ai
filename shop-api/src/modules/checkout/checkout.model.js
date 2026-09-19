import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  line1: { type: String, required: true },
  line2: { type: String, default: '' },
  city: { type: String, required: true },
  region: { type: String, default: '' },
  postalCode: { type: String, required: true },
  country: { type: String, required: true },
}, { _id: false });

const checkoutItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  title: String,
  sku: String,
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
}, { _id: false });

const checkoutSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: { type: [checkoutItemSchema], required: true },
  address: { type: addressSchema, required: true },
  subtotal: { type: Number, required: true, min: 0 },
  shipping: { type: Number, required: true, min: 0, default: 0 },
  total: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'USD' },
  status: { type: String, enum: ['pending', 'paid', 'failed', 'expired'], default: 'pending' },
  paymentRef: { type: String, default: '' },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

export const Checkout = mongoose.model('Checkout', checkoutSchema);
