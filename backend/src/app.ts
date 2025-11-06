import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { json } from 'express';
import { authRouter } from './modules/auth/auth.routes.js';
import { categoryRouter } from './modules/categories/category.routes.js';
import { listingRouter } from './modules/listings/listing.routes.js';
import { paymentRouter } from './modules/payments/payment.routes.js';
import { userRouter } from './modules/users/user.routes.js';
import { errorHandler } from './middleware/error-handler.js';

export const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(helmet());
  app.use(json({ limit: '10mb' }));
  app.use(morgan('dev'));

  app.use('/api/auth', authRouter);
  app.use('/api/categories', categoryRouter);
  app.use('/api/listings', listingRouter);
  app.use('/api/payments', paymentRouter);
  app.use('/api/users', userRouter);

  app.use(errorHandler);

  return app;
};
