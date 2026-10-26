import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { toUserResponse, UserResponse, UserStatus } from './user.types.js';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly users: UsersRepository) {}

  async getProfile(id: string): Promise<UserResponse> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toUserResponse(user);
  }

  async block(id: string, reason: string): Promise<UserResponse> {
    const user = await this.users.updateStatus(id, UserStatus.Blocked, reason);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    this.logger.log(`User ${id} blocked: ${reason}`);
    return toUserResponse(user);
  }

  async unblock(id: string): Promise<UserResponse> {
    const user = await this.users.updateStatus(id, UserStatus.Active, null);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    this.logger.log(`User ${id} unblocked`);
    return toUserResponse(user);
  }
}
