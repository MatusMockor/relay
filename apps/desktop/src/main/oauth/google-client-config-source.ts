import type { GoogleOAuthClientConfig } from '@relay/mail-core';

export interface GoogleClientConfig extends GoogleOAuthClientConfig {
  readonly authEndpoint?: string;
}

export interface GoogleClientConfigSource {
  load(): Promise<GoogleClientConfig>;
}

export interface GoogleClientConfigCandidate {
  find(): Promise<GoogleClientConfig | null>;
}
