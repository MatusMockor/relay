import { AutomationIdSchema, ThreadIdSchema } from '@relay/shared/domain';
import type { RealtimeEvent } from '@relay/shared/realtime';
import { describe, expect, it } from 'vitest';
import { EventHub } from '../../src/main/events/event-hub';
import { AutomationNotifier } from '../../src/main/native/automation-notifier';
import type { MailNotification } from '../../src/main/native/new-mail-notifier';

const notified = (body: string): RealtimeEvent => ({
  type: 'automation.notified',
  at: '2026-11-17T10:00:00.000Z',
  data: {
    automationId: AutomationIdSchema.parse('automation-1'),
    automationName: 'Od Tibora',
    threadId: ThreadIdSchema.parse('thr-1'),
    title: 'Tibor Hrasko',
    body,
  },
});

describe('AutomationNotifier', () => {
  it('shows a notification for every automation notify event until it stops', () => {
    const hub = new EventHub<RealtimeEvent>();
    const shown: MailNotification[] = [];
    const notifier = new AutomationNotifier(hub, { show: (item) => shown.push(item) });

    notifier.start();
    hub.publish(notified('Ponuka'));
    hub.publish({
      type: 'sync.progress',
      at: '2026-11-17T10:00:00.000Z',
      data: {
        accountId: 'acc-1' as never,
        mailboxId: null,
        phase: 'idle',
        processed: 0,
        total: null,
      },
    });
    notifier.stop();
    hub.publish(notified('Po zastavení'));

    expect(shown).toEqual([
      { title: 'Tibor Hrasko', body: 'Ponuka', threadId: ThreadIdSchema.parse('thr-1') },
    ]);
  });
});
