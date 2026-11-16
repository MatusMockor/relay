import { z } from 'zod';

const isKnownTimeZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

export const TimeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isKnownTimeZone, 'Unknown time zone');
export type TimeZone = z.infer<typeof TimeZoneSchema>;
