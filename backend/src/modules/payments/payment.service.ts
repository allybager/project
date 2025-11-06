import { nanoid } from 'nanoid';
import { dataStore, type PaymentRecord, type UserRecord } from '../../data/data-store.js';
import { HttpError } from '../../middleware/error-handler.js';

export type PaymentIntentType = 'pin' | 'refresh' | 'subscription' | 'listing';

interface CreatePaymentInput {
  userId: string;
  amount: number;
  currency: string;
  type: PaymentIntentType;
  listingId?: string;
  metadata?: Record<string, unknown>;
  status?: PaymentRecord['status'];
}

export class PaymentService {
  async recordPayment(input: CreatePaymentInput): Promise<PaymentRecord> {
    if (input.amount <= 0) {
      throw new HttpError(400, 'Invalid amount');
    }
    const now = new Date().toISOString();
    const payment: PaymentRecord = {
      id: nanoid(),
      userId: input.userId,
      listingId: input.listingId,
      amount: input.amount,
      currency: input.currency,
      type: input.type,
      status: input.status ?? 'pending',
      createdAt: now,
      metadata: input.metadata
    };

    await dataStore.update((state) => {
      state.payments.push(payment);
    });

    return payment;
  }

  async listPayments(user: UserRecord): Promise<PaymentRecord[]> {
    const data = await dataStore.getData();
    if (user.role === 'admin' || user.role === 'moderator') {
      return data.payments;
    }
    return data.payments.filter((payment) => payment.userId === user.id);
  }
}

export const paymentService = new PaymentService();
