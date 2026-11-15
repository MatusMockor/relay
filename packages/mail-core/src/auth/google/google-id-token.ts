import { GoogleIdTokenClaimsSchema } from './google-token-response';

const decodePayload = (payload: string): unknown => {
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

export const readIdTokenEmail = (idToken: string | undefined): string | null => {
  const payload = idToken?.split('.')[1];
  if (!payload) {
    return null;
  }
  const claims = GoogleIdTokenClaimsSchema.safeParse(decodePayload(payload));
  if (!claims.success) {
    return null;
  }
  return claims.data.email ?? null;
};
