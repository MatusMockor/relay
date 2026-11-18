import type { SplitRule } from '@relay/shared';

export const describeRule = (rule: SplitRule): string => {
  if (rule.type === 'fromDomain') {
    return `from:@${rule.domain}`;
  }
  if (rule.type === 'fromAddress') {
    return `from:${rule.address}`;
  }
  if (rule.type === 'subjectRegex') {
    return `subject:/${rule.pattern}/${rule.caseSensitive ? '' : 'i'}`;
  }
  if (rule.type === 'header') {
    return `header:${rule.name}~${rule.pattern}`;
  }
  return `jira:${rule.projectKeys.join(',') || '*'}`;
};

const ANY = new Set(['.+', '.*', '']);

export const readableRule = (rule: SplitRule): string => {
  if (rule.type === 'fromDomain') {
    return `od @${rule.domain}`;
  }
  if (rule.type === 'fromAddress') {
    return `od ${rule.address}`;
  }
  if (rule.type === 'subjectRegex') {
    return `predmet zodpovedá /${rule.pattern}/`;
  }
  if (rule.type === 'header') {
    return ANY.has(rule.pattern)
      ? `má hlavičku ${rule.name}`
      : `hlavička ${rule.name} zodpovedá /${rule.pattern}/`;
  }
  return rule.projectKeys.length === 0
    ? 'z Jiry, všetky projekty'
    : `z Jiry, projekty ${rule.projectKeys.join(', ')}`;
};
