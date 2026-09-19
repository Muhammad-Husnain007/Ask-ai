import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      ok: false,
      error: err.message,
      details: err.details,
    });
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ ok: false, error: err.message });
  }

  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ ok: false, error: 'Invalid id' });
  }

  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({ ok: false, error: `${field} already exists` });
  }

  console.error(err);
  return res.status(500).json({
    ok: false,
    error: env.nodeEnv === 'production' ? 'Internal server error' : err.message,
  });
}
