import { Module } from '@nestjs/common';
import { BlacklistModule } from '../blacklist/blacklist.module.js';
import { AdminUsersController } from './admin-users.controller.js';
import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [BlacklistModule],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersRepository, UsersService],
  exports: [UsersRepository],
})
export class UsersModule {}
