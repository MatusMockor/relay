import type { Principal } from '../principal';

export const ACCESS_TOKEN_AUTHENTICATOR = Symbol.for('relay.server.AccessTokenAuthenticator');

export interface AccessTokenAuthenticator {
  authenticate(accessToken: string): Promise<Principal | null>;
}
