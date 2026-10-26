import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../idempotency/idempotency.module.js';
import { UsersModule } from '../users/users.module.js';
import { WalletsModule } from '../wallets/wallets.module.js';
import { TransfersController } from './transfers.controller.js';
import { TransfersService } from './transfers.service.js';

@Module({
  imports: [UsersModule, WalletsModule, IdempotencyModule],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
