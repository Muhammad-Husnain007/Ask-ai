import { ApiError } from '../../utils/ApiError.js';
import { signAccessToken } from '../../utils/tokens.js';
import { User } from './auth.model.js';

export async function registerUser({ name, email, password }) {
  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) throw ApiError.conflict('Email already registered');
  const passwordHash = await User.hashPassword(password);
  const user = await User.create({ name, email, passwordHash });
  return { user: user.toPublic(), token: signAccessToken(user) };
}

export async function loginUser({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user || !user.isActive) throw ApiError.unauthorized('Invalid email or password');
  const ok = await user.comparePassword(password);
  if (!ok) throw ApiError.unauthorized('Invalid email or password');
  return { user: user.toPublic(), token: signAccessToken(user) };
}
