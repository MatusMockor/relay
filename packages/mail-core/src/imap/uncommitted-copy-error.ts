import { ProviderError } from '@relay/engine';

export interface UncommittedCopy {
  readonly uidMap: ReadonlyMap<number, number>;
  readonly sourceUidValidity: bigint | null;
  readonly targetUidValidity: bigint | null;
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : 'unknown error';

export class UncommittedCopyError extends ProviderError {
  constructor(
    readonly copy: UncommittedCopy,
    cause: unknown,
  ) {
    super(describe(cause), { cause });
  }
}
