import type { MessageHeaders } from '../../../model/split-match-subject';
import type { OutgoingHeaders } from '../../../model/outgoing-message';

export const AUTO_FORWARD_HEADERS: OutgoingHeaders = {
  'Auto-Submitted': 'auto-forwarded',
  'X-Relay-Automation': 'forward',
};

const AUTOMATIC_PRECEDENCE = new Set(['junk', 'auto_reply']);
const AUTO_REPLY_HEADERS = ['x-autoreply', 'x-autorespond'];

const firstValue = (headers: MessageHeaders, name: string): string | null =>
  headers.get(name)?.[0]?.trim().toLowerCase() ?? null;

const isAutoSubmitted = (headers: MessageHeaders): boolean => {
  const value = firstValue(headers, 'auto-submitted');
  return value !== null && value !== 'no';
};

const isAutoReply = (headers: MessageHeaders): boolean => {
  const precedence = firstValue(headers, 'precedence');
  if (precedence !== null && AUTOMATIC_PRECEDENCE.has(precedence)) {
    return true;
  }
  return AUTO_REPLY_HEADERS.some((name) => (headers.get(name)?.length ?? 0) > 0);
};

export const autoForwardBlockOf = (headers: MessageHeaders): string | null => {
  if ((headers.get('x-relay-automation')?.length ?? 0) > 0) {
    return 'Mail už automaticky preposlalo pravidlo Relay, ďalej sa nepreposiela';
  }
  if (isAutoSubmitted(headers)) {
    return 'Automaticky odoslaný mail sa automaticky nepreposiela';
  }
  if (isAutoReply(headers)) {
    return 'Automatická odpoveď sa automaticky nepreposiela';
  }
  return null;
};
