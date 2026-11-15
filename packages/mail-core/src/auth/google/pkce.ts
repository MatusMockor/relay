import { createHash, randomBytes } from 'node:crypto';

export interface PkcePair {
  readonly codeVerifier: string;
  readonly codeChallenge: string;
  readonly codeChallengeMethod: 'S256';
}

export const createPkceChallenge = (codeVerifier: string): string =>
  createHash('sha256').update(codeVerifier).digest('base64url');

export const createPkcePair = (): PkcePair => {
  const codeVerifier = randomBytes(32).toString('base64url');
  return {
    codeVerifier,
    codeChallenge: createPkceChallenge(codeVerifier),
    codeChallengeMethod: 'S256',
  };
};

export const createOAuthState = (): string => randomBytes(16).toString('base64url');
