export interface TransferResponse {
  transactionId: string;
  senderWalletId: string;
  recipientWalletId: string;
  amount: number;
  currency: string;
  balanceAfter: number;
  description: string | null;
  createdAt: Date;
}
