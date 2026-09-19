import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this.id,
    name: this.name,
    email: this.email,
    role: this.role,
    createdAt: this.createdAt,
  };
};

userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
};

export const User = mongoose.model('User', userSchema);
