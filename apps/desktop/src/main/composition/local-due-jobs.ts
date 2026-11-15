import type { EngineServices } from '@relay/engine';
import type { AiLocationGate } from '../ai/ai-location-gate';
import type { DueJob } from '../background/due-work-ticker';

export const createLocalDueJobs = (
  services: Pick<EngineServices, 'reminders' | 'compose' | 'ai'>,
  aiGate: AiLocationGate,
): DueJob[] => [
  {
    name: 'reminders',
    run: async () => {
      await services.reminders.fireDue();
    },
  },
  {
    name: 'scheduled-sends',
    run: async () => {
      await services.compose.sendDueScheduled();
    },
  },
  {
    name: 'local-ai-jobs',
    run: async () => {
      if (await aiGate.isLocal()) {
        await services.ai.processQueued();
      }
    },
  },
];
