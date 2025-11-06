import { Router } from 'express';
import { z } from 'zod';
import { authService } from './auth.service.js';
import { HttpError } from '../../middleware/error-handler.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  locale: z.string().min(2)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const authRouter = Router();

authRouter.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const result = await authService.register(body);
    res.status(201).json({
      token: result.token,
      user: {
        id: result.user.id,
        email: result.user.email,
        locale: result.user.locale,
        role: result.user.role,
        subscriptionPlan: result.user.subscriptionPlan
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new HttpError(400, 'Validation failed', error.flatten()));
      return;
    }
    if (error instanceof Error && error.message.includes('Email already')) {
      next(new HttpError(409, error.message));
      return;
    }
    next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await authService.login(body.email, body.password);
    res.json({
      token: result.token,
      user: {
        id: result.user.id,
        email: result.user.email,
        locale: result.user.locale,
        role: result.user.role,
        subscriptionPlan: result.user.subscriptionPlan
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new HttpError(400, 'Validation failed', error.flatten()));
      return;
    }
    if (error instanceof Error && error.message.includes('Invalid credentials')) {
      next(new HttpError(401, error.message));
      return;
    }
    next(error);
  }
});
