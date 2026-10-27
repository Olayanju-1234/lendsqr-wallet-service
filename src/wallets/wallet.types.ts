export const FUNDING_WALLET_ID = '00000000-0000-4000-8000-000000000001';

// ₦10,000,000 in kobo per operation. Balances are not capped; parsing bigint to number is exact below 2^53.
export const MAX_AMOUNT_KOBO = 1_000_000_000;

export enum WalletType {
  User = 'user',
  Funding = 'funding',
}

export interface WalletRow {
  id: string;
  user_id: string | null;
  type: WalletType;
  currency: string;
  balance: number;
  created_at: Date;
  updated_at: Date;
}

export interface WalletResponse {
  id: string;
  currency: string;
  balance: number;
  updatedAt: Date;
}

export function toWalletResponse(wallet: WalletRow): WalletResponse {
  return {
    id: wallet.id,
    currency: wallet.currency,
    balance: wallet.balance,
    updatedAt: wallet.updated_at,
  };
}
