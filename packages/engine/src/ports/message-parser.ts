import type { ParsedMessage } from '../model/parsed-message';

export interface MessageParser {
  parse(source: Uint8Array): Promise<ParsedMessage>;
}
