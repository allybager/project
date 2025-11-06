import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { paymentService } from './payment.service.js';
import { HttpError } from '../../middleware/error-handler.js';

const createPaymentSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  type: z.enum(['pin', 'refresh', 'subscription', 'listing']),
  listingId: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

export const paymentRouter = Router();

paymentRouter.use(requireAuth);

paymentRouter.get('/', async (req, res, next) => {
  try {
    const payments = await paymentService.listPayments(req.user!);
    res.json(payments);
  } catch (error) {
    next(error);
  }
});

paymentRouter.post('/', async (req, res, next) => {
  try {
    const body = createPaymentSchema.parse(req.body);
    const payment = await paymentService.recordPayment({
      ...body,
      userId: req.user!.id
    });
    res.status(201).json(payment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new HttpError(400, 'Validation failed', error.flatten()));
      return;
    }
    next(error);
  }
});
