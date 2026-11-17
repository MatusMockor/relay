import type {
  GoogleClientConfig,
  GoogleClientConfigCandidate,
  GoogleClientConfigSource,
} from './google-client-config-source';

export class FirstAvailableGoogleClientConfigSource implements GoogleClientConfigSource {
  constructor(
    private readonly candidates: readonly GoogleClientConfigCandidate[],
    private readonly missing: () => Error,
  ) {}

  async load(): Promise<GoogleClientConfig> {
    for (const candidate of this.candidates) {
      const config = await candidate.find();
      if (config !== null) {
        return config;
      }
    }
    throw this.missing();
  }
}
