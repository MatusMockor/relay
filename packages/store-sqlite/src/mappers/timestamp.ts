import { ValidationError } from '@relay/engine';

export const toTimestamp = (iso: string): number => {
  const value = Date.parse(iso);
  if (Number.isNaN(value)) {
    throw new ValidationError(`Invalid timestamp ${iso}`);
  }
  return value;
};
