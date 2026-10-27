import { Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { LedgerRepository } from './ledger.repository.js';
import type { TransactionRow, TransactionType } from './ledger.types.js';
import type { WalletRow } from './wallet.types.js';
import { WalletsRepository } from './wallets.repository.js';

export interface Posting {
  type: TransactionType;
  debit: WalletRow;
  credit: WalletRow;
  amount: number;
  description: string | null;
  initiatedBy: string;
}

export interface PostingResult {
  transaction: TransactionRow;
  debitBalanceAfter: number;
  creditBalanceAfter: number;
}

@Injectable()
export class LedgerService {
  constructor(
    private readonly ledger: LedgerRepository,
    private readonly wallets: WalletsRepository,
  ) {}

  // The caller holds FOR UPDATE locks on both wallets. Balances are still adjusted relatively in SQL and the
  // ledger rows record what the database returned, so the arithmetic never depends on a value read earlier.
  async post(trx: Knex.Transaction, posting: Posting): Promise<PostingResult> {
    const [debitBalanceAfter, creditBalanceAfter] = await Promise.all([
      this.wallets.adjustBalance(trx, posting.debit.id, -posting.amount),
      this.wallets.adjustBalance(trx, posting.credit.id, posting.amount),
    ]);

    const transaction = await this.ledger.insertTransaction(trx, {
      type: posting.type,
      amount: posting.amount,
      currency: posting.debit.currency,
      description: posting.description,
      initiated_by: posting.initiatedBy,
    });
    await this.ledger.insertEntries(trx, [
      {
        transaction_id: transaction.id,
        wallet_id: posting.debit.id,
        amount: -posting.amount,
        balance_after: debitBalanceAfter,
      },
      {
        transaction_id: transaction.id,
        wallet_id: posting.credit.id,
        amount: posting.amount,
        balance_after: creditBalanceAfter,
      },
    ]);
    return { transaction, debitBalanceAfter, creditBalanceAfter };
  }
}
