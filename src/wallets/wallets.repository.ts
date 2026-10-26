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

  async updateBalance(
    trx: Knex.Transaction,
    id: string,
    balance: number,
  ): Promise<void> {
    await trx<WalletRow>('wallets')
      .where({ id })
      .update({ balance, updated_at: trx.fn.now() });
  }
}
