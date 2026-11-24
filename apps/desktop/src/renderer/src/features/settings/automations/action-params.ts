import { MAX_REMIND_DAYS, MIN_REMIND_DAYS } from '@relay/shared';

export const DEFAULT_REMIND_DAYS = 3;

export const REMIND_DAY_OPTIONS: readonly number[] = Array.from(
  { length: MAX_REMIND_DAYS - MIN_REMIND_DAYS + 1 },
  (_, index) => MIN_REMIND_DAYS + index,
);

export const daysLabel = (days: number): string => {
  if (days === 1) {
    return '1 deň';
  }
  if (days >= 2 && days <= 4) {
    return `${String(days)} dni`;
  }
  return `${String(days)} dní`;
};

export const remindLabel = (days: number): string => `Pripomenúť o ${daysLabel(days)}`;

export const forwardLabel = (to: string): string => `Preposlať na ${to}`;

export const REMIND_IDLE_LABEL = 'Pripomenúť o niekoľko dní';

export const FORWARD_IDLE_LABEL = 'Preposlať na adresu';
