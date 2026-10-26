import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  BLACKLIST_PROVIDER,
  type BlacklistProvider,
} from './blacklist.provider.js';

@Injectable()
export class BlacklistService {
  private readonly logger = new Logger(BlacklistService.name);

  constructor(
    @Inject(BLACKLIST_PROVIDER) private readonly provider: BlacklistProvider,
  ) {}

  async assertCanOnboard(identities: string[]): Promise<void> {
    const results = await Promise.all(
      identities.map((identity) => this.provider.isBlacklisted(identity)),
    );
    if (results.some(Boolean)) {
      this.logger.warn('Signup rejected: identity is on the blacklist');
      throw new ForbiddenException(
        'This user cannot be onboarded because an identity is blacklisted.',
      );
    }
  }
}
