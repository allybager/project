import { Router } from 'express';
import { z } from 'zod';
import { listingService } from './listing.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { HttpError } from '../../middleware/error-handler.js';

const createListingSchema = z.object({
  categoryId: z.string().min(1),
  title: z.record(z.string(), z.string().min(2)),
  description: z.record(z.string(), z.string().min(10)),
  price: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  location: z.object({
    city: z.string().min(2),
    postalCode: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional()
  }),
  media: z.array(z.string().url()).max(10).optional()
});

const updateListingSchema = createListingSchema.partial().extend({
  status: z.enum(['draft', 'pending', 'active', 'inactive']).optional(),
  isPinned: z.boolean().optional(),
  pinnedUntil: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional()
});

const filterSchema = z.object({
  categoryId: z.string().optional(),
  status: z.enum(['draft', 'pending', 'active', 'inactive']).optional(),
  language: z.string().optional(),
  city: z.string().optional()
});

const pinSchema = z
  .object({
    durationHours: z.number().positive().max(168).optional()
  })
  .optional();

export const listingRouter = Router();

listingRouter.get('/', async (req, res, next) => {
  try {
    const filters = filterSchema.parse(req.query);
    const listings = await listingService.list(filters);
    res.json(listings);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new HttpError(400, 'Invalid filters', error.flatten()));
      return;
    }
    next(error);
  }
});

listingRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const body = createListingSchema.parse(req.body);
    const listing = await listingService.create(body, req.user!);
    res.status(201).json(listing);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new HttpError(400, 'Validation failed', error.flatten()));
      return;
    }
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    next(error);
  }
});

listingRouter.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const body = updateListingSchema.parse(req.body);
    const listing = await listingService.update(req.params.id, body, req.user!);
    res.json(listing);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new HttpError(400, 'Validation failed', error.flatten()));
      return;
    }
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    next(error);
  }
});

listingRouter.post('/:id/pin', requireAuth, async (req, res, next) => {
  try {
    const body = pinSchema.parse(req.body ?? {});
    const listing = await listingService.pinListing(req.params.id, req.user!, body?.durationHours);
    res.json(listing);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new HttpError(400, 'Validation failed', error.flatten()));
      return;
    }
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    next(error);
  }
});

listingRouter.post('/:id/refresh', requireAuth, async (req, res, next) => {
  try {
    const listing = await listingService.refreshListing(req.params.id, req.user!);
    res.json(listing);
  } catch (error) {
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    next(error);
  }
});

listingRouter.post('/:id/renew', requireAuth, async (req, res, next) => {
  try {
    const listing = await listingService.renewListing(req.params.id, req.user!);
    res.json(listing);
  } catch (error) {
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    next(error);
  }
});

listingRouter.post('/:id/deactivate', requireAuth, async (req, res, next) => {
  try {
    const listing = await listingService.deactivateListing(req.params.id, req.user!);
    res.json(listing);
  } catch (error) {
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    next(error);
  }
});
