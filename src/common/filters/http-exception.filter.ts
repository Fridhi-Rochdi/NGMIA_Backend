import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus() || HttpStatus.INTERNAL_SERVER_ERROR;

    // The detail lives in the exception's response body, not in .message:
    // validation errors carry the list of what is wrong ("Adresse e-mail
    // invalide"), and the quota error carries its code and figures. Reading
    // only .message turned all of them into "Bad Request Exception".
    const body = exception.getResponse();
    const detail = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const message = detail.message ?? (typeof body === 'string' ? body : exception.message) ?? 'Internal server error';
    const { statusCode: _statusCode, message: _message, ...extra } = detail;

    response.status(status).json({
      ...extra,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
    });
  }
}
