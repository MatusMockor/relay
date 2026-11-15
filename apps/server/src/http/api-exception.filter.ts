import { type ArgumentsHost, Catch, type ExceptionFilter, Inject } from '@nestjs/common';
import { type Logger, PORT_TOKENS } from '@relay/engine';
import type { ApiErrorResponse } from '@relay/shared/api';
import type { FastifyReply } from 'fastify';
import { mapApiError } from './api-error.mapper';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(@Inject(PORT_TOKENS.Logger) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      return;
    }
    const mapped = mapApiError(exception);
    if (mapped.unexpected) {
      this.logger.error('Unhandled request error', { error: describe(exception) });
    }
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const payload: ApiErrorResponse = { error: mapped.body };
    void reply.status(mapped.status).send(payload);
  }
}

const describe = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
};
