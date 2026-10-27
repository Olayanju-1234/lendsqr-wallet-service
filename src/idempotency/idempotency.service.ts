import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Knex } from 'knex';

interface IdempotencyKeyRow {
  id: number;
  user_id: string;
  key: string;
  request_hash: string;
  response_body: unknown;
  created_at: Date;
}

export interface IdempotentResult<T> {
  replayed: boolean;
  body: T;
}

@Injectable()
export class IdempotencyService {
  hashRequest(parts: Array<string | number | null>): string {
    return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  }

  // Runs inside the money transaction so the key and its effect commit or roll back together.
  async claim<T>(
    trx: Knex.Transaction,
    userId: string,
    key: string,
    requestHash: string,
  ): Promise<T | null> {
    const inserted = await trx<IdempotencyKeyRow>('idempotency_keys')
      .insert({ user_id: userId, key, request_hash: requestHash })
      .onConflict(['user_id', 'key'])
      .ignore()
      .returning('id');
    if (inserted.length > 0) {
      return null;
    }

    const existing = await trx<IdempotencyKeyRow>('idempotency_keys')
      .where({ user_id: userId, key })
      .first();
    if (existing && existing.request_hash !== requestHash) {
      throw new UnprocessableEntityException(
        'This Idempotency-Key was already used for a different request',
      );
    }
    if (!existing || existing.response_body === null) {
      // The key and its response commit together, so a committed key without a response cannot exist.
      throw new Error(`Idempotency key ${key} has no stored response`);
    }
    return existing.response_body as T;
  }

  async complete(
    trx: Knex.Transaction,
    userId: string,
    key: string,
    body: object,
  ): Promise<void> {
    await trx<IdempotencyKeyRow>('idempotency_keys')
      .where({ user_id: userId, key })
      .update({ response_body: JSON.stringify(body) });
  }
}
