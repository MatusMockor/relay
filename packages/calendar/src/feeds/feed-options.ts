export interface FeedFetchOptions {
  readonly timeoutMs: number;
  readonly maxBytes: number;
  readonly maxRedirects: number;
  readonly allowPrivateNetworks: boolean;
  readonly allowInsecureHttp: boolean;
  readonly ca?: string;
}

export const DEFAULT_FEED_FETCH_OPTIONS: FeedFetchOptions = {
  timeoutMs: 20_000,
  maxBytes: 10 * 1024 * 1024,
  maxRedirects: 5,
  allowPrivateNetworks: false,
  allowInsecureHttp: false,
};
