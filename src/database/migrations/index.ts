import type { Knex } from 'knex';
import * as initialSchema from './20261027000000_initial_schema.js';

// Migrations are imported explicitly so the same list runs from compiled dist/ and from Vitest.
const migrations: Record<string, Knex.Migration> = {
  '20261027000000_initial_schema': initialSchema,
};

export const migrationSource: Knex.MigrationSource<string> = {
  getMigrations: () => Promise.resolve(Object.keys(migrations)),
  getMigrationName: (name) => name,
  getMigration: (name) => Promise.resolve(migrations[name]),
};
