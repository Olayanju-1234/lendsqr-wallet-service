import { FUNDING_WALLET_ID } from './wallet.types.js';

export enum TransactionType {
  Deposit = 'deposit',
  Transfer = 'transfer',
}

export interface TransactionRow {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  description: string | null;
  initiated_by: string;
  created_at: Date;
}

export type NewTransaction = Pick<
  TransactionRow,
  'type' | 'amount' | 'currency' | 'description' | 'initiated_by'
>;

export interface LedgerEntryRow {
  id: number;
  transaction_id: string;
  wallet_id: string;
  amount: number;
  balance_after: number;
  created_at: Date;
}

export type NewLedgerEntry = Pick<
  LedgerEntryRow,
  'transaction_id' | 'wallet_id' | 'amount' | 'balance_after'
>;

export interface LedgerEntryWithTransaction extends LedgerEntryRow {
  type: TransactionType;
  description: string | null;
  counterparty_wallet_id: string | null;
}

export interface LedgerEntryResponse {
  id: number;
  transactionId: string;
  type: TransactionType;
  direction: 'debit' | 'credit';
  amount: number;
  balanceAfter: number;
  counterpartyWalletId: string | null;
  description: string | null;
  createdAt: Date;
}

export function toLedgerEntryResponse(
  entry: LedgerEntryWithTransaction,
): LedgerEntryResponse {
  return {
    id: entry.id,
    transactionId: entry.transaction_id,
    type: entry.type,
    direction: entry.amount < 0 ? 'debit' : 'credit',
    amount: Math.abs(entry.amount),
    balanceAfter: entry.balance_after,
    // The funding wallet is internal: a deposit has no counterparty a user can act on.
    counterpartyWalletId:
      entry.counterparty_wallet_id === FUNDING_WALLET_ID
        ? null
        : entry.counterparty_wallet_id,
    description: entry.description,
    createdAt: entry.created_at,
  };
}
