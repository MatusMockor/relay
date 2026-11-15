import {
  applyDecorators,
  HttpCode,
  RequestMapping,
  RequestMethod,
  SetMetadata,
} from '@nestjs/common';
import type { EndpointDefinition, HttpMethod } from '@relay/shared/api';
import { Public } from '../auth/decorators/public.decorator';

export const API_ENDPOINT = 'relay:apiEndpoint';

const METHODS: Readonly<Record<HttpMethod, RequestMethod>> = {
  GET: RequestMethod.GET,
  POST: RequestMethod.POST,
  PUT: RequestMethod.PUT,
  PATCH: RequestMethod.PATCH,
  DELETE: RequestMethod.DELETE,
};

export const ApiRoute = (endpoint: EndpointDefinition) =>
  applyDecorators(
    SetMetadata(API_ENDPOINT, endpoint),
    RequestMapping({ path: endpoint.path, method: METHODS[endpoint.method] }),
    HttpCode(200),
    ...(endpoint.auth === 'public' ? [Public()] : []),
  );

export const RawRoute = (method: HttpMethod, path: string, auth: 'public' | 'user' = 'user') =>
  applyDecorators(
    RequestMapping({ path, method: METHODS[method] }),
    HttpCode(200),
    ...(auth === 'public' ? [Public()] : []),
  );
