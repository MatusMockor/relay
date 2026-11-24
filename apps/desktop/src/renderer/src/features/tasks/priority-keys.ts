import type { TaskPriority } from '@relay/shared';

const BY_CODE: Readonly<Record<string, TaskPriority>> = {
  Digit1: 'urgent',
  Digit2: 'high',
  Digit3: 'medium',
  Digit4: 'low',
  Digit0: 'none',
  Numpad1: 'urgent',
  Numpad2: 'high',
  Numpad3: 'medium',
  Numpad4: 'low',
  Numpad0: 'none',
};

export const PRIORITY_CHORD_KEY = 'p';

export const priorityForCode = (code: string): TaskPriority | null => BY_CODE[code] ?? null;
