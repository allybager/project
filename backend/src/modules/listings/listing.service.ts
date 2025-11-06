import { nanoid } from 'nanoid';
import { dataStore, type ListingRecord, type UserRecord } from '../../data/data-store.js';
import { HttpError } from '../../middleware/error-handler.js';
import { businessRules } from '../../config/business-rules.js';
import { paymentService } from '../payments/payment.service.js';

export interface ListingFilter {
  categoryId?: string;
  status?: ListingRecord['status'];
  language?: string;
  city?: string;
}

export interface CreateListingInput {
  categoryId: string;
  title: Record<string, string>;
  description: Record<string, string>;
  price?: number;
  currency?: string;
  location: ListingRecord['location'];
  media?: string[];
}

export interface UpdateListingInput extends Partial<CreateListingInput> {
  status?: ListingRecord['status'];
  isPinned?: boolean;
  pinnedUntil?: string;
  expiresAt?: string;
}

const FREE_QUOTA = 2;

export class ListingService {
  private async reconcileExpirations(): Promise<void> {
    const now = new Date();
    const nowTime = now.getTime();
    const data = await dataStore.getData();
    const updates: { index: number; value: ListingRecord }[] = [];

    data.listings.forEach((listing, index) => {
      let changed = false;
      let updated = listing;

      if (updated.awaitingRenewalConfirmation === undefined) {
        updated = { ...updated, awaitingRenewalConfirmation: false };
        changed = true;
      }

      if (updated.status !== 'inactive') {
        if (updated.pinnedUntil) {
          const pinExpiry = new Date(updated.pinnedUntil).getTime();
          if (pinExpiry <= nowTime) {
            updated = {
              ...updated,
              isPinned: false,
              pinnedUntil: undefined
            };
            changed = true;
          }
        }

        if (updated.expiresAt) {
          const expiresAt = new Date(updated.expiresAt).getTime();
          const awaitingRenewal = updated.awaitingRenewalConfirmation ?? false;
          if (!awaitingRenewal && nowTime >= expiresAt) {
            updated = {
              ...updated,
              awaitingRenewalConfirmation: true,
              renewalRequestedAt: now.toISOString()
            };
            changed = true;
          } else if (awaitingRenewal && updated.renewalRequestedAt) {
            const renewalDeadline =
              new Date(updated.renewalRequestedAt).getTime() + businessRules.renewalGraceHours * 60 * 60 * 1000;
            if (nowTime >= renewalDeadline) {
              updated = {
                ...updated,
                status: 'inactive',
                awaitingRenewalConfirmation: false,
                renewalRequestedAt: undefined,
                isPinned: false,
                pinnedUntil: undefined
              };
              changed = true;
            }
          }
        }
      }

      if (changed) {
        if (updated.awaitingRenewalConfirmation === undefined) {
          updated = { ...updated, awaitingRenewalConfirmation: false };
        }
        updates.push({ index, value: updated });
      }
    });

    if (updates.length === 0) {
      return;
    }

    await dataStore.update((state) => {
      for (const update of updates) {
        state.listings[update.index] = update.value;
      }
    });
  }

