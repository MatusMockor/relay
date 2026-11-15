import type { Clock, ConditionalCredentialVault } from '@relay/engine';
import {
  GoogleOAuthTokenRefresher,
  type OAuthTokenProvider,
  RefreshingOAuthTokenProvider,
} from '@relay/mail-core';
import type { GoogleOAuthConfig } from '../config/server-config';
import { toGoogleClientConfig } from './google-client-config';

export const createOAuthTokenProvider = (
  google: GoogleOAuthConfig | null,
  vault: ConditionalCredentialVault,
  clock: Clock,
): OAuthTokenProvider =>
  new RefreshingOAuthTokenProvider({
    refreshers:
      google === null
        ? {}
        : { gmail: new GoogleOAuthTokenRefresher(toGoogleClientConfig(google), clock) },
    vault,
    clock,
  });
