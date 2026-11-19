import { expect } from 'vitest';

export const present = <Value>(value: Value | null | undefined): Value => {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
  return value as Value;
};
