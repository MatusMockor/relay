import {
  EmailAddressSchema,
  type UnsubscribeMailto,
  UnsubscribeMailtoSchema,
  type UnsubscribeOptions,
  UnsubscribeUrlSchema,
} from '@relay/shared/domain';
import type { MessageHeaders } from '../../model/split-match-subject';

const ONE_CLICK = 'list-unsubscribe=one-click';

const targetsOf = (values: readonly string[]): string[] =>
  values.flatMap((value) =>
    [...value.matchAll(/<([^>]*)>/g)].map((match) => (match[1] ?? '').replace(/\s+/g, '')),
  );

const safeDecode = (value: string): string | null => {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};

const queryValue = (search: string, name: string): string | null => {
  const pair = search
    .replace(/^\?/, '')
    .split('&')
    .map((part) => part.split('='))
    .find(([key = '']) => key.toLowerCase() === name);
  return pair === undefined ? null : safeDecode(pair.slice(1).join('='));
};

const mailtoOf = (target: string): UnsubscribeMailto | null => {
  if (!/^mailto:/i.test(target) || !URL.canParse(target)) {
    return null;
  }
  const url = new URL(target);
  const to = (safeDecode(url.pathname.split(',')[0] ?? '') ?? '').trim();
  if (!EmailAddressSchema.safeParse(to).success) {
    return null;
  }
  const parsed = UnsubscribeMailtoSchema.safeParse({
    to,
    subject: queryValue(url.search, 'subject'),
    body: queryValue(url.search, 'body'),
  });
  return parsed.success ? parsed.data : null;
};

const httpsOf = (target: string): string | null => {
  const parsed = UnsubscribeUrlSchema.safeParse(target);
  return parsed.success ? parsed.data : null;
};

const firstOf = <T>(targets: readonly string[], pick: (target: string) => T | null): T | null =>
  targets.reduce<T | null>((found, target) => found ?? pick(target), null);

export const parseListUnsubscribe = (headers: MessageHeaders): UnsubscribeOptions => {
  const targets = targetsOf(headers.get('list-unsubscribe') ?? []);
  const url = firstOf(targets, httpsOf);
  const post = headers.get('list-unsubscribe-post') ?? [];
  return {
    oneClick: url !== null && post.some((value) => value.trim().toLowerCase() === ONE_CLICK),
    url,
    mailto: firstOf(targets, mailtoOf),
  };
};

export const offersUnsubscribe = (options: UnsubscribeOptions): boolean =>
  options.url !== null || options.mailto !== null;
