import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
}, { _id: false });

const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items: { type: [cartItemSchema], default: [] },
}, { timestamps: true });

cartSchema.virtual('subtotal').get(function subtotal() {
  return this.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
});

cartSchema.set('toJSON', { virtuals: true });
cartSchema.set('toObject', { virtuals: true });

export const Cart = mongoose.model('Cart', cartSchema);
