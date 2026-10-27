import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  BLACKLIST_PROVIDER,
  type BlacklistProvider,
} from './blacklist.provider.js';

export interface IdentityCheck {
  identity: string;
  blacklisted: boolean;
}

@Injectable()
export class BlacklistService {
  private readonly logger = new Logger(BlacklistService.name);

  constructor(
    @Inject(BLACKLIST_PROVIDER) private readonly provider: BlacklistProvider,
  ) {}

  async check(identities: string[]): Promise<IdentityCheck[]> {
    return Promise.all(
      identities.map(async (identity) => ({
        identity,
        blacklisted: await this.provider.isBlacklisted(identity),
      })),
    );
  }

  async assertCanOnboard(identities: string[]): Promise<void> {
    const results = await this.check(identities);
    if (results.some((result) => result.blacklisted)) {
      this.logger.warn('Signup rejected: identity is on the blacklist');
      throw new ForbiddenException(
        'This user cannot be onboarded because an identity is blacklisted.',
      );
    }
  }
}
