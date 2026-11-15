import type { ParseResult } from '../output/parse-result';
import type { MailToolName } from './mail-tools';

export interface PreparedPrompt<Output> {
  readonly kind: string;
  readonly system: string;
  readonly text: string;
  readonly tools: readonly MailToolName[];
  parse(raw: string): ParseResult<Output>;
  repair(raw: string, error: string): PreparedPrompt<Output>;
}
