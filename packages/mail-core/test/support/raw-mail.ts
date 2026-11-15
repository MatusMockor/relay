export interface RawMailInput {
  readonly from?: string;
  readonly to: string;
  readonly subject: string;
  readonly messageId?: string;
  readonly inReplyTo?: string;
  readonly body?: string;
}

export const rawMail = (input: RawMailInput): Uint8Array => {
  const lines = [
    `From: ${input.from ?? 'Sender <sender@relay.test>'}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    `Date: Sun, 15 Nov 2026 10:00:00 +0100`,
    `Message-ID: ${input.messageId ?? `<${String(Math.random()).slice(2)}@relay.test>`}`,
    ...(input.inReplyTo
      ? [`In-Reply-To: ${input.inReplyTo}`, `References: ${input.inReplyTo}`]
      : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    input.body ?? 'Hello from the test.',
    '',
  ];
  return new TextEncoder().encode(lines.join('\r\n'));
};

export const fixturePath = (name: string): string =>
  new URL(`../fixtures/${name}`, import.meta.url).pathname;
