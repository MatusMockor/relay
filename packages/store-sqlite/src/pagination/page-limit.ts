import { ValidationError } from '@relay/engine';

export const assertPageLimit = (limit: number): number => {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new ValidationError('Page limit must be a positive integer');
  }
  return limit;
};
