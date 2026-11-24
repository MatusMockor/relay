import { isEngineError, ReauthorizationRequiredError } from '@relay/engine';
import type { JiraCredentials } from '@relay/shared/domain';
import type { JiraApiClient } from './jira-api-client';
import { type JiraMyself, JiraMyselfSchema, JiraTenantInfoSchema } from './jira-api-schemas';
import { searchPage } from './jira-open-issues';
import { gatewayBaseOf, type JiraEndpoint } from './jira-route';

export interface JiraVerification {
  readonly myself: JiraMyself;
  readonly credentials: JiraCredentials;
}

const myselfAt = (api: JiraApiClient, endpoint: JiraEndpoint): Promise<JiraMyself> =>
  api.send({ ...endpoint, method: 'GET', path: '/rest/api/3/myself' }, JiraMyselfSchema);

const cloudIdOf = async (
  api: JiraApiClient,
  origin: string,
  credentials: JiraCredentials,
  rejection: ReauthorizationRequiredError,
): Promise<string> => {
  try {
    const tenant = await api.send(
      { base: origin, credentials, method: 'GET', path: '/_edge/tenant_info' },
      JiraTenantInfoSchema,
    );
    return tenant.cloudId;
  } catch (error) {
    if (isEngineError(error)) {
      throw rejection;
    }
    throw error;
  }
};

const resolveRoute = async (
  api: JiraApiClient,
  origin: string,
  credentials: JiraCredentials,
  gateway: string,
): Promise<JiraVerification & JiraEndpoint> => {
  const site = { base: origin, credentials: { ...credentials, route: { kind: 'site' } } } as const;
  try {
    return { ...site, myself: await myselfAt(api, site) };
  } catch (error) {
    if (!(error instanceof ReauthorizationRequiredError)) {
      throw error;
    }
    const cloudId = await cloudIdOf(api, origin, credentials, error);
    const routed: JiraEndpoint = {
      base: gatewayBaseOf(gateway, cloudId),
      credentials: { ...credentials, route: { kind: 'gateway', cloudId } },
    };
    return { ...routed, myself: await myselfAt(api, routed) };
  }
};

export const verifyJira = async (
  api: JiraApiClient,
  origin: string,
  credentials: JiraCredentials,
  gateway: string,
): Promise<JiraVerification> => {
  const resolved = await resolveRoute(api, origin, credentials, gateway);
  await searchPage(api, resolved, 1, null);
  return { myself: resolved.myself, credentials: resolved.credentials };
};
