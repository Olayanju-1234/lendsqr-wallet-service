import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { IdempotencyKey } from '../common/decorators/idempotency-key.decorator.js';
import { sendIdempotent } from '../common/idempotent-replay.js';
import { CreateTransferDto } from './dto/create-transfer.dto.js';
import type { TransferResponse } from './transfer.types.js';
import { TransfersService } from './transfers.service.js';

@Controller('transfers')
@UseGuards(AuthGuard)
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @IdempotencyKey() idempotencyKey: string,
    @Body() dto: CreateTransferDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TransferResponse> {
    return sendIdempotent(
      res,
      await this.transfers.transfer(user, dto, idempotencyKey),
    );
  }
}
