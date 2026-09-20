import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  title: String,
  sku: String,
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.SchemaTypes.ObjectId, ref: 'User', required: true, index: true },
  checkout: { type: mongoose.Schema.Types.ObjectId, ref: 'Checkout', required: true },
  items: { type: [orderItemSchema], required: true },
  address: { type: Object, required: true },
  subtotal: { type: Number, required: true },
  shipping: { type: Number, required: true },
  total: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  status: {
    type: String,
    enum: ['placed', 'paid', 'packed', 'shipped', 'delivered', 'cancelled'],
    default: 'placed',
  },
  paymentRef: { type: String, default: '' },
}, { timestamps: true });

export const Order = mongoose.model('Order', orderSchema);
