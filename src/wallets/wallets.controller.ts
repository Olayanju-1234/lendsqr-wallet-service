import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { IdempotencyKey } from '../common/decorators/idempotency-key.decorator.js';
import { sendIdempotent } from '../common/idempotent-replay.js';
import { DepositDto } from './dto/deposit.dto.js';
import { LedgerQueryDto } from './dto/ledger-query.dto.js';
import type { WalletResponse } from './wallet.types.js';
import {
  DepositResponse,
  LedgerPage,
  WalletsService,
} from './wallets.service.js';

@Controller('wallets/me')
@UseGuards(AuthGuard)
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Get()
  getMyWallet(@CurrentUser() user: AuthenticatedUser): Promise<WalletResponse> {
    return this.wallets.getMyWallet(user.id);
  }

  @Get('transactions')
  listMyEntries(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: LedgerQueryDto,
  ): Promise<LedgerPage> {
    return this.wallets.listMyEntries(user.id, query);
  }

  @Post('deposits')
  async deposit(
    @CurrentUser() user: AuthenticatedUser,
    @IdempotencyKey() idempotencyKey: string,
    @Body() dto: DepositDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DepositResponse> {
    return sendIdempotent(
      res,
      await this.wallets.deposit(user, dto, idempotencyKey),
    );
  }
}
