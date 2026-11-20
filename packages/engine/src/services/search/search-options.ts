export interface SearchOptions {
  readonly deadlineMs: number;
  readonly maxFolders: number;
  readonly uidsPerMailbox: number;
  readonly maxTerms: number;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  deadlineMs: 8_000,
  maxFolders: 12,
  uidsPerMailbox: 50,
  maxTerms: 8,
};
