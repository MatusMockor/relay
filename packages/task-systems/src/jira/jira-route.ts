import type { JiraCredentials } from '@relay/shared/domain';

export const ATLASSIAN_API_GATEWAY = 'https://api.atlassian.com';

export interface JiraEndpoint {
  readonly base: string;
  readonly credentials: JiraCredentials;
}

export const gatewayBaseOf = (gateway: string, cloudId: string): string =>
  `${gateway}/ex/jira/${encodeURIComponent(cloudId)}`;

export const endpointOf = (
  origin: string,
  credentials: JiraCredentials,
  gateway: string,
): JiraEndpoint => ({
  base:
    credentials.route?.kind === 'gateway'
      ? gatewayBaseOf(gateway, credentials.route.cloudId)
      : origin,
  credentials,
});
