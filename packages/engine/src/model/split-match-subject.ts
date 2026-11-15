import type { Address } from '@relay/shared/domain';

export type MessageHeaders = ReadonlyMap<string, readonly string[]>;

export interface SplitMatchSubject {
  readonly from: Address | null;
  readonly subject: string;
  readonly headers: MessageHeaders;
}
