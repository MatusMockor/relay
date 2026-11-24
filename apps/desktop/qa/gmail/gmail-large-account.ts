import { largeAccount } from '../seed/large-account';
import { CLIENT_LABEL, GMAIL } from './gmail-layout';
import type { GmailSeed, GmailSeedMessage } from './gmail-seed';

export interface GmailLargeOptions {
  readonly count: number;
  readonly labelEvery?: number;
}

function* placed(owner: string, options: GmailLargeOptions): Generator<GmailSeedMessage> {
  const labelEvery = options.labelEvery ?? 10;
  let index = 0;
  for (const message of largeAccount(owner, { count: options.count }).messages()) {
    const labelled = index % labelEvery === labelEvery - 1;
    yield { message, folders: labelled ? [GMAIL.inbox, CLIENT_LABEL] : [GMAIL.inbox] };
    index += 1;
  }
}

export const gmailLargeAccount = (owner: string, options: GmailLargeOptions): GmailSeed => ({
  total: options.count,
  messages: () => placed(owner, options),
});
