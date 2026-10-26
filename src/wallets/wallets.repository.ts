import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
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

  // TODO(Joseph): SELECT ... FOR UPDATE on these wallets, always in ascending id order.
  lockByIds(trx: Knex.Transaction, ids: string[]): Promise<WalletRow[]> {
    void trx;
    void ids;
    throw new NotImplementedException('lockByIds');
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
