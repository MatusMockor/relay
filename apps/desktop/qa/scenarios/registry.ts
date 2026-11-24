import { z } from 'zod';

export const SCENARIOS = [
  'smoke',
  'actions',
  'large-account',
  'gmail-copies',
  'gmail-large',
] as const;

export const ScenarioNameSchema = z.enum(SCENARIOS);

export type ScenarioName = z.infer<typeof ScenarioNameSchema>;
