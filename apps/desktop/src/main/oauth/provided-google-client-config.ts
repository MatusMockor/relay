import { z } from 'zod';
import type {
  GoogleClientConfig,
  GoogleClientConfigCandidate,
} from './google-client-config-source';

const optionalValue = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim() ?? '';
    return trimmed === '' ? null : trimmed;
  });

const ProvidedValuesSchema = z.object({ clientId: optionalValue, clientSecret: optionalValue });

export interface GoogleClientValues {
  readonly clientId: string | undefined;
  readonly clientSecret: string | undefined;
}

export class ProvidedGoogleClientConfig implements GoogleClientConfigCandidate {
  constructor(private readonly values: GoogleClientValues) {}

  find(): Promise<GoogleClientConfig | null> {
    const { clientId, clientSecret } = ProvidedValuesSchema.parse(this.values);
    if (clientId === null) {
      return Promise.resolve(null);
    }
    return Promise.resolve({ clientId, clientSecret });
  }
}
