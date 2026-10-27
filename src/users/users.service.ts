import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  BlacklistService,
  type IdentityCheck,
} from '../blacklist/blacklist.service.js';
import { toUserResponse, type UserResponse, UserStatus } from './user.types.js';
import { UsersRepository } from './users.repository.js';

export interface BlacklistCheckResponse {
  userId: string;
  status: UserStatus;
  blacklisted: boolean;
  identities: IdentityCheck[];
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly blacklist: BlacklistService,
  ) {}

  async getProfile(id: string): Promise<UserResponse> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toUserResponse(user);
  }

  // Re-checks an existing user, for someone reported to the blacklist after they were onboarded.
  // Reports only; blocking stays an explicit admin decision.
  async blacklistCheck(id: string): Promise<BlacklistCheckResponse> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const identities = await this.blacklist.check([
      user.email,
      user.phone_number,
    ]);
    const blacklisted = identities.some((result) => result.blacklisted);
    if (blacklisted) {
      this.logger.warn(`User ${id} is on the blacklist`);
    }
    return { userId: user.id, status: user.status, blacklisted, identities };
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
