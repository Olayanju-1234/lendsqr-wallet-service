import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../database/database.constants.js';
import { type WalletRow, WalletType } from './wallet.types.js';

@Injectable()
export class WalletsRepository {
  constructor(@Inject(KNEX) private readonly db: Knex) {}

  async insertForUser(
    trx: Knex.Transaction,
    userId: string,
  ): Promise<WalletRow> {
    const [row] = await trx<WalletRow>('wallets')
      .insert({ user_id: userId, type: WalletType.User })
      .returning('*');
    return row;
  }

  findByUserId(userId: string): Promise<WalletRow | undefined> {
    return this.db<WalletRow>('wallets').where({ user_id: userId }).first();
  }

  // One round trip locks the caller's wallet (by owner) and the other wallet (by id), in id order so
  // A->B and B->A never deadlock. A self-transfer comes back as a single row.
  lockPair(
    trx: Knex.Transaction,
    ownerId: string,
    walletId: string,
  ): Promise<WalletRow[]> {
    return trx<WalletRow>('wallets')
      .where({ user_id: ownerId })
      .orWhere({ id: walletId })
      .orderBy('id')
      .forUpdate();
  }

  async adjustBalance(
    trx: Knex.Transaction,
    id: string,
    delta: number,
  ): Promise<number> {
    const [row] = await trx<WalletRow>('wallets')
      .where({ id })
      .update({
        balance: trx.raw('balance + ?', [delta]),
        updated_at: trx.fn.now(),
      })
      .returning('balance');
    return row.balance;
  }
}
