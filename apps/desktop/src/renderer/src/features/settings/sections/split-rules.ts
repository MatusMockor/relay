import type { SplitRule } from '@relay/shared';

const PRESENT = new Set(['.*', '']);
const NOT_EMPTY = '.+';

const domainOf = (domain: string): string => domain.trim().replace(/^@/, '');

const caseMode = (caseSensitive: boolean): string =>
  caseSensitive ? 'rozlišuje veľkosť písmen' : 'ignoruje veľkosť písmen';

const readableHeader = (name: string, pattern: string): string => {
  if (PRESENT.has(pattern)) {
    return `má hlavičku ${name}`;
  }
  if (pattern === NOT_EMPTY) {
    return `má neprázdnu hlavičku ${name}`;
  }
  return `hlavička ${name} zodpovedá /${pattern}/`;
};

export const describeRule = (rule: SplitRule): string => {
  if (rule.type === 'fromDomain') {
    return `from:@${domainOf(rule.domain)}`;
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

export const readableRule = (rule: SplitRule): string => {
  if (rule.type === 'fromDomain') {
    return `od @${domainOf(rule.domain)}`;
  }
  if (rule.type === 'fromAddress') {
    return `od ${rule.address}`;
  }
  if (rule.type === 'subjectRegex') {
    return `predmet zodpovedá /${rule.pattern}/, ${caseMode(rule.caseSensitive)}`;
  }
  if (rule.type === 'header') {
    return readableHeader(rule.name, rule.pattern);
  }
  return rule.projectKeys.length === 0
    ? 'z Jiry, všetky projekty'
    : `z Jiry, projekty ${rule.projectKeys.join(', ')}`;
};
