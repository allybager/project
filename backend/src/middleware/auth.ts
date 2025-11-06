import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { HttpError } from './error-handler.js';
import type { UserRecord } from '../data/data-store.js';
import { dataStore } from '../data/data-store.js';

export interface AuthenticatedRequest extends Request {
  user?: UserRecord;
}

export const requireAuth = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new HttpError(401, 'Authorization header missing');
    }
    const token = header.slice('Bearer '.length);
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string };
    const data = await dataStore.getData();
    const user = data.users.find((u) => u.id === payload.sub);
    if (!user) {
      throw new HttpError(401, 'Invalid token');
    }
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    next(new HttpError(401, 'Unauthorized'));
  }
};

export const requireRole = (roles: UserRecord['role'][]): typeof requireAuth => {
  return async (req, res, next) => {
    await requireAuth(req, res, (err?: unknown) => {
      if (err) {
        next(err);
        return;
      }
      if (!req.user || !roles.includes(req.user.role)) {
        next(new HttpError(403, 'Forbidden'));
        return;
      }
      next();
    });
  };
};
