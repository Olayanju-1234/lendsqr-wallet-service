import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../database/database.constants.js';
import {
  LedgerEntryRow,
  LedgerEntryWithTransaction,
  NewLedgerEntry,
  NewTransaction,
  TransactionRow,
} from './ledger.types.js';

@Injectable()
export class LedgerRepository {
  constructor(@Inject(KNEX) private readonly db: Knex) {}

  async insertTransaction(
    trx: Knex.Transaction,
    transaction: NewTransaction,
  ): Promise<TransactionRow> {
    const [row] = await trx<TransactionRow>('transactions')
      .insert(transaction)
      .returning('*');
    return row;
  }

  async insertEntries(
    trx: Knex.Transaction,
    entries: NewLedgerEntry[],
  ): Promise<void> {
    await trx<LedgerEntryRow>('ledger_entries').insert(entries);
  }

  // Newest first, keyset on id: WHERE id < cursor uses the (wallet_id, id) index, unlike OFFSET.
  listByUser(
    userId: string,
    limit: number,
    cursor?: number,
  ): Promise<LedgerEntryWithTransaction[]> {
    const query = this.db('ledger_entries as e')
      .join('transactions as t', 't.id', 'e.transaction_id')
      .leftJoin('ledger_entries as other', function () {
        this.on('other.transaction_id', '=', 'e.transaction_id').andOn(
          'other.wallet_id',
          '<>',
          'e.wallet_id',
        );
      })
      .whereIn(
        'e.wallet_id',
        this.db('wallets').select('id').where({ user_id: userId }),
      )
      .orderBy('e.id', 'desc')
      .limit(limit)
      .select<LedgerEntryWithTransaction[]>(
        'e.*',
        't.type',
        't.description',
        'other.wallet_id as counterparty_wallet_id',
      );
    return cursor === undefined ? query : query.where('e.id', '<', cursor);
  }
}
