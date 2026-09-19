import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { login, logout, me, register } from './auth.controller.js';
import { loginSchema, registerSchema } from './auth.validation.js';

export const authRouter = Router();

authRouter.post('/register', validate(registerSchema), register);
authRouter.post('/login', validate(loginSchema), login);
authRouter.get('/me', requireAuth, me);
authRouter.post('/logout', requireAuth, logout);
