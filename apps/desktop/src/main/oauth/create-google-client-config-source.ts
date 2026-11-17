import { FileGoogleClientConfig } from './file-google-client-config';
import { FirstAvailableGoogleClientConfigSource } from './first-available-google-client-config-source';
import type { GoogleClientConfigSource } from './google-client-config-source';
import { OAuthNotConfiguredError } from './oauth-errors';
import {
  type GoogleClientValues,
  ProvidedGoogleClientConfig,
} from './provided-google-client-config';

type Env = Readonly<Record<string, string | undefined>>;

export interface GoogleClientConfigInputs {
  readonly env: Env;
  readonly baked: GoogleClientValues;
  readonly filePath: string;
}

export const createGoogleClientConfigSource = (
  inputs: GoogleClientConfigInputs,
): GoogleClientConfigSource =>
  new FirstAvailableGoogleClientConfigSource(
    [
      new ProvidedGoogleClientConfig({
        clientId: inputs.env.RELAY_GOOGLE_CLIENT_ID,
        clientSecret: inputs.env.RELAY_GOOGLE_CLIENT_SECRET,
      }),
      new ProvidedGoogleClientConfig(inputs.baked),
      new FileGoogleClientConfig(inputs.filePath),
    ],
    () => new OAuthNotConfiguredError(inputs.filePath),
  );
