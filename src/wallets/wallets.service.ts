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
import { LedgerQueryDto } from './dto/ledger-query.dto.js';
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
  // Pass as ?cursor= to get the next page; null when there is none.
  nextCursor: number | null;
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
    { cursor, limit }: LedgerQueryDto,
  ): Promise<LedgerPage> {
    // One query (the wallet is a subselect); one extra row says whether a next page exists, no COUNT(*).
    const entries = await this.ledgerRepository.listByUser(
      userId,
      limit + 1,
      cursor,
    );
    const page = entries.slice(0, limit);
    return {
      data: page.map(toLedgerEntryResponse),
      nextCursor: entries.length > limit ? page[page.length - 1].id : null,
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

      // Same lock order as transfers, in one round trip.
      const locked = await this.wallets.lockPair(
        trx,
        user.id,
        FUNDING_WALLET_ID,
      );
      const funding = locked.find((row) => row.id === FUNDING_WALLET_ID);
      const target = locked.find((row) => row.user_id === user.id);
      if (!funding) {
        throw new Error('Funding wallet is missing; run the migrations');
      }
      if (!target) {
        throw new NotFoundException('Wallet not found');
      }
      const [owner] = await this.users.lockForShare(trx, [user.id]);
      if (owner?.status !== UserStatus.Active) {
        throw new ForbiddenException('Your account is blocked');
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
        walletId: target.id,
        amount: dto.amount,
        currency: target.currency,
        balanceAfter: creditBalanceAfter,
        createdAt: transaction.created_at,
      };
      await this.idempotency.complete(trx, user.id, idempotencyKey, body);
      this.logger.log(
        `Deposit ${transaction.id}: ${dto.amount} kobo into wallet ${target.id}`,
      );
      return { replayed: false, body };
    });
  }

  private async findWalletOrFail(userId: string): Promise<WalletRow> {
    const wallet = await this.wallets.findByUserId(userId);
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return wallet;
  }
}
