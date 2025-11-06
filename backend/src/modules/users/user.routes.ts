import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';

export const userRouter = Router();

userRouter.get('/me', requireAuth, (req, res) => {
  res.json({
    id: req.user!.id,
    email: req.user!.email,
    locale: req.user!.locale,
    role: req.user!.role,
    subscriptionPlan: req.user!.subscriptionPlan,
    freeQuotaUsed: req.user!.freeQuotaUsed,
    quotaResetAt: req.user!.quotaResetAt
  });
});
