import type { AutomationCondition } from '@relay/shared';

export const isNewsletterHeader = (condition: AutomationCondition): boolean =>
  condition.type === 'header' &&
  condition.name.toLowerCase() === 'list-unsubscribe' &&
  condition.pattern === '.+';
