import { dm, listTimeLabel } from '../../lib/dates';

export const searchDateLabel = (iso: string, now: Date): string => {
  const date = new Date(iso);
  if (date.getFullYear() === now.getFullYear()) {
    return listTimeLabel(iso, now);
  }
  return `${dm(date)} ${String(date.getFullYear())}`;
};
