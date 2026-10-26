import type { Response } from 'express';
import type { IdempotentResult } from '../idempotency/idempotency.service.js';

export function sendIdempotent<T>(
  res: Response,
  result: IdempotentResult<T>,
): T {
  if (result.replayed) {
    res.setHeader('Idempotent-Replayed', 'true');
  }
  return result.body;
}
