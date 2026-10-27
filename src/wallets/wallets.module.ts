import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../idempotency/idempotency.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminReconciliationController } from './admin-reconciliation.controller.js';
import { LedgerRepository } from './ledger.repository.js';
import { LedgerService } from './ledger.service.js';
import { ReconciliationService } from './reconciliation.service.js';
import { WalletsController } from './wallets.controller.js';
import { WalletsRepository } from './wallets.repository.js';
import { WalletsService } from './wallets.service.js';

@Module({
  imports: [UsersModule, IdempotencyModule],
  controllers: [WalletsController, AdminReconciliationController],
  providers: [
    WalletsRepository,
    LedgerRepository,
    LedgerService,
    WalletsService,
    ReconciliationService,
  ],
  exports: [WalletsRepository, LedgerService],
})
export class WalletsModule {}
