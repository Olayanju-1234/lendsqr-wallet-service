import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../database/database.constants.js';

export interface ReconciliationReport {
  ok: boolean;
  checkedAt: Date;
  wallets: number;
  transactions: number;
  ledgerEntries: number;
  // Must be 0: every credit has an equal debit, and deposits come from the funding wallet.
  sumOfBalances: number;
  // Wallets whose cached balance differs from the sum of their ledger entries.
  walletsOutOfBalance: string[];
  // Transactions that do not have exactly one debit and one credit of the transaction amount.
  unbalancedTransactions: string[];
  // Ledger entries whose stored balance_after differs from the running sum of entries before them.
  entriesWithWrongRunningBalance: number[];
}

@Injectable()
export class ReconciliationService {
  constructor(@Inject(KNEX) private readonly db: Knex) {}

  // One REPEATABLE READ transaction so every check sees the same snapshot of the ledger.
  async run(): Promise<ReconciliationReport> {
    return this.db.transaction(
      async (trx) => {
        const [counts, sum, wallets, transactions, entries] = await Promise.all(
          [
            trx.raw<{
              rows: {
                wallets: number;
                transactions: number;
                ledger_entries: number;
              }[];
            }>(
              `select (select count(*) from wallets) as wallets,
                      (select count(*) from transactions) as transactions,
                      (select count(*) from ledger_entries) as ledger_entries`,
            ),
            trx.raw<{ rows: { total: number }[] }>(
              'select coalesce(sum(balance), 0)::bigint as total from wallets',
            ),
            trx.raw<{ rows: { id: string }[] }>(
              `select w.id
                 from wallets w
                 left join ledger_entries e on e.wallet_id = w.id
                group by w.id, w.balance
               having w.balance <> coalesce(sum(e.amount), 0)`,
            ),
            trx.raw<{ rows: { id: string }[] }>(
              `select t.id
                 from transactions t
                 left join ledger_entries e on e.transaction_id = t.id
                group by t.id, t.amount
               having count(e.id) <> 2
                   or coalesce(sum(e.amount), 0) <> 0
                   or min(abs(e.amount)) <> t.amount
                   or max(abs(e.amount)) <> t.amount`,
            ),
            trx.raw<{ rows: { id: number }[] }>(
              `select id
                 from (select id, balance_after,
                              sum(amount) over (partition by wallet_id order by id) as running
                         from ledger_entries) x
                where balance_after <> running`,
            ),
          ],
        );

        const report: ReconciliationReport = {
          ok: false,
          checkedAt: new Date(),
          wallets: counts.rows[0].wallets,
          transactions: counts.rows[0].transactions,
          ledgerEntries: counts.rows[0].ledger_entries,
          sumOfBalances: sum.rows[0].total,
          walletsOutOfBalance: wallets.rows.map((row) => row.id),
          unbalancedTransactions: transactions.rows.map((row) => row.id),
          entriesWithWrongRunningBalance: entries.rows.map((row) => row.id),
        };
        report.ok =
          report.sumOfBalances === 0 &&
          report.walletsOutOfBalance.length === 0 &&
          report.unbalancedTransactions.length === 0 &&
          report.entriesWithWrongRunningBalance.length === 0;
        return report;
      },
      { isolationLevel: 'repeatable read', readOnly: true },
    );
  }
}
