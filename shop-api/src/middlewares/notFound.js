import { ApiError } from '../utils/ApiError.js';

export function notFound(_req, _res, next) {
  next(ApiError.notFound('Route not found'));
}
