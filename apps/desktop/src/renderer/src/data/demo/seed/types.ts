import type { TaskPriority } from '@relay/shared';

export type DemoAccountKey = 'efa' | 'os' | 'fl';
export type DemoSplitKey = 'jira' | 'other' | 'clients';
export type DemoLabelKey =
  | 'efa'
  | 'jira'
  | 'fam'
  | 'shop'
  | 'cli'
  | 'inv'
  | 'acme'
  | 'trip'
  | 'trip-it';
export type DemoAt = readonly [days: number, hours: number, minutes: number];
export interface DemoCopies {
  readonly cc?: readonly string[];
  readonly bcc?: readonly string[];
}
export type DemoMessage = readonly [from: string, at: DemoAt, text: string, copies?: DemoCopies];

export interface DemoPerson {
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly bot?: boolean;
}

export interface DemoThread {
  readonly id: string;
  readonly acct: DemoAccountKey;
  readonly from: string;
  readonly subj: string;
  readonly msgs: readonly DemoMessage[];
  readonly split?: DemoSplitKey;
  readonly key?: string;
  readonly unread?: boolean;
  readonly ai?: string;
  readonly sum?: string;
  readonly list?: readonly string[];
  readonly sugs?: readonly (readonly [label: string, body: string])[];
  readonly markedDone?: boolean;
  readonly state?: 'inbox' | 'done' | 'trash' | 'spam' | 'reminder';
  readonly remindAt?: DemoAt;
  readonly labels?: readonly DemoLabelKey[];
  readonly folder?: string;
  readonly html?: string;
  readonly task?: {
    readonly title: string;
    readonly what: string;
    readonly state: 'open' | 'waiting';
    readonly priority: TaskPriority;
    readonly source?: 'ai' | 'manual';
  };
}
