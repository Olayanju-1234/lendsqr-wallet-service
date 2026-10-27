import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Knex } from 'knex';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { KNEX } from '../database/database.constants.js';
import {
  IdempotencyService,
  type IdempotentResult,
} from '../idempotency/idempotency.service.js';
import { UserStatus } from '../users/user.types.js';
import { UsersRepository } from '../users/users.repository.js';
import { DepositDto } from './dto/deposit.dto.js';
import { PaginationQueryDto } from './dto/pagination-query.dto.js';
import { LedgerRepository } from './ledger.repository.js';
import { LedgerService } from './ledger.service.js';
import {
  LedgerEntryResponse,
  toLedgerEntryResponse,
  TransactionType,
} from './ledger.types.js';
import {
  FUNDING_WALLET_ID,
  toWalletResponse,
  WalletResponse,
  WalletRow,
} from './wallet.types.js';
import { WalletsRepository } from './wallets.repository.js';

export interface DepositResponse {
  transactionId: string;
  walletId: string;
  amount: number;
  currency: string;
  balanceAfter: number;
  createdAt: Date;
}

export interface LedgerPage {
  data: LedgerEntryResponse[];
  meta: { page: number; limit: number; total: number };
}

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly wallets: WalletsRepository,
    private readonly users: UsersRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async getMyWallet(userId: string): Promise<WalletResponse> {
    return toWalletResponse(await this.findWalletOrFail(userId));
  }

  async listMyEntries(
    userId: string,
    { page, limit }: PaginationQueryDto,
  ): Promise<LedgerPage> {
    const wallet = await this.findWalletOrFail(userId);
    const { entries, total } = await this.ledgerRepository.listByWallet(
      wallet.id,
      page,
      limit,
    );
    return {
      data: entries.map(toLedgerEntryResponse),
      meta: { page, limit, total },
    };
  }

  // Stands in for a verified payment-provider webhook: money enters from the funding wallet, so the ledger stays balanced.
  async deposit(
    user: AuthenticatedUser,
    dto: DepositDto,
    idempotencyKey: string,
  ): Promise<IdempotentResult<DepositResponse>> {
    if (user.status !== UserStatus.Active) {
      throw new ForbiddenException('Your account is blocked');
    }
    const requestHash = this.idempotency.hashRequest(['deposit', dto.amount]);

    return this.db.transaction(async (trx) => {
      const stored = await this.idempotency.claim<DepositResponse>(
        trx,
        user.id,
        idempotencyKey,
        requestHash,
      );
      if (stored) {
        return { replayed: true, body: stored };
      }

      const wallet = await this.findWalletOrFail(user.id, trx);
      // Same lock order as transfers.
      const locked = await this.wallets.lockByIds(trx, [
        FUNDING_WALLET_ID,
        wallet.id,
      ]);
      const [owner] = await this.users.lockForShare(trx, [user.id]);
      if (owner?.status !== UserStatus.Active) {
        throw new ForbiddenException('Your account is blocked');
      }
      const funding = locked.find((row) => row.id === FUNDING_WALLET_ID);
      const target = locked.find((row) => row.id === wallet.id);
      if (!funding || !target) {
        throw new Error('Funding wallet is missing; run the migrations');
      }

      const { transaction, creditBalanceAfter } = await this.ledger.post(trx, {
        type: TransactionType.Deposit,
        debit: funding,
        credit: target,
        amount: dto.amount,
        description: 'Wallet funding',
        initiatedBy: user.id,
      });

      const body: DepositResponse = {
        transactionId: transaction.id,
        walletId: wallet.id,
        amount: dto.amount,
        currency: wallet.currency,
        balanceAfter: creditBalanceAfter,
        createdAt: transaction.created_at,
      };
      await this.idempotency.complete(trx, user.id, idempotencyKey, body);
      this.logger.log(
        `Deposit ${transaction.id}: ${dto.amount} kobo into wallet ${wallet.id}`,
      );
      return { replayed: false, body };
    });
  }

  private async findWalletOrFail(
    userId: string,
    db: Knex = this.db,
  ): Promise<WalletRow> {
    const wallet = await this.wallets.findByUserId(userId, db);
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return wallet;
  }
}
