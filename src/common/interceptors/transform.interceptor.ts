import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  data: T;
  statusCode: number;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    return next.handle().pipe(
      map((data) => {
        // Don't wrap binary/stream/file responses — they need raw bytes
        if (data instanceof StreamableFile || Buffer.isBuffer(data)) {
          return data as any;
        }
        return {
          data,
          statusCode: context.switchToHttp().getResponse().statusCode,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
