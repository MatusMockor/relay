import type { Linter } from 'eslint';
import type { BoundaryKind } from './index.js';

export declare const boundaryKinds: BoundaryKind[];
export declare function boundaryConfig(kind: BoundaryKind): Linter.Config[];
