import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../idempotency/idempotency.module.js';
import { UsersModule } from '../users/users.module.js';
import { LedgerRepository } from './ledger.repository.js';
import { LedgerService } from './ledger.service.js';
import { WalletsController } from './wallets.controller.js';
import { WalletsRepository } from './wallets.repository.js';
import { WalletsService } from './wallets.service.js';

@Module({
  imports: [UsersModule, IdempotencyModule],
  controllers: [WalletsController],
  providers: [
    WalletsRepository,
    LedgerRepository,
    LedgerService,
    WalletsService,
  ],
  exports: [WalletsRepository, LedgerService],
})
export class WalletsModule {}
