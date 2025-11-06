import { Router } from 'express';
import { z } from 'zod';
import { categoryService } from './category.service.js';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../../middleware/auth.js';
import { HttpError } from '../../middleware/error-handler.js';

const baseSchema = z.object({
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/),
  translations: z.record(
    z.string().min(2),
    z.object({
      title: z.string().min(2),
      description: z.string().optional()
    })
  ),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  parentId: z.string().optional()
});

export const categoryRouter = Router();

categoryRouter.get('/', async (_req, res, next) => {
  try {
    const categories = await categoryService.hierarchy();
    res.json(categories);
  } catch (error) {
    next(error);
  }
});

categoryRouter.post(
  '/',
  requireRole(['admin', 'moderator']),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = baseSchema.parse(req.body);
      const category = await categoryService.create(body);
      res.status(201).json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new HttpError(400, 'Validation failed', error.flatten()));
        return;
      }
      next(error);
    }
  }
);

categoryRouter.put(
  '/:id',
  requireRole(['admin', 'moderator']),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = baseSchema.partial().parse(req.body);
      const category = await categoryService.update(req.params.id, body);
      res.json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new HttpError(400, 'Validation failed', error.flatten()));
        return;
      }
      if (error instanceof Error && error.message.includes('not found')) {
        next(new HttpError(404, error.message));
        return;
      }
      next(error);
    }
  }
);

categoryRouter.use(requireAuth);

categoryRouter.get('/flat', async (_req, res, next) => {
  try {
    const categories = await categoryService.list();
    res.json(categories);
  } catch (error) {
    next(error);
  }
});
