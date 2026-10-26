import {
  Inject,
  Injectable,
  Logger,
  NotImplementedException,
} from '@nestjs/common';
import type { Knex } from 'knex';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { KNEX } from '../database/database.constants.js';
import {
  IdempotencyService,
  type IdempotentResult,
} from '../idempotency/idempotency.service.js';
import { UsersRepository } from '../users/users.repository.js';
import { LedgerService } from '../wallets/ledger.service.js';
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

  // TODO(Joseph): implement. The behaviour it must satisfy is in test/transfers.e2e-spec.ts.
  transfer(
    sender: AuthenticatedUser,
    dto: CreateTransferDto,
    idempotencyKey: string,
  ): Promise<IdempotentResult<TransferResponse>> {
    void sender;
    void dto;
    void idempotencyKey;
    throw new NotImplementedException('transfer');
  }
}
