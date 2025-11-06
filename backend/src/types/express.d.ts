import 'express';
import type { UserRecord } from '../data/data-store.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserRecord;
  }
}