  async list(filter: ListingFilter): Promise<ListingRecord[]> {
    await this.reconcileExpirations();
    const data = await dataStore.getData();
    return data.listings
      .filter((listing) => {
        if (filter.categoryId && listing.categoryId !== filter.categoryId) {
          return false;
        }
        if (filter.status && listing.status !== filter.status) {
          return false;
        }
        if (filter.language && !listing.title[filter.language]) {
          return false;
        }
        if (filter.city && listing.location.city.toLowerCase() !== filter.city.toLowerCase()) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isPinned && b.isPinned) {
          const aTime = a.pinnedUntil ? new Date(a.pinnedUntil).getTime() : 0;
          const bTime = b.pinnedUntil ? new Date(b.pinnedUntil).getTime() : 0;
          return bTime - aTime;
        }
        if (a.isPinned) return -1;
        if (b.isPinned) return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }

  private resetQuotaIfNeeded(user: UserRecord): UserRecord {
    const resetDate = new Date(user.quotaResetAt);
    const now = new Date();
    if (now.getTime() > resetDate.getTime()) {
      const nextReset = new Date(now);
      nextReset.setMonth(now.getMonth() + 1);
      return {
        ...user,
        freeQuotaUsed: 0,
        quotaResetAt: nextReset.toISOString()
      };
    }
    return user;
  }

  private ensureOwnership(listing: ListingRecord, user: UserRecord): void {
    if (listing.userId !== user.id && user.role === 'user') {
      throw new HttpError(403, 'Cannot modify listing');
    }
  }

  private ensureActive(listing: ListingRecord): void {
    if (listing.status !== 'active') {
      throw new HttpError(409, 'Listing must be active to perform this action');
    }
  }

  private resetRefreshCounterIfNeeded(listing: ListingRecord, now: Date): ListingRecord {
    if (!listing.lastRefreshAt) {
      return listing;
    }
    const lastRefresh = new Date(listing.lastRefreshAt);
    if (
      lastRefresh.getUTCFullYear() !== now.getUTCFullYear() ||
      lastRefresh.getUTCMonth() !== now.getUTCMonth() ||
      lastRefresh.getUTCDate() !== now.getUTCDate()
    ) {
      return {
        ...listing,
        refreshCountToday: 0
      };
    }
    return listing;
  }

  async create(input: CreateListingInput, user: UserRecord): Promise<ListingRecord> {
    let updatedUser = this.resetQuotaIfNeeded(user);

    if (updatedUser.subscriptionPlan === 'free' && updatedUser.freeQuotaUsed >= FREE_QUOTA) {
      throw new HttpError(402, 'Free quota exceeded. Upgrade subscription or purchase listing.');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + businessRules.freeListingDays * 24 * 60 * 60 * 1000);
    const listing: ListingRecord = {
      id: nanoid(),
      userId: user.id,
      categoryId: input.categoryId,
      title: input.title,
      description: input.description,
      price: input.price,
      currency: input.currency,
      location: input.location,
      status: 'pending',
      isPinned: false,
      refreshCountToday: 0,
      media: input.media ?? [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      awaitingRenewalConfirmation: false
    };

    await dataStore.update((state) => {
      const userIndex = state.users.findIndex((u) => u.id === user.id);
      if (userIndex === -1) {
        throw new HttpError(404, 'User not found');
      }
      if (updatedUser !== state.users[userIndex]) {
        state.users[userIndex] = updatedUser;
      }
      if (updatedUser.subscriptionPlan === 'free') {
        updatedUser = {
          ...updatedUser,
          freeQuotaUsed: updatedUser.freeQuotaUsed + 1
        };
        state.users[userIndex] = updatedUser;
      }
      state.listings.push(listing);
    });

    return listing;
  }

  async update(id: string, input: UpdateListingInput, user: UserRecord): Promise<ListingRecord> {
    let updatedListing: ListingRecord | undefined;
    await dataStore.update((state) => {
      const idx = state.listings.findIndex((listing) => listing.id === id);
      if (idx === -1) {
        throw new HttpError(404, 'Listing not found');
      }
      const existing = state.listings[idx];
      this.ensureOwnership(existing, user);
      const now = new Date().toISOString();
      const isAdmin = user.role !== 'user';
      let status = existing.status;
      if (input.status) {
        if (isAdmin || input.status === 'inactive') {
          status = input.status;
        }
      }

      updatedListing = {
        ...existing,
        title: input.title ?? existing.title,
        description: input.description ?? existing.description,
        media: input.media ?? existing.media,
        location: input.location ?? existing.location,
        currency: input.currency ?? existing.currency,
        price: 'price' in input ? input.price : existing.price,
        status,
        isPinned: isAdmin && typeof input.isPinned === 'boolean' ? input.isPinned : existing.isPinned,
        pinnedUntil: isAdmin ? input.pinnedUntil ?? existing.pinnedUntil : existing.pinnedUntil,
        expiresAt: isAdmin && input.expiresAt ? input.expiresAt : existing.expiresAt,
        updatedAt: now,
        awaitingRenewalConfirmation: existing.awaitingRenewalConfirmation,
        renewalRequestedAt: existing.renewalRequestedAt
      } satisfies ListingRecord;
      state.listings[idx] = updatedListing;
    });

    if (!updatedListing) {
      throw new HttpError(404, 'Listing not found');
    }
    return updatedListing;
  }

  async pinListing(listingId: string, user: UserRecord, durationHours?: number): Promise<ListingRecord> {
    await this.reconcileExpirations();
    let updatedListing: ListingRecord | undefined;
    const now = new Date();
    const duration = durationHours ?? businessRules.pinDurationHours;
    if (duration <= 0) {
      throw new HttpError(400, 'Invalid pin duration');
    }
    await dataStore.update((state) => {
      const listing = state.listings.find((item) => item.id === listingId);
      if (!listing) {
        throw new HttpError(404, 'Listing not found');
      }
      this.ensureOwnership(listing, user);
      this.ensureActive(listing);

      const activePinned = state.listings.filter((item) => {
        if (!item.isPinned || !item.pinnedUntil) {
          return false;
        }
        return new Date(item.pinnedUntil).getTime() > now.getTime();
      });

      if (!listing.isPinned && activePinned.length >= 3) {
        throw new HttpError(409, 'Pinned slots are full. Try again later.');
      }

      listing.isPinned = true;
      listing.pinnedUntil = new Date(now.getTime() + duration * 60 * 60 * 1000).toISOString();
      listing.updatedAt = now.toISOString();
      updatedListing = { ...listing };
    });

    if (!updatedListing) {
      throw new HttpError(404, 'Listing not found');
    }

    await paymentService.recordPayment({
      userId: user.id,
      listingId: listingId,
      amount: businessRules.pinPrice,
      currency: businessRules.currency,
      type: 'pin',
      status: 'succeeded',
      metadata: {
        durationHours: duration
      }
    });

    return updatedListing;
  }

  async refreshListing(listingId: string, user: UserRecord): Promise<ListingRecord> {
    await this.reconcileExpirations();
    let updatedListing: ListingRecord | undefined;
    const now = new Date();
    await dataStore.update((state) => {
      const listing = state.listings.find((item) => item.id === listingId);
      if (!listing) {
        throw new HttpError(404, 'Listing not found');
      }
      this.ensureOwnership(listing, user);
      this.ensureActive(listing);

      const withReset = this.resetRefreshCounterIfNeeded(listing, now);
      if (withReset.refreshCountToday >= businessRules.maxDailyRefreshes) {
        throw new HttpError(429, 'Daily refresh limit reached');
      }

      withReset.refreshCountToday += 1;
      withReset.lastRefreshAt = now.toISOString();
      withReset.updatedAt = now.toISOString();

      const index = state.listings.findIndex((item) => item.id === listingId);
      state.listings[index] = withReset;
      updatedListing = { ...withReset };
    });

    if (!updatedListing) {
      throw new HttpError(404, 'Listing not found');
    }

    await paymentService.recordPayment({
      userId: user.id,
      listingId,
      amount: businessRules.refreshPrice,
      currency: businessRules.currency,
      type: 'refresh',
      status: 'succeeded'
    });

    return updatedListing;
  }

  async renewListing(listingId: string, user: UserRecord): Promise<ListingRecord> {
    await this.reconcileExpirations();
    let updatedListing: ListingRecord | undefined;
    const now = new Date();
    await dataStore.update((state) => {
      const listing = state.listings.find((item) => item.id === listingId);
      if (!listing) {
        throw new HttpError(404, 'Listing not found');
      }
      this.ensureOwnership(listing, user);
      if (!listing.awaitingRenewalConfirmation) {
        throw new HttpError(409, 'Listing is not awaiting renewal');
      }

      listing.awaitingRenewalConfirmation = false;
      listing.renewalRequestedAt = undefined;
      listing.status = 'active';
      listing.expiresAt = new Date(now.getTime() + businessRules.freeListingDays * 24 * 60 * 60 * 1000).toISOString();
      listing.updatedAt = now.toISOString();
      updatedListing = { ...listing };
    });

    if (!updatedListing) {
      throw new HttpError(404, 'Listing not found');
    }
    return updatedListing;
  }

  async deactivateListing(listingId: string, user: UserRecord): Promise<ListingRecord> {
    await this.reconcileExpirations();
    let updatedListing: ListingRecord | undefined;
    const now = new Date();
    await dataStore.update((state) => {
      const listing = state.listings.find((item) => item.id === listingId);
      if (!listing) {
        throw new HttpError(404, 'Listing not found');
      }
      this.ensureOwnership(listing, user);

      listing.status = 'inactive';
      listing.awaitingRenewalConfirmation = false;
      listing.renewalRequestedAt = undefined;
      listing.isPinned = false;
      listing.pinnedUntil = undefined;
      listing.updatedAt = now.toISOString();
      updatedListing = { ...listing };
    });

    if (!updatedListing) {
      throw new HttpError(404, 'Listing not found');
    }
    return updatedListing;
  }
}

export const listingService = new ListingService();
