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

  findByUserId(
    userId: string,
    db: Knex = this.db,
  ): Promise<WalletRow | undefined> {
    return db<WalletRow>('wallets').where({ user_id: userId }).first();
  }

  // Locked in id order so A->B and B->A never deadlock.
  lockByIds(trx: Knex.Transaction, ids: string[]): Promise<WalletRow[]> {
    return trx<WalletRow>('wallets')
      .whereIn('id', ids)
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
