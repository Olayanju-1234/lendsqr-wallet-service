import { Logger } from '@nestjs/common';
import knex from 'knex';
import { buildKnexConfig } from './knex.config.js';

const logger = new Logger('Migrations');

async function migrate(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const db = knex(buildKnexConfig(databaseUrl));
  try {
    const [batch, applied] = (await db.migrate.latest()) as [number, string[]];
    logger.log(
      applied.length > 0
        ? `Batch ${batch} applied: ${applied.join(', ')}`
        : 'Already up to date',
    );
  } finally {
    await db.destroy();
  }
}

await migrate();
