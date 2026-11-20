import { charsetFixtures } from './summary-charset-fixtures';
import type { SummaryFixture } from './summary-mime';
import { partFixtures } from './summary-part-fixtures';
import { textFixtures } from './summary-text-fixtures';

export type { SummaryFixture } from './summary-mime';

export const summaryFixtures = (): SummaryFixture[] => [
  ...textFixtures(),
  ...charsetFixtures(),
  ...partFixtures(),
];
