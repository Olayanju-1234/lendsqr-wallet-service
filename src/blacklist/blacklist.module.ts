import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BlacklistProviderName,
  type EnvironmentVariables,
} from '../config/env.validation.js';
import { BLACKLIST_PROVIDER } from './blacklist.provider.js';
import { BlacklistService } from './blacklist.service.js';
import { KarmaBlacklistProvider } from './karma-blacklist.provider.js';
import { MockBlacklistProvider } from './mock-blacklist.provider.js';

@Module({
  providers: [
    {
      provide: BLACKLIST_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        config.get('BLACKLIST_PROVIDER', { infer: true }) ===
        BlacklistProviderName.Karma
          ? new KarmaBlacklistProvider(config)
          : new MockBlacklistProvider(config),
    },
    BlacklistService,
  ],
  exports: [BlacklistService],
})
export class BlacklistModule {}
