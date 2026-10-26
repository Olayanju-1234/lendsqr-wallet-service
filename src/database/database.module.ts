import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import knex, { type Knex } from 'knex';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { KNEX } from './database.constants.js';
import { buildKnexConfig } from './knex.config.js';

@Global()
@Module({
  providers: [
    {
      provide: KNEX,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>): Knex =>
        knex(buildKnexConfig(config.get('DATABASE_URL', { infer: true }))),
    },
  ],
  exports: [KNEX],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(KNEX) private readonly db: Knex) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}
