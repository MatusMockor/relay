import iconv from 'iconv-lite';

export interface TextSearchMailInput {
  readonly from: { readonly name: string; readonly email: string };
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  readonly charset: 'utf-8' | 'iso-8859-2';
}

const encoded = (text: string): string =>
  `=?utf-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;

export const textSearchMail = (input: TextSearchMailInput): Buffer => {
  const header = [
    `From: ${encoded(input.from.name)} <${input.from.email}>`,
    `To: ${input.to}`,
    `Subject: ${encoded(input.subject)}`,
    'Date: Sun, 15 Nov 2026 10:00:00 +0100',
    `Message-ID: <${String(Math.random()).slice(2)}@relay.test>`,
    'MIME-Version: 1.0',
    `Content-Type: text/plain; charset=${input.charset}`,
    'Content-Transfer-Encoding: 8bit',
    '',
    '',
  ].join('\r\n');
  return Buffer.concat([
    Buffer.from(header, 'ascii'),
    iconv.encode(`${input.body}\r\n`, input.charset),
  ]);
};
