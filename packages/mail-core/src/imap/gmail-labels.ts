import type { ImapFlow } from 'imapflow';
import { decodeModifiedUtf7 } from './modified-utf7';

export type LabelCapabilityClient = Pick<ImapFlow, 'capabilities' | 'enabled'>;

export interface LabelReading {
  readonly labels: boolean;
  readonly utf8: boolean;
}

const GMAIL_EXTENSION = 'X-GM-EXT-1';

export const hasGmailLabels = (client: Pick<ImapFlow, 'capabilities'>): boolean =>
  client.capabilities.has(GMAIL_EXTENSION);

export const labelReadingOf = (client: LabelCapabilityClient): LabelReading => ({
  labels: hasGmailLabels(client),
  utf8: client.enabled.has('UTF8=ACCEPT') || client.enabled.has('IMAP4REV2'),
});

const unquoted = (value: string): string =>
  value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;

const decodedLabel = (value: string, reading: LabelReading): string => {
  const label = unquoted(value);
  if (reading.utf8 || label.startsWith('\\')) {
    return label;
  }
  return decodeModifiedUtf7(label);
};

export const toGmailLabels = (
  reading: LabelReading,
  labels: ReadonlySet<string> | undefined,
): string[] | null => {
  if (!reading.labels) {
    return null;
  }
  return [...new Set([...(labels ?? [])].map((label) => decodedLabel(label, reading)))]
    .filter((label) => label !== '')
    .sort();
};
