import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminKeyGuard } from '../common/guards/admin-key.guard.js';
import { BlockUserDto } from './dto/block-user.dto.js';
import type { UserResponse } from './user.types.js';
import { UsersService } from './users.service.js';

@Controller('admin/users')
@UseGuards(AdminKeyGuard)
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  block(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BlockUserDto,
  ): Promise<UserResponse> {
    return this.users.block(id, dto.reason);
  }

  @Post(':id/unblock')
  @HttpCode(HttpStatus.OK)
  unblock(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponse> {
    return this.users.unblock(id);
  }
}
