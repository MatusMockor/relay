export interface SplitPatternPolicy {
  isUnsafe(pattern: string): boolean;
}
