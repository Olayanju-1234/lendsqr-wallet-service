import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
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
import { LedgerService } from '../wallets/ledger.service.js';
import { TransactionType } from '../wallets/ledger.types.js';
import { WalletType } from '../wallets/wallet.types.js';
import { WalletsRepository } from '../wallets/wallets.repository.js';
import { CreateTransferDto } from './dto/create-transfer.dto.js';
import type { TransferResponse } from './transfer.types.js';

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly wallets: WalletsRepository,
    private readonly users: UsersRepository,
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async transfer(
    sender: AuthenticatedUser,
    dto: CreateTransferDto,
    idempotencyKey: string,
  ): Promise<IdempotentResult<TransferResponse>> {
    // Fast fail on what the guard already knows. Not authoritative: the real check is under the share lock below.
    if (sender.status !== UserStatus.Active) {
      throw new ForbiddenException('Your account is blocked');
    }
    const description = dto.description || null;
    const requestHash = this.idempotency.hashRequest([
      'transfer',
      dto.recipientWalletId,
      dto.amount,
      description,
    ]);

    // Claim, locks, ledger write and stored response commit or roll back as one unit.
    return this.db.transaction(async (trx) => {
      const stored = await this.idempotency.claim<TransferResponse>(
        trx,
        sender.id,
        idempotencyKey,
        requestHash,
      );
      if (stored) {
        return { replayed: true, body: stored };
      }

      const senderWallet = await this.wallets.findByUserId(sender.id, trx);
      if (!senderWallet) {
        throw new NotFoundException('Wallet not found');
      }
      if (senderWallet.id === dto.recipientWalletId) {
        throw new BadRequestException('You cannot transfer to your own wallet');
      }

      const locked = await this.wallets.lockByIds(trx, [
        senderWallet.id,
        dto.recipientWalletId,
      ]);
      const source = locked.find((w) => w.id === senderWallet.id);
      const target = locked.find((w) => w.id === dto.recipientWalletId);
      if (!source || !target || target.type !== WalletType.User) {
        throw new NotFoundException('Recipient wallet not found');
      }
      if (source.currency !== target.currency) {
        throw new UnprocessableEntityException('Wallet currencies differ');
      }

      if (!target.user_id) {
        throw new Error(`wallet ${target.id} has no owner`);
      }
      // Status read under lock inside the transaction, not from the guard: a concurrent block waits or is seen.
      const parties = await this.users.lockForShare(trx, [
        sender.id,
        target.user_id,
      ]);
      if (
        parties.find((u) => u.id === sender.id)?.status !== UserStatus.Active
      ) {
        throw new ForbiddenException('Your account is blocked');
      }
      const recipient = parties.find((u) => u.id === target.user_id);
      if (!recipient || recipient.status !== UserStatus.Active) {
        throw new ForbiddenException('The recipient cannot receive transfers');
      }

      if (source.balance < dto.amount) {
        throw new UnprocessableEntityException('Insufficient funds');
      }

      const { transaction, debitBalanceAfter } = await this.ledger.post(trx, {
        type: TransactionType.Transfer,
        debit: source,
        credit: target,
        amount: dto.amount,
        description,
        initiatedBy: sender.id,
      });

      const body: TransferResponse = {
        transactionId: transaction.id,
        senderWalletId: source.id,
        recipientWalletId: target.id,
        amount: dto.amount,
        currency: source.currency,
        balanceAfter: debitBalanceAfter,
        description,
        createdAt: transaction.created_at,
      };
      await this.idempotency.complete(trx, sender.id, idempotencyKey, body);
      this.logger.log(
        `Transfer ${transaction.id}: ${dto.amount} kobo from ${source.id} to ${target.id}`,
      );
      return { replayed: false, body };
    });
  }
}
