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

  async listByWallet(
    walletId: string,
    page: number,
    limit: number,
  ): Promise<{ entries: LedgerEntryWithTransaction[]; total: number }> {
    const [entries, [{ count }]] = await Promise.all([
      this.db('ledger_entries as e')
        .join('transactions as t', 't.id', 'e.transaction_id')
        .leftJoin('ledger_entries as other', function () {
          this.on('other.transaction_id', '=', 'e.transaction_id').andOn(
            'other.wallet_id',
            '<>',
            'e.wallet_id',
          );
        })
        .where('e.wallet_id', walletId)
        .orderBy('e.id', 'desc')
        .limit(limit)
        .offset((page - 1) * limit)
        .select<LedgerEntryWithTransaction[]>(
          'e.*',
          't.type',
          't.description',
          'other.wallet_id as counterparty_wallet_id',
        ),
      this.db('ledger_entries')
        .where({ wallet_id: walletId })
        .count<{ count: number }[]>({ count: '*' }),
    ]);
    return { entries, total: count };
  }
}
