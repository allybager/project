import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  locale: string;
  role: 'user' | 'moderator' | 'admin';
  createdAt: string;
  subscriptionPlan: 'free' | 'standard' | 'business';
  freeQuotaUsed: number;
  quotaResetAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface CategoryRecord {
  id: string;
  parentId?: string;
  slug: string;
  translations: Record<string, { title: string; description?: string }>;
  position: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListingRecord {
  id: string;
  userId: string;
  categoryId: string;
  title: Record<string, string>;
  description: Record<string, string>;
  price?: number;
  currency?: string;
  location: {
    city: string;
    postalCode?: string;
    lat?: number;
    lng?: number;
  };
  status: 'draft' | 'pending' | 'active' | 'inactive';
  isPinned: boolean;
  pinnedUntil?: string;
  refreshCountToday: number;
  lastRefreshAt?: string;
  media: string[];
  createdAt: string;
  expiresAt?: string;
  awaitingRenewalConfirmation: boolean;
  renewalRequestedAt?: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  listingId?: string;
  amount: number;
  currency: string;
  type: 'pin' | 'refresh' | 'subscription' | 'listing';
  status: 'succeeded' | 'failed' | 'pending';
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface PromotionRecord {
  id: string;
  listingId: string;
  type: 'pin' | 'refresh';
  startAt: string;
  endAt: string;
  price: number;
  currency: string;
}

export interface ChatRecord {
  id: string;
  listingId: string;
  sellerId: string;
  buyerId: string;
  status: 'open' | 'archived' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export interface MessageRecord {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  sentAt: string;
  readBy: string[];
}

export interface DataSchema {
  users: UserRecord[];
  sessions: SessionRecord[];
  categories: CategoryRecord[];
  listings: ListingRecord[];
  payments: PaymentRecord[];
  promotions: PromotionRecord[];
  chats: ChatRecord[];
  messages: MessageRecord[];
}

export class DataStore {
  private cache: DataSchema | null = null;

  private async load(): Promise<DataSchema> {
    if (this.cache) {
      return this.cache;
    }

    try {
      const raw = await fs.readFile(env.dataFile, 'utf8');
      this.cache = JSON.parse(raw) as DataSchema;
      return this.cache;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.cache = {
          users: [],
          sessions: [],
          categories: [],
          listings: [],
          payments: [],
          promotions: [],
          chats: [],
          messages: []
        };
        await this.persist();
        return this.cache;
      }
      throw error;
    }
  }

  private async persist(): Promise<void> {
    if (!this.cache) {
      throw new Error('Cannot persist without cache');
    }

    const dir = path.dirname(env.dataFile);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(env.dataFile, JSON.stringify(this.cache, null, 2), 'utf8');
  }

  async getData(): Promise<DataSchema> {
    return this.load();
  }

  async update(mutator: (data: DataSchema) => void): Promise<DataSchema> {
    const data = await this.load();
    mutator(data);
    await this.persist();
    return data;
  }
}

export const dataStore = new DataStore();
