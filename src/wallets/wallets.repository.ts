import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../database/database.constants.js';
import { WalletRow, WalletType } from './wallet.types.js';

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

  // SELECT ... FOR UPDATE. Ordering by id means every transaction takes the same locks in the same
  // order, so two transfers between the same pair of wallets queue up instead of deadlocking.
  lockByIds(trx: Knex.Transaction, ids: string[]): Promise<WalletRow[]> {
    return trx<WalletRow>('wallets')
      .whereIn('id', ids)
      .orderBy('id')
      .forUpdate();
  }

  // Relative update done by the database, never "read balance, add in JS, write back". The CHECK
  // constraint on the table rejects any update that would take a user wallet below zero.
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
