import type { Address } from '@relay/shared/domain';
import type { MessageParser, ParsedMessage } from '../../../src';

const LIST_TOKEN = /"(?:[^"\\]|\\.)*"|<[^>]*>|[^,"<]+|,|./g;
const QUOTED_STRING = /^"((?:[^"\\]|\\.)*)"$/;

const splitAddressList = (value: string): string[] =>
  (value.match(LIST_TOKEN) ?? []).reduce<string[]>(
    (parts, token) =>
      token === ',' ? [...parts, ''] : [...parts.slice(0, -1), `${parts.at(-1) ?? ''}${token}`],
    [''],
  );

const displayName = (value: string): string | null => {
  const trimmed = value.trim();
  const quoted = QUOTED_STRING.exec(trimmed);
  const name = quoted === null ? trimmed : (quoted[1] ?? '').replace(/\\(.)/g, '$1');
  return name === '' ? null : name;
};

const parseAddress = (value: string): Address | null => {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const match = /^(.*)<([^>]+)>$/.exec(trimmed);
  if (match === null) {
    return { name: null, email: trimmed };
  }
  return { name: displayName(match[1] ?? ''), email: (match[2] ?? '').trim() };
};

const parseAddresses = (value: string | undefined): Address[] =>
  splitAddressList(value ?? '')
    .map(parseAddress)
    .filter((address): address is Address => address !== null);

const parseHeaders = (block: string): Map<string, string[]> => {
  const headers = new Map<string, string[]>();
  block.split('\r\n').forEach((line) => {
    const index = line.indexOf(':');
    if (index <= 0) {
      return;
    }
    const name = line.slice(0, index).trim().toLowerCase();
    headers.set(name, [...(headers.get(name) ?? []), line.slice(index + 1).trim()]);
  });
  return headers;
};

export class SimpleMessageParser implements MessageParser {
  parse(source: Uint8Array): Promise<ParsedMessage> {
    if (source.byteLength === 0) {
      return Promise.reject(new Error('Empty message source'));
    }
    const text = new TextDecoder().decode(source);
    const split = text.indexOf('\r\n\r\n');
    const headerBlock = split === -1 ? text : text.slice(0, split);
    const body = split === -1 ? '' : text.slice(split + 4);
    const headers = parseHeaders(headerBlock);
    const first = (name: string): string | undefined => headers.get(name)?.[0];
    const references = (first('references') ?? '').split(/\s+/).filter((ref) => ref !== '');
    return Promise.resolve({
      messageIdHeader: first('message-id') ?? null,
      inReplyTo: first('in-reply-to') ?? null,
      references,
      from: parseAddresses(first('from'))[0] ?? null,
      to: parseAddresses(first('to')),
      cc: parseAddresses(first('cc')),
      bcc: parseAddresses(first('bcc')),
      replyTo: parseAddresses(first('reply-to')),
      subject: first('subject') ?? '',
      date: first('date') ?? '',
      textBody: body,
      htmlBody: null,
      snippet: body.replace(/\s+/g, ' ').trim().slice(0, 140),
      headers,
      attachments: [],
    });
  }
}
