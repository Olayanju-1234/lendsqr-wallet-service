import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation.js';
import type { BlacklistProvider } from './blacklist.provider.js';

@Injectable()
export class MockBlacklistProvider implements BlacklistProvider {
  private readonly blacklisted: Set<string>;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.blacklisted = new Set(
      config
        .get('MOCK_BLACKLIST', { infer: true })
        .split(',')
        .map((identity) => identity.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  isBlacklisted(identity: string): Promise<boolean> {
    return Promise.resolve(this.blacklisted.has(identity.toLowerCase()));
  }
}
