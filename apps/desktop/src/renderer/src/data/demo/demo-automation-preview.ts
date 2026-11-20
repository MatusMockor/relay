import {
  type AutomationPreviewBody,
  AutomationPreviewBodySchema,
  type AutomationPreviewResponse,
} from '@relay/shared';
import { MailClientError } from '../errors';
import { demoPreviewResponse, demoRecentMatches } from './demo-recent-matches';
import type { DemoState } from './demo-state';

export const createDemoAutomationPreview =
  (state: DemoState, now: () => Date) =>
  (body: AutomationPreviewBody): AutomationPreviewResponse => {
    const parsed = AutomationPreviewBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new MailClientError({ code: 'validation_failed', message: 'Pravidlo nie je platné' });
    }
    return demoPreviewResponse(demoRecentMatches(state, now, parsed.data.accountId, parsed.data));
  };
