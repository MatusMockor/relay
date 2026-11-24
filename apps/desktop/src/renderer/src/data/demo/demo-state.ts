import type {
  Automation,
  AutomationActivity,
  ChecklistItem,
  Draft,
  Label,
  MailAccount,
  Mailbox,
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
  automations: Automation[];
  ruleHistory: AutomationActivity[];
  labels: Label[];
  mailboxes: Mailbox[];
  threads: Map<string, DemoThreadRecord>;
  archive: Map<string, DemoThreadRecord>;
  tasks: Task[];
  drafts: Draft[];
  scheduled: ScheduledSend[];
  settings: UserSettings;
}
