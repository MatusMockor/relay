export interface SeedAddress {
  readonly name: string;
  readonly address: string;
}

export interface SeedMessage {
  readonly mailbox: string;
  readonly messageId: string;
  readonly from: SeedAddress;
  readonly to: SeedAddress;
  readonly subject: string;
  readonly text: string;
  readonly date: Date;
  readonly inReplyTo?: string;
  readonly references?: readonly string[];
  readonly seen?: boolean;
}

export interface SeedScenario {
  readonly mailboxes: readonly string[];
  readonly total: number;
  readonly messages: () => Iterable<SeedMessage>;
}
