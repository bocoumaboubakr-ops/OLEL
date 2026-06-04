import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SentryService } from '../sentry/sentry.service';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(@Optional() private readonly sentry?: SentryService) {}

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = exception.getResponse();
    const message =
      typeof exceptionResponse === 'object' && 'message' in (exceptionResponse as object)
        ? (exceptionResponse as any).message
        : exception.message;

    // Capture 5xx errors in Sentry
    if (status >= 500 && this.sentry) {
      this.sentry.captureException(exception, { url: request.url, method: request.method, status });
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
