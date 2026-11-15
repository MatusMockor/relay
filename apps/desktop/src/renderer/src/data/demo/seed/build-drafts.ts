import type { Draft, ScheduledSend } from '@relay/shared';
import { addressOf } from './build-threads';
import { atTime } from './clock';
import { demoIds } from './ids';

export const buildDrafts = (now: Date): { drafts: Draft[]; scheduled: ScheduledSend[] } => {
  const stamp = atTime(now, [0, Math.max(0, now.getHours() - 1), 10]);
  const drafts: Draft[] = [
    {
      id: demoIds.draft('lunch'),
      accountId: demoIds.account('efa'),
      to: [addressOf('tb')],
      cc: [],
      bcc: [],
      subject: 'Re: Obed v piatok?',
      body: 'Ahoj Tomáš, idem, len prídem o 12:15.',
      inReplyToThreadId: demoIds.thread('c-lunch'),
      inReplyToMessageId: demoIds.message('c-lunch-m0'),
      attachments: [],
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: demoIds.draft('status'),
      accountId: demoIds.account('efa'),
      to: [addressOf('tb')],
      cc: [],
      bcc: [],
      subject: 'Stav Partner API',
      body: 'Ahoj Tomáš,\n\nkrátky stav: API-77 má dočasne zvýšený limit pre partnerov, limit per kľúč je rozpracovaný. WEB-482 je v review a ide do release 2.15.\n\nVďaka',
      inReplyToThreadId: null,
      inReplyToMessageId: null,
      attachments: [],
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];
  const scheduled: ScheduledSend[] = [
    {
      id: demoIds.scheduled('status'),
      userId: demoIds.user,
      accountId: demoIds.account('efa'),
      draftId: demoIds.draft('status'),
      scheduledAt: atTime(now, [1, 8, 0]),
      status: 'pending',
      error: null,
      sentAt: null,
      createdAt: stamp,
    },
  ];
  return { drafts, scheduled };
};
