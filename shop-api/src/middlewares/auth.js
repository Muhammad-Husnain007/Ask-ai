import { User } from '../modules/auth/auth.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/tokens.js';

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized('Missing bearer token');

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) throw ApiError.unauthorized('Account is not active');
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.unauthorized('Invalid or expired token');
  }
});

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(ApiError.forbidden('Insufficient permissions'));
  }
  next();
};
