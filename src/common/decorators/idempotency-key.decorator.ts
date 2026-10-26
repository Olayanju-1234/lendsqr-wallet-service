import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,255}$/;

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const key = context
      .switchToHttp()
      .getRequest<Request>()
      .header('idempotency-key');
    if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw new BadRequestException(
        'Idempotency-Key header is required: 8-255 characters of letters, digits, "-" or "_" (a UUID works)',
      );
    }
    return key;
  },
);
