import type { OutgoingMessage } from '@relay/engine';
import { describe, expect, it } from 'vitest';
import { composeMime } from '../../src/smtp/compose-mime';

const message: OutgoingMessage = {
  from: { name: null, email: 'meno@relay.test' },
  to: [{ name: null, email: 'uctovnicka@relay.test' }],
  cc: [],
  bcc: [],
  subject: 'Fwd: Faktúra',
  text: 'Preposlaná správa',
  html: null,
  inReplyTo: null,
  references: [],
  attachments: [],
  headers: { 'Auto-Submitted': 'auto-forwarded', 'X-Relay-Automation': 'forward' },
};

describe('extra outgoing headers', () => {
  it('writes them into the sent message and its Sent copy', async () => {
    const { raw, sentCopy } = await composeMime(message);

    for (const source of [raw, sentCopy]) {
      const lines = source.toString('utf8').split('\r\n');
      expect(lines).toContain('Auto-Submitted: auto-forwarded');
      expect(lines).toContain('X-Relay-Automation: forward');
    }
  });

  it('leaves them out when the message has none', async () => {
    const { raw } = await composeMime({ ...message, headers: undefined });

    expect(raw.toString('utf8')).not.toContain('Auto-Submitted');
  });
});
