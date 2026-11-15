import type { GoogleOAuthClientConfig } from '@relay/mail-core';
import { z } from 'zod';
import { AtomicFile } from '../storage/atomic-file';
import { parseJsonOrNull } from '../storage/parse-json';
import { OAuthConfigInvalidError, OAuthNotConfiguredError } from './oauth-errors';

const GoogleClientFileSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1).nullable().optional(),
  authEndpoint: z.url().optional(),
  tokenEndpoint: z.url().optional(),
});

export interface GoogleClientConfig extends GoogleOAuthClientConfig {
  readonly authEndpoint?: string;
}

export interface GoogleClientConfigSource {
  load(): Promise<GoogleClientConfig>;
}

type Env = Readonly<Record<string, string | undefined>>;

const nonEmpty = (value: string | undefined): string | null =>
  value === undefined || value.trim() === '' ? null : value.trim();

export class EnvOrFileGoogleClientConfigSource implements GoogleClientConfigSource {
  private readonly file: AtomicFile;

  constructor(
    private readonly env: Env,
    private readonly filePath: string,
  ) {
    this.file = new AtomicFile(filePath);
  }

  async load(): Promise<GoogleClientConfig> {
    const clientId = nonEmpty(this.env.RELAY_GOOGLE_CLIENT_ID);
    if (clientId !== null) {
      return { clientId, clientSecret: nonEmpty(this.env.RELAY_GOOGLE_CLIENT_SECRET) };
    }
    const stored = await this.readFile();
    return {
      clientId: stored.clientId,
      clientSecret: stored.clientSecret ?? null,
      ...(stored.authEndpoint === undefined ? {} : { authEndpoint: stored.authEndpoint }),
      ...(stored.tokenEndpoint === undefined ? {} : { tokenEndpoint: stored.tokenEndpoint }),
    };
  }

  private async readFile(): Promise<z.output<typeof GoogleClientFileSchema>> {
    const content = await this.file.read();
    if (content === null) {
      throw new OAuthNotConfiguredError(this.filePath);
    }
    const parsed = GoogleClientFileSchema.safeParse(
      parseJsonOrNull(Buffer.from(content).toString('utf8')),
    );
    if (!parsed.success) {
      throw new OAuthConfigInvalidError(this.filePath);
    }
    return parsed.data;
  }
}
