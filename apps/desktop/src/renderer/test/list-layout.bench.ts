import { bench, describe } from 'vitest';
import { buildListLayout } from '../src/features/list/list-entries';
import { threadItem } from '../src/features/mail/list-items';
import { bulkThread } from './support/bulk-demo-threads';

const NOW = new Date(2026, 10, 19, 12, 0);
const items = Array.from({ length: 50_000 }, (_, index) => threadItem(bulkThread(index, NOW)));

describe('thread list layout', () => {
  bench('groups 50 000 threads into day headers and rows', () => {
    buildListLayout(items, 'inbox', NOW);
  });
});
