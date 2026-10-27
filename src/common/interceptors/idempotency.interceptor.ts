import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { RedisService } from '../redis/redis.service.js';
import {
  IDEMPOTENT_KEY,
  type IdempotentOptions,
} from '../decorators/idempotent.decorator.js';

interface CachedIdempotencyRecord {
  status: 'IN_PROGRESS' | 'COMPLETED';
  hash: string;
  statusCode?: number;
  body?: unknown;
}

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: { id?: number; sub?: number } }>();
    const res = http.getResponse<Response>();

    const options = this.reflector.get<IdempotentOptions>(
      IDEMPOTENT_KEY,
      context.getHandler(),
    );

    const rawKey = req.headers['idempotency-key'] as string | undefined;

    if (!rawKey) {
      if (options?.required) {
        throw new BadRequestException(
          'Idempotency-Key header is required for this request',
        );
      }
      return next.handle();
    }

    const key = rawKey.trim();
    if (!UUID_V4_REGEX.test(key)) {
      throw new BadRequestException(
        'Idempotency-Key header must be a valid UUID v4',
      );
    }

    // Isolate by user and endpoint to prevent collision across distinct scopes
    const userId = req.user?.id ?? req.user?.sub ?? 'anon';
    const redisKey = `idempotency:${userId}:${req.method}:${req.baseUrl || req.path}:${key}`;

    const bodyString = JSON.stringify(req.body ?? {});
    const requestHash = createHash('sha256').update(bodyString).digest('hex');

    const cachedRaw = await this.redis.get(redisKey);

    if (cachedRaw) {
      let record: CachedIdempotencyRecord;
      try {
        record = JSON.parse(cachedRaw) as CachedIdempotencyRecord;
      } catch {
        // If JSON is corrupted, delete key and proceed
        await this.redis.del(redisKey);
        return this.processRequest(redisKey, requestHash, res, next);
      }

      // 1. Key reused with a different body -> 422
      if (record.hash !== requestHash) {
        throw new UnprocessableEntityException(
          'Idempotency key was previously used with a different request payload',
        );
      }

      // 2. Key seen, request still in progress -> 409
      if (record.status === 'IN_PROGRESS') {
        throw new ConflictException(
          'A request with this idempotency key is currently being processed. Please retry shortly.',
        );
      }

      // 3. Key seen, request finished -> Replay stored response
      if (record.status === 'COMPLETED') {
        this.logger.debug(
          `Replaying idempotent response for key: ${key} (user #${userId})`,
        );

        if (record.statusCode) {
          res.status(record.statusCode);
        }
        res.setHeader('X-Cache-Lookup', 'IDEMPOTENT_REPLAY');
        return of(record.body);
      }
    }

    return this.processRequest(redisKey, requestHash, res, next);
  }

  private async processRequest(
    redisKey: string,
    requestHash: string,
    res: Response,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    // Atomically set IN_PROGRESS lock with 60s timeout to prevent concurrency race
    const inProgressRecord: CachedIdempotencyRecord = {
      status: 'IN_PROGRESS',
      hash: requestHash,
    };

    const lockAcquired = await this.redis.setnx(
      redisKey,
      JSON.stringify(inProgressRecord),
      60,
    );

    if (!lockAcquired) {
      throw new ConflictException(
        'A request with this idempotency key is currently being processed. Please retry shortly.',
      );
    }

    return next.handle().pipe(
      tap({
        next: async (responseBody) => {
          try {
            const completedRecord: CachedIdempotencyRecord = {
              status: 'COMPLETED',
              hash: requestHash,
              statusCode: res.statusCode || 200,
              body: responseBody,
            };

            // 24-hour expiration per DinkUp specification (86,400 seconds)
            await this.redis.set(
              redisKey,
              JSON.stringify(completedRecord),
              86400,
            );
          } catch (storageError) {
            this.logger.error(
              `Failed to store idempotency record in Redis: ${storageError}`,
            );
          }
        },
        error: async (err: unknown) => {
          // If handler failed with a 5xx / unexpected failure -> delete key so retry can succeed
          const status = err instanceof HttpException ? err.getStatus() : 500;
          if (status >= 500) {
            this.logger.warn(
              `Handler failed with status ${status}. Removing idempotency key to allow retries.`,
            );
            await this.redis.del(redisKey);
          }
        },
      }),
    );
  }
}
