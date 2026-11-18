import type { MailFlag } from '@relay/engine';
import type { MessageFlags } from '@relay/shared/domain';
import { decodeKeyword } from './keyword-codec';

const SYSTEM_FLAGS: Readonly<Record<MailFlag, string>> = {
  seen: '\\Seen',
  flagged: '\\Flagged',
  answered: '\\Answered',
};

export const toImapFlags = (flags: readonly MailFlag[]): string[] =>
  flags.map((flag) => SYSTEM_FLAGS[flag]);

export const toImapFlagsFromState = (flags: Partial<MessageFlags>): string[] =>
  (Object.keys(SYSTEM_FLAGS) as MailFlag[])
    .filter((flag) => flags[flag] === true)
    .map((flag) => SYSTEM_FLAGS[flag]);

export const toMessageFlags = (flags: ReadonlySet<string> | undefined): MessageFlags => ({
  seen: flags?.has(SYSTEM_FLAGS.seen) ?? false,
  flagged: flags?.has(SYSTEM_FLAGS.flagged) ?? false,
  answered: flags?.has(SYSTEM_FLAGS.answered) ?? false,
});

export const toKeywords = (flags: ReadonlySet<string> | undefined): string[] =>
  [...(flags ?? [])]
    .filter((flag) => !flag.startsWith('\\'))
    .map(decodeKeyword)
    .sort();
