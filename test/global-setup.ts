import knex from 'knex';
import { buildKnexConfig } from '../src/database/knex.config.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://wallet:wallet@localhost:5433/wallet_test';

export default async function setup(): Promise<void> {
  const db = knex(buildKnexConfig(TEST_DATABASE_URL));
  try {
    await db.migrate.rollback(undefined, true);
    await db.migrate.latest();
  } finally {
    await db.destroy();
  }
}
