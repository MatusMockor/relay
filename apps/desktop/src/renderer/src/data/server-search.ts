import type { ServerSearchRequest, ServerSearchResponse } from '@relay/shared';

export const unsupportedServerSearch = (request: ServerSearchRequest): ServerSearchResponse => ({
  requestId: request.requestId,
  status: 'unsupported',
  hits: [],
});
