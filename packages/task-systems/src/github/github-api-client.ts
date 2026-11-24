import type { GitHubCredentials } from '@relay/shared/domain';
import type { z } from 'zod';
import { ProviderHttp, type ProviderHttpOptions } from '../shared/provider-http';
import { githubApiError } from './github-api-errors';
import { nextPageOf } from './github-link';

export const GITHUB_API_ORIGIN = 'https://api.github.com';

export interface GitHubApiClientOptions extends ProviderHttpOptions {
  readonly apiOrigin?: string;
}

export interface GitHubPage<Data> {
  readonly data: Data;
  readonly next: string | null;
}

export class GitHubApiClient {
  private readonly http: ProviderHttp;
  private readonly origin: string;

  constructor(options: GitHubApiClientOptions = {}) {
    this.http = new ProviderHttp(
      {
        unreachable: 'GitHub je nedostupný. Skontroluj pripojenie.',
        invalid: 'GitHub vrátil neplatnú odpoveď.',
      },
      options,
    );
    this.origin = new URL(options.apiOrigin ?? GITHUB_API_ORIGIN).origin;
  }

  async get<Schema extends z.ZodType>(
    credentials: GitHubCredentials,
    path: string,
    schema: Schema,
  ): Promise<GitHubPage<z.output<Schema>>> {
    const url = `${this.origin}${path}`;
    const response = await this.http.request(url, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${credentials.token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
      },
    });
    if (!response.ok) {
      throw await githubApiError(response);
    }
    const data = this.http.parse(await this.http.json(response), schema);
    return { data, next: nextPageOf(response.headers.get('link'), url, this.origin) };
  }
}
