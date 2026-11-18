import { AccountScopeSchema } from '@relay/shared/ipc';
import type { AccountScope } from '../../state/folders';

const SCOPE_KEY = 'relay.scope';

export const readStoredScope = (): AccountScope | null => {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(SCOPE_KEY) ?? 'null');
    const parsed = AccountScopeSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const writeStoredScope = (scope: AccountScope): void => {
  try {
    window.localStorage.setItem(SCOPE_KEY, JSON.stringify(scope));
  } catch {
    return;
  }
};
