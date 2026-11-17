import type { ThreadAiState } from '@relay/shared';
import type { DemoState, DemoThreadRecord } from './demo-state';

const summaryOf = ({ summary }: DemoThreadRecord): string =>
  summary.aiOneLiner ?? (summary.snippet === '' ? 'Bez zhrnutia.' : summary.snippet);

export const requestDemoSummary = (state: DemoState, record: DemoThreadRecord): ThreadAiState => {
  if (!state.settings.ai.features.summaries || record.aiSummary !== null) {
    return { pending: [], jobs: [] };
  }
  record.aiSummary = summaryOf(record);
  return { pending: [], jobs: [] };
};
