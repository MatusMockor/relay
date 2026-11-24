const CRLF = '\r\n';

const TRACE_LINES = [
  'Received: from mx.partner.test (mx.partner.test [192.0.2.10])',
  '\tby mail.relay.test with ESMTPS id abc123; Sun, 15 Nov 2026 10:00:01 +0100',
  'Received: from localhost by mx.partner.test; Sun, 15 Nov 2026 10:00:00 +0100',
  'DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=partner.test; s=sel;',
  '\th=from:to:subject:date:message-id; bh=47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=;',
  '\tb=dGVzdHNpZ25hdHVyZXRlc3RzaWduYXR1cmV0ZXN0c2lnbmF0dXJl',
  'ARC-Seal: i=1; a=rsa-sha256; t=1763197200; cv=none; d=partner.test; s=arc; b=c2VhbA==',
  'Authentication-Results: mail.relay.test; dkim=pass header.d=partner.test; spf=pass',
  'Received-SPF: pass (mail.relay.test: domain of partner.test designates 192.0.2.10)',
];

export interface HeaderInput {
  readonly id: string;
  readonly subject: string;
  readonly contentType: string;
  readonly encoding?: string;
}

export const headerBlock = (input: HeaderInput): string[] => [
  ...TRACE_LINES,
  'From: =?UTF-8?Q?Pet=C3=ADr_Nov=C3=A1k?= <peter@partner.test>',
  'To: Relay <me@relay.test>, =?UTF-8?Q?J=C3=A1n_Kov=C3=A1=C4=8D?= <jan@partner.test>',
  'Cc: Team <team@partner.test>',
  `Subject: =?UTF-8?B?${Buffer.from(input.subject, 'utf8').toString('base64')}?=`,
  'Date: Sun, 15 Nov 2026 10:00:00 +0100',
  `Message-ID: <${input.id}@partner.test>`,
  'In-Reply-To: <parent-1@partner.test>',
  'References: <root-1@partner.test>',
  ' <parent-1@partner.test>',
  'List-Unsubscribe: <https://partner.test/unsubscribe>',
  'MIME-Version: 1.0',
  `Content-Type: ${input.contentType}`,
  ...(input.encoding === undefined ? [] : [`Content-Transfer-Encoding: ${input.encoding}`]),
];

export const message = (input: HeaderInput, body: readonly string[]): Uint8Array =>
  Buffer.from([...headerBlock(input), '', ...body].join(CRLF), 'latin1');

export interface PartInput {
  readonly headers: readonly string[];
  readonly body: string;
}

export const multipart = (boundary: string, parts: readonly PartInput[]): string[] => [
  ...parts.flatMap((part) => [`--${boundary}`, ...part.headers, '', part.body]),
  `--${boundary}--`,
  '',
];

export const nested = (contentType: string, boundary: string, parts: readonly PartInput[]) => ({
  headers: [`Content-Type: ${contentType}; boundary="${boundary}"`],
  body: multipart(boundary, parts).join(CRLF),
});

export const base64Lines = (bytes: Buffer): string =>
  (bytes.toString('base64').match(/.{1,76}/g) ?? []).join(CRLF);

export const utf8 = (text: string): string => Buffer.from(text, 'utf8').toString('latin1');

export const textPart = (text: string, extra: readonly string[] = []): PartInput => ({
  headers: ['Content-Type: text/plain; charset=utf-8', ...extra],
  body: utf8(text),
});

export const htmlPart = (html: string): PartInput => ({
  headers: ['Content-Type: text/html; charset=utf-8'],
  body: utf8(html),
});

export const binaryPart = (headers: readonly string[], bytes: Buffer): PartInput => ({
  headers: [...headers, 'Content-Transfer-Encoding: base64'],
  body: base64Lines(bytes),
});

export interface SummaryFixture {
  readonly name: string;
  readonly source: Uint8Array;
  readonly flags?: readonly string[];
  readonly snippetPrefix?: boolean;
  readonly maxWireBytes: number;
}

const NORMAL_WIRE_BYTES = 8 * 1024;

export const fixture = (
  name: string,
  source: Uint8Array,
  extra: Partial<SummaryFixture> = {},
): SummaryFixture => ({ name, source, maxWireBytes: NORMAL_WIRE_BYTES, ...extra });
