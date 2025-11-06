import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { dataStore, type UserRecord } from '../../data/data-store.js';
import { env } from '../../config/env.js';

interface CreateUserPayload {
  email: string;
  password: string;
  locale: string;
}

export class AuthService {
  async register(payload: CreateUserPayload): Promise<{ user: UserRecord; token: string }> {
    const data = await dataStore.getData();
    const existing = data.users.find((u) => u.email === payload.email.toLowerCase());
    if (existing) {
      throw new Error('Email already registered');
    }

    const nowDate = new Date();
    const nextReset = new Date(nowDate);
    nextReset.setMonth(nowDate.getMonth() + 1);
    const now = nowDate.toISOString();
    const user: UserRecord = {
      id: nanoid(),
      email: payload.email.toLowerCase(),
      passwordHash: await bcrypt.hash(payload.password, 10),
      locale: payload.locale,
      role: 'user',
      createdAt: now,
      subscriptionPlan: 'free',
      freeQuotaUsed: 0,
      quotaResetAt: nextReset.toISOString()
    };

    await dataStore.update((state) => {
      state.users.push(user);
    });

    const token = this.generateToken(user.id);
    return { user, token };
  }

  async login(email: string, password: string): Promise<{ user: UserRecord; token: string }> {
    const data = await dataStore.getData();
    const user = data.users.find((u) => u.email === email.toLowerCase());
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new Error('Invalid credentials');
    }

    const token = this.generateToken(user.id);
    return { user, token };
  }

  private generateToken(userId: string): string {
    return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: '7d' });
  }
}

export const authService = new AuthService();
