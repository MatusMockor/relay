import { plural } from '../../lib/text';

export const localCount = (count: number): string =>
  `${String(count)} ${plural(count, 'lokálny', 'lokálne', 'lokálnych')}`;
