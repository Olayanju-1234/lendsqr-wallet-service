import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../database/database.constants.js';

export interface ReconciliationReport {
  ok: boolean;
  checkedAt: Date;
  wallets: number;
  transactions: number;
  ledgerEntries: number;
  sumOfBalances: number;
  walletsOutOfBalance: string[];
  unbalancedTransactions: string[];
  entriesWithWrongRunningBalance: number[];
}

@Injectable()
export class ReconciliationService {
  constructor(@Inject(KNEX) private readonly db: Knex) {}

  // REPEATABLE READ so all four checks see the same snapshot. Sum of balances must be 0; each wallet must equal
  // the sum of its entries; each transaction must have one debit and one credit of its amount; each entry's
  // balance_after must equal the running sum. Queries run one after another: a transaction is one connection.
  async run(): Promise<ReconciliationReport> {
    return this.db.transaction(
      async (trx) => {
        const counts = await trx.raw<{
          rows: {
            wallets: number;
            transactions: number;
            ledger_entries: number;
          }[];
        }>(
          `select (select count(*) from wallets) as wallets,
                  (select count(*) from transactions) as transactions,
                  (select count(*) from ledger_entries) as ledger_entries`,
        );
        const sum = await trx.raw<{ rows: { total: number }[] }>(
          'select coalesce(sum(balance), 0)::bigint as total from wallets',
        );
        const wallets = await trx.raw<{ rows: { id: string }[] }>(
          `select w.id
             from wallets w
             left join ledger_entries e on e.wallet_id = w.id
            group by w.id, w.balance
           having w.balance <> coalesce(sum(e.amount), 0)`,
        );
        const transactions = await trx.raw<{ rows: { id: string }[] }>(
          `select t.id
             from transactions t
             left join ledger_entries e on e.transaction_id = t.id
            group by t.id, t.amount
           having count(e.id) <> 2
               or coalesce(sum(e.amount), 0) <> 0
               or min(abs(e.amount)) <> t.amount
               or max(abs(e.amount)) <> t.amount`,
        );
        const entries = await trx.raw<{ rows: { id: number }[] }>(
          `select id
             from (select id, balance_after,
                          sum(amount) over (partition by wallet_id order by id) as running
                     from ledger_entries) x
            where balance_after <> running`,
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
