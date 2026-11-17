import { z } from 'zod';
import { AtomicFile } from '../storage/atomic-file';
import { parseJsonOrNull } from '../storage/parse-json';
import type {
  GoogleClientConfig,
  GoogleClientConfigCandidate,
} from './google-client-config-source';
import { OAuthConfigInvalidError } from './oauth-errors';

const GoogleClientFileSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1).nullable().optional(),
  authEndpoint: z.url().optional(),
  tokenEndpoint: z.url().optional(),
});

export class FileGoogleClientConfig implements GoogleClientConfigCandidate {
  private readonly file: AtomicFile;

  constructor(private readonly filePath: string) {
    this.file = new AtomicFile(filePath);
  }

  async find(): Promise<GoogleClientConfig | null> {
    const content = await this.file.read();
    if (content === null) {
      return null;
    }
    const parsed = GoogleClientFileSchema.safeParse(
      parseJsonOrNull(Buffer.from(content).toString('utf8')),
    );
    if (!parsed.success) {
      throw new OAuthConfigInvalidError(this.filePath);
    }
    const stored = parsed.data;
    return {
      clientId: stored.clientId,
      clientSecret: stored.clientSecret ?? null,
      ...(stored.authEndpoint === undefined ? {} : { authEndpoint: stored.authEndpoint }),
      ...(stored.tokenEndpoint === undefined ? {} : { tokenEndpoint: stored.tokenEndpoint }),
    };
  }
}
