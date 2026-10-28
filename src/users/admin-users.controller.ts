import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminKeyGuard } from '../common/guards/admin-key.guard.js';
import { BlockUserDto } from './dto/block-user.dto.js';
import type { AdminUserResponse } from './user.types.js';
import { type BlacklistCheckResponse, UsersService } from './users.service.js';

@Controller('admin/users')
@UseGuards(AdminKeyGuard)
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':id/blacklist-check')
  blacklistCheck(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BlacklistCheckResponse> {
    return this.users.blacklistCheck(id);
  }

  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  block(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BlockUserDto,
  ): Promise<AdminUserResponse> {
    return this.users.block(id, dto.reason);
  }

  @Post(':id/unblock')
  @HttpCode(HttpStatus.OK)
  unblock(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserResponse> {
    return this.users.unblock(id);
  }
}
