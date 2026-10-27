import type { Knex } from 'knex';
import pg from 'pg';
import { migrationSource } from './migrations/index.js';

// bigint arrives as a string by default; values here stay far below 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (value: string) =>
  Number(value),
);

// Request pool only: a stuck request must not hold a wallet lock forever. Migrations run without these limits.
const boundSession = (conn: pg.Client, done: (err?: Error) => void): void => {
  conn.query(
    'SET statement_timeout = 15000; SET lock_timeout = 10000; SET idle_in_transaction_session_timeout = 30000',
    (err?: Error) => done(err),
  );
};

export function buildKnexConfig(
  databaseUrl: string,
  { forMigrations = false } = {},
): Knex.Config {
  return {
    client: 'pg',
    connection: databaseUrl,
    pool: forMigrations
      ? { min: 0, max: 1 }
      : { min: 0, max: 10, afterCreate: boundSession },
    migrations: { migrationSource },
  };
}
