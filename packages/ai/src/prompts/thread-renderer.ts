import type { Address, Message, ThreadDetail } from '@relay/shared/domain';
import { htmlToText } from './html-to-text';

const MAX_MESSAGE_CHARS = 6_000;
const MAX_THREAD_CHARS = 40_000;

export function renderThread(detail: ThreadDetail): string {
  const header = [
    `thread_id: ${detail.thread.id}`,
    `subject: ${detail.thread.subject}`,
    `participants: ${detail.thread.participants.map(formatAddress).join(', ')}`,
  ].join('\n');
  return [header, ...renderMessages(detail.messages)].join('\n\n');
}

function renderMessages(messages: readonly Message[]): string[] {
  const rendered: string[] = [];
  let budget = MAX_THREAD_CHARS;
  for (const message of [...messages].reverse()) {
    if (budget <= 0) {
      break;
    }
    const text = renderMessage(message).slice(0, budget);
    budget -= text.length;
    rendered.unshift(text);
  }
  return rendered;
}

function renderMessage(message: Message): string {
  const headers = [
    `--- message ${message.id}`,
    `from: ${message.from === null ? 'unknown' : formatAddress(message.from)}`,
    `to: ${message.to.map(formatAddress).join(', ')}`,
    message.cc.length > 0 ? `cc: ${message.cc.map(formatAddress).join(', ')}` : null,
    `date: ${message.date}`,
    `subject: ${message.subject}`,
  ].filter((line): line is string => line !== null);
  return [...headers, '', messageBody(message)].join('\n');
}

function messageBody(message: Message): string {
  const text = firstNonBlank([
    () => message.textBody,
    () => (message.htmlBody === null ? null : htmlToText(message.htmlBody)),
    () => message.snippet,
  ]);
  if (text.length <= MAX_MESSAGE_CHARS) {
    return text;
  }
  return `${text.slice(0, MAX_MESSAGE_CHARS)}\n[...]`;
}

function firstNonBlank(candidates: readonly (() => string | null)[]): string {
  for (const candidate of candidates) {
    const text = candidate()?.trim() ?? '';
    if (text.length > 0) {
      return text;
    }
  }
  return '';
}

export function formatAddress(address: Address): string {
  return address.name === null ? address.email : `${address.name} <${address.email}>`;
}
