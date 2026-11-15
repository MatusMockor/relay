import type { GoogleOAuthClientConfig } from '@relay/mail-core';
import type { GoogleOAuthConfig } from '../config/server-config';

export const toGoogleClientConfig = (google: GoogleOAuthConfig): GoogleOAuthClientConfig =>
  google.tokenEndpoint === null
    ? { clientId: google.clientId, clientSecret: google.clientSecret }
    : {
        clientId: google.clientId,
        clientSecret: google.clientSecret,
        tokenEndpoint: google.tokenEndpoint,
      };
