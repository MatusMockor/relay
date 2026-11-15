import type {
  ChecklistItem,
  Draft,
  Label,
  MailAccount,
  Message,
  ReplySuggestion,
  ScheduledSend,
  Split,
  Task,
  ThreadSummary,
  UserSettings,
} from '@relay/shared';

export interface DemoThreadRecord {
  summary: ThreadSummary;
  messages: Message[];
  aiSummary: string | null;
  checklist: ChecklistItem[];
  replySuggestions: ReplySuggestion[];
}

export interface DemoState {
  accounts: MailAccount[];
  splits: Split[];
  labels: Label[];
  threads: Map<string, DemoThreadRecord>;
  tasks: Task[];
  drafts: Draft[];
  scheduled: ScheduledSend[];
  settings: UserSettings;
}
