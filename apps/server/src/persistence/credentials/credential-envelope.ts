import { CredentialDecryptionError } from './credential-decryption-error';

export const ENVELOPE_VERSION = 'v1';

export interface CredentialEnvelope {
  readonly iv: Buffer;
  readonly tag: Buffer;
  readonly ciphertext: Buffer;
}

const SEPARATOR = '.';

export const formatEnvelope = (envelope: CredentialEnvelope): string =>
  [
    ENVELOPE_VERSION,
    envelope.iv.toString('base64url'),
    envelope.tag.toString('base64url'),
    envelope.ciphertext.toString('base64url'),
  ].join(SEPARATOR);

export const parseEnvelope = (raw: string): CredentialEnvelope => {
  const [version, iv, tag, ciphertext, ...rest] = raw.split(SEPARATOR);
  if (version !== ENVELOPE_VERSION) {
    throw new CredentialDecryptionError(
      `Unsupported credential envelope version ${String(version)}`,
    );
  }
  if (iv === undefined || tag === undefined || ciphertext === undefined || rest.length > 0) {
    throw new CredentialDecryptionError('Malformed credential envelope');
  }
  return {
    iv: Buffer.from(iv, 'base64url'),
    tag: Buffer.from(tag, 'base64url'),
    ciphertext: Buffer.from(ciphertext, 'base64url'),
  };
};
