import { env } from './env.js';

const numberFromEnv = (key: keyof typeof env, fallback: number): number => {
  const value = env[key];
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  return fallback;
};

const currencyFromEnv = (key: keyof typeof env, fallback: string): string => {
  const value = env[key];
  if (typeof value === 'string' && value.length > 0) {
    return value.toUpperCase();
  }
  return fallback;
};

export const businessRules = {
  freeListingDays: numberFromEnv('freeListingDays', 5),
  renewalGraceHours: numberFromEnv('renewalGraceHours', 10),
  maxDailyRefreshes: numberFromEnv('maxDailyRefreshes', 2),
  pinPrice: numberFromEnv('pinPrice', 5),
  pinDurationHours: numberFromEnv('pinDurationHours', 48),
  refreshPrice: numberFromEnv('refreshPrice', 2),
  currency: currencyFromEnv('pricingCurrency', 'GBP')
};
