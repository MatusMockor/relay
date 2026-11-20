import { ValidationError } from '../../errors';

export class AutomationActionRefusal extends ValidationError {}

export const refusalReasonOf = (error: unknown): string | undefined =>
  error instanceof AutomationActionRefusal ? error.message : undefined;
