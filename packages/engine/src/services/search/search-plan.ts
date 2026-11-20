import type { RemoteTextSearch, RemoteTextSearchField } from '../../model/remote-mail';
import type { SearchTarget } from './search-mailboxes';

export type AccountSearchPlan =
  | { readonly kind: 'skip' }
  | {
      readonly kind: 'search';
      readonly targets: readonly SearchTarget[];
      readonly query: RemoteTextSearch;
    };

export interface SearchPlanInput {
  readonly terms: readonly string[];
  readonly field: RemoteTextSearchField;
  readonly targets: readonly SearchTarget[];
  readonly historyComplete: boolean;
  readonly cutoff: Date | null | undefined;
  readonly limit: number;
}

const SKIP: AccountSearchPlan = { kind: 'skip' };

const coveredLocally = (input: SearchPlanInput): boolean =>
  input.historyComplete && (input.field !== 'all' || input.cutoff === null);

export const planAccountSearch = (input: SearchPlanInput): AccountSearchPlan => {
  if (input.terms.length === 0 || input.targets.length === 0 || coveredLocally(input)) {
    return SKIP;
  }
  const before = input.historyComplete && input.cutoff instanceof Date ? input.cutoff : undefined;
  return {
    kind: 'search',
    targets: input.targets,
    query: {
      terms: input.terms,
      field: input.field,
      limit: input.limit,
      ...(before === undefined ? {} : { before }),
    },
  };
};
