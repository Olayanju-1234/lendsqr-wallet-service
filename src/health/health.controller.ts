import { Controller, Get, Inject } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../database/database.constants.js';

@Controller()
export class HealthController {
  constructor(@Inject(KNEX) private readonly db: Knex) {}

  @Get()
  root(): { name: string; docs: string } {
    return {
      name: 'Lendsqr wallet service',
      docs: 'https://github.com/Olayanju-1234/lendsqr-wallet-service#api',
    };
  }

  @Get('health')
  async health(): Promise<{ status: 'ok' }> {
    await this.db.raw('select 1');
    return { status: 'ok' };
  }
}
