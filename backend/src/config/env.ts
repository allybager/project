import dotenv from 'dotenv';
import path from 'node:path';

const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const required = ['JWT_SECRET', 'PORT', 'DATA_FILE'] as const;
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const optionalNumber = (key: string): number | undefined => {
  const raw = process.env[key];
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value for ${key}`);
  }
  return parsed;
};

export const env = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET as string,
  dataFile: path.resolve(process.cwd(), process.env.DATA_FILE as string),
  freeListingDays: optionalNumber('FREE_LISTING_DAYS'),
  renewalGraceHours: optionalNumber('RENEWAL_GRACE_HOURS'),
  maxDailyRefreshes: optionalNumber('MAX_DAILY_REFRESHES'),
  pinPrice: optionalNumber('PIN_PRICE_GBP'),
  pinDurationHours: optionalNumber('PIN_DURATION_HOURS'),
  refreshPrice: optionalNumber('REFRESH_PRICE_GBP'),
  pricingCurrency: process.env.PRICING_CURRENCY
};
