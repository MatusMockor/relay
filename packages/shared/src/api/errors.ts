import { z } from 'zod';

export const ApiErrorCodeSchema = z.enum([
  'validation_failed',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'provider_error',
  'not_implemented',
  'internal',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type ApiErrorIssue = z.infer<typeof ApiErrorIssueSchema>;

export const ApiErrorBodySchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string(),
  issues: z.array(ApiErrorIssueSchema).optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

export const ApiErrorResponseSchema = z.object({
  error: ApiErrorBodySchema,
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export const API_ERROR_HTTP_STATUS: Readonly<Record<ApiErrorCode, number>> = {
  validation_failed: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  provider_error: 502,
  not_implemented: 501,
  internal: 500,
};

export const toApiErrorIssues = (error: z.ZodError): ApiErrorIssue[] =>
  error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
