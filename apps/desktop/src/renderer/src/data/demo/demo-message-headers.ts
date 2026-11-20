import type { Message, UnsubscribeOptions } from '@relay/shared';
import { demoUnsubscribeFor } from './demo-unsubscribe';

const listUnsubscribe = (options: UnsubscribeOptions | undefined): string[] => {
  if (options === undefined) {
    return [];
  }
  const targets = [
    options.url === null ? null : `<${options.url}>`,
    options.mailto === null ? null : `<mailto:${options.mailto.to}>`,
  ].filter((target): target is string => target !== null);
  return targets.length === 0 ? [] : [targets.join(', ')];
};

export const demoHeaderValues = (message: Message, name: string): string[] => {
  if (name.trim().toLowerCase() !== 'list-unsubscribe') {
    return [];
  }
  return listUnsubscribe(demoUnsubscribeFor(message.from?.email ?? ''));
};
