import { dayDiff, dm } from '../../lib/dates';

export interface DueLabel {
  readonly text: string;
  readonly late: boolean;
}

const RELATIVE: Readonly<Record<string, string>> = { '-1': 'včera', '0': 'dnes', '1': 'zajtra' };

export const dueLabelOf = (dueDate: string, now: Date): DueLabel => {
  const [year = 0, month = 1, day = 1] = dueDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const diff = dayDiff(date, now);
  const sameYear = year === now.getFullYear();
  const text = RELATIVE[String(diff)] ?? (sameYear ? dm(date) : `${dm(date)} ${String(year)}`);
  return { text, late: diff < 0 };
};
