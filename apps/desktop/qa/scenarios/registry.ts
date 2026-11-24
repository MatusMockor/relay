import { z } from 'zod';

export const SCENARIOS = [
  'smoke',
  'actions',
  'large-account',
  'gmail-copies',
  'gmail-large',
  'gmail-upgrade',
] as const;

export const ScenarioNameSchema = z.enum(SCENARIOS);

export type ScenarioName = z.infer<typeof ScenarioNameSchema>;
