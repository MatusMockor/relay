import type { Address } from '@relay/shared/domain';

export interface RawMessageSpec {
  readonly messageId: string;
  readonly from: Address;
  readonly to: readonly Address[];
  readonly cc?: readonly Address[];
  readonly subject: string;
  readonly date: string;
  readonly body: string;
  readonly inReplyTo?: string | null;
  readonly references?: readonly string[];
  readonly headers?: Readonly<Record<string, string>>;
}

const quoteDisplayName = (name: string): string => `"${name.replace(/[\\"]/g, '\\$&')}"`;

export const formatAddress = (address: Address): string =>
  address.name === null ? address.email : `${quoteDisplayName(address.name)} <${address.email}>`;

export const buildRawMessage = (spec: RawMessageSpec): Uint8Array => {
  const lines = [
    `Message-ID: ${spec.messageId}`,
    `From: ${formatAddress(spec.from)}`,
    `To: ${spec.to.map(formatAddress).join(', ')}`,
    ...(spec.cc === undefined || spec.cc.length === 0
      ? []
      : [`Cc: ${spec.cc.map(formatAddress).join(', ')}`]),
    `Subject: ${spec.subject}`,
    `Date: ${spec.date}`,
    ...(spec.inReplyTo == null ? [] : [`In-Reply-To: ${spec.inReplyTo}`]),
    ...(spec.references === undefined || spec.references.length === 0
      ? []
      : [`References: ${spec.references.join(' ')}`]),
    ...Object.entries(spec.headers ?? {}).map(([name, value]) => `${name}: ${value}`),
  ];
  return new TextEncoder().encode(`${lines.join('\r\n')}\r\n\r\n${spec.body}`);
};
