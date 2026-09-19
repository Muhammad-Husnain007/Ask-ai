import { asyncHandler } from '../../utils/asyncHandler.js';
import { loginUser, registerUser } from './auth.service.js';

export const register = asyncHandler(async (req, res) => {
  const result = await registerUser(req.validated.body);
  res.status(201).json({ ok: true, ...result });
});

export const login = asyncHandler(async (req, res) => {
  const result = await loginUser(req.validated.body);
  res.json({ ok: true, ...result });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ ok: true, user: req.user.toPublic() });
});

export const logout = asyncHandler(async (_req, res) => {
  res.json({ ok: true, message: 'Token discarded on client' });
});
