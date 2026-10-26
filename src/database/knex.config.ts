import type { Knex } from 'knex';
import pg from 'pg';
import { migrationSource } from './migrations/index.js';

// Postgres returns bigint as a string by default. Amounts are capped far below 2^53, so a JS number is exact.
pg.types.setTypeParser(pg.types.builtins.INT8, (value: string) =>
  Number(value),
);

export function buildKnexConfig(databaseUrl: string): Knex.Config {
  return {
    client: 'pg',
    connection: databaseUrl,
    pool: { min: 0, max: 10 },
    migrations: { migrationSource },
  };
}
