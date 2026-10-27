import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
  InternalServerErrorException,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError, lastValueFrom } from 'rxjs';
import { createHash } from 'node:crypto';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';
import { RedisService } from '../redis/redis.service.js';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let redisService: jest.Mocked<RedisService>;
  let reflector: jest.Mocked<Reflector>;

  const mockUuid = '123e4567-e89b-12d3-a456-426614174000';
  const mockBody = { slotId: 42 };
  const mockHash = createHash('sha256')
    .update(JSON.stringify(mockBody))
    .digest('hex');

  let mockReq: any;
  let mockRes: any;
  let mockContext: ExecutionContext;
  let mockNext: CallHandler;

  beforeEach(() => {
    redisService = {
      get: jest.fn(),
      set: jest.fn(),
      setnx: jest.fn(),
      del: jest.fn(),
    } as unknown as jest.Mocked<RedisService>;

    reflector = {
      get: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    interceptor = new IdempotencyInterceptor(redisService, reflector);

    mockReq = {
      headers: { 'idempotency-key': mockUuid },
      user: { id: 1 },
      method: 'POST',
      baseUrl: '/api/v1/bookings',
      path: '',
      body: mockBody,
    };

    mockRes = {
      statusCode: 201,
      status: jest.fn(),
      setHeader: jest.fn(),
    };

    mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockReq,
        getResponse: () => mockRes,
      }),
      getHandler: () => ({}),
    } as unknown as ExecutionContext;

    mockNext = {
      handle: () => of({ bookingId: 100 }),
    };
  });

  it('Situation 1: New key -> acquires lock, executes handler, caches COMPLETED response with 24h TTL', async () => {
    redisService.get.mockResolvedValue(null);
    redisService.setnx.mockResolvedValue(true);
    redisService.set.mockResolvedValue('OK');

    const result$ = await interceptor.intercept(mockContext, mockNext);
    const result = await lastValueFrom(result$);

    expect(result).toEqual({ bookingId: 100 });
    expect(redisService.setnx).toHaveBeenCalledWith(
      expect.stringContaining(mockUuid),
      JSON.stringify({ status: 'IN_PROGRESS', hash: mockHash }),
      60,
    );
    expect(redisService.set).toHaveBeenCalledWith(
      expect.stringContaining(mockUuid),
      JSON.stringify({
        status: 'COMPLETED',
        hash: mockHash,
        statusCode: 201,
        body: { bookingId: 100 },
      }),
      86400,
    );
  });

  it('Situation 2: Key seen, request finished -> replays stored response without calling handler', async () => {
    const cachedRecord = {
      status: 'COMPLETED',
      hash: mockHash,
      statusCode: 201,
      body: { bookingId: 100, replayed: true },
    };
    redisService.get.mockResolvedValue(JSON.stringify(cachedRecord));

    const handleSpy = jest.spyOn(mockNext, 'handle');

    const result$ = await interceptor.intercept(mockContext, mockNext);
    const result = await lastValueFrom(result$);

    expect(result).toEqual({ bookingId: 100, replayed: true });
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'X-Cache-Lookup',
      'IDEMPOTENT_REPLAY',
    );
    expect(handleSpy).not.toHaveBeenCalled();
  });

  it('Situation 3: Key seen, still in progress -> throws 409 ConflictException', async () => {
    const inProgressRecord = {
      status: 'IN_PROGRESS',
      hash: mockHash,
    };
    redisService.get.mockResolvedValue(JSON.stringify(inProgressRecord));

    await expect(interceptor.intercept(mockContext, mockNext)).rejects.toThrow(
      ConflictException,
    );
  });

  it('Situation 4: Key reused with different body -> throws 422 UnprocessableEntityException', async () => {
    const differentHash = 'different-hash-value-12345';
    const cachedRecord = {
      status: 'COMPLETED',
      hash: differentHash,
      body: { old: true },
    };
    redisService.get.mockResolvedValue(JSON.stringify(cachedRecord));

    await expect(interceptor.intercept(mockContext, mockNext)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('Situation 5: Handler failed with 5xx -> deletes key so a retry can run', async () => {
    redisService.get.mockResolvedValue(null);
    redisService.setnx.mockResolvedValue(true);
    redisService.del.mockResolvedValue(1);

    mockNext.handle = () =>
      throwError(() => new InternalServerErrorException('Database failure'));

    const result$ = await interceptor.intercept(mockContext, mockNext);

    await expect(lastValueFrom(result$)).rejects.toThrow(
      InternalServerErrorException,
    );

    expect(redisService.del).toHaveBeenCalledWith(
      expect.stringContaining(mockUuid),
    );
  });

  it('Validates UUID v4 format and throws BadRequestException if invalid', async () => {
    mockReq.headers['idempotency-key'] = 'not-a-valid-uuid';

    await expect(interceptor.intercept(mockContext, mockNext)).rejects.toThrow(
      BadRequestException,
    );
  });
});
