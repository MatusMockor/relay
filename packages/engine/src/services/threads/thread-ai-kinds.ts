import type {
  MailAccount,
  Message,
  ThreadAiKind,
  ThreadSummary,
  UserSettings,
} from '@relay/shared/domain';

export interface ThreadAiSubject {
  readonly settings: UserSettings;
  readonly thread: ThreadSummary;
  readonly account: MailAccount | null;
  readonly latest: Message;
}

export type ThreadAiKindPicker = (subject: ThreadAiSubject) => ThreadAiKind[];

const isFromAccount = (message: Message, account: MailAccount | null): boolean =>
  account !== null && message.from?.email.toLowerCase() === account.email.toLowerCase();

const wantsReplySuggestions = ({ settings, thread, account, latest }: ThreadAiSubject): boolean =>
  settings.ai.features.replySuggestions &&
  thread.jiraKey === null &&
  latest.from !== null &&
  !isFromAccount(latest, account);

export const openedThreadAiKinds: ThreadAiKindPicker = (subject) =>
  wantsReplySuggestions(subject) ? ['replySuggestions'] : [];

export const requestedSummaryKinds: ThreadAiKindPicker = ({ settings }) =>
  settings.ai.features.summaries ? ['summary'] : [];
