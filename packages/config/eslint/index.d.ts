import type { Linter } from 'eslint';

export type BoundaryKind = 'shared' | 'engine' | 'package' | 'app';

export interface RelayConfigOptions {
  tsconfigRootDir: string;
  boundary: BoundaryKind;
  react?: boolean;
  ignores?: string[];
}

export declare const boundaryKinds: BoundaryKind[];
export declare const codeStyleRules: Record<string, Linter.RuleEntry>;
export declare function relayConfig(options: RelayConfigOptions): Linter.Config[];
