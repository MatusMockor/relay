import type ICAL from 'ical.js';

type Component = InstanceType<typeof ICAL.Component>;

export const isThisAndFuture = (vevent: Component): boolean => {
  const range: unknown = vevent.getFirstProperty('recurrence-id')?.getParameter('range');
  return typeof range === 'string' && range.trim().toUpperCase() === 'THISANDFUTURE';
};
