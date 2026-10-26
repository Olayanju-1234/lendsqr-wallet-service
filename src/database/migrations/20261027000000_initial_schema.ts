import type { Knex } from 'knex';

// Must match FUNDING_WALLET_ID in src/wallets/wallet.types.ts. Literal here so this migration never changes.
const FUNDING_WALLET_ID = '00000000-0000-4000-8000-000000000001';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('email', 255).notNullable().unique();
    table.string('phone_number', 20).notNullable().unique();
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.string('password_hash', 255).notNullable();
    table
      .enu('status', ['active', 'blocked'])
      .notNullable()
      .defaultTo('active');
    table.string('blocked_reason', 255);
    table.timestamp('blocked_at', { useTz: true });
    table.timestamps(true, true);
  });

  await knex.schema.createTable('wallets', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('user_id').unique().references('id').inTable('users');
    table.enu('type', ['user', 'funding']).notNullable();
    table.string('currency', 3).notNullable().defaultTo('NGN');
    table.bigInteger('balance').notNullable().defaultTo(0);
    table.timestamps(true, true);
  });

  // Last line of defence: even if application code is wrong, a user wallet can never go negative.
  await knex.raw(`
    ALTER TABLE wallets
      ADD CONSTRAINT wallets_user_balance_non_negative CHECK (type <> 'user' OR balance >= 0),
      ADD CONSTRAINT wallets_owner_matches_type CHECK ((type = 'user') = (user_id IS NOT NULL))
  `);

  await knex.schema.createTable('transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.enu('type', ['deposit', 'transfer']).notNullable();
    table.bigInteger('amount').notNullable();
    table.string('currency', 3).notNullable().defaultTo('NGN');
    table.string('description', 255);
    table.uuid('initiated_by').notNullable().references('id').inTable('users');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });
  await knex.raw(
    'ALTER TABLE transactions ADD CONSTRAINT transactions_amount_positive CHECK (amount > 0)',
  );

  // Double entry: each transaction writes one negative (debit) and one positive (credit) row that sum to zero.
  await knex.schema.createTable('ledger_entries', (table) => {
    table.bigIncrements('id').primary();
    table
      .uuid('transaction_id')
      .notNullable()
      .references('id')
      .inTable('transactions');
    table.uuid('wallet_id').notNullable().references('id').inTable('wallets');
    table.bigInteger('amount').notNullable();
    table.bigInteger('balance_after').notNullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.index(['wallet_id', 'id']);
    table.index(['transaction_id']);
  });
  await knex.raw(
    'ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_amount_non_zero CHECK (amount <> 0)',
  );

  await knex.schema.createTable('idempotency_keys', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('user_id').notNullable().references('id').inTable('users');
    table.string('key', 255).notNullable();
    table.string('request_hash', 64).notNullable();
    table.jsonb('response_body');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.unique(['user_id', 'key']);
  });

  await knex('wallets').insert({
    id: FUNDING_WALLET_ID,
    type: 'funding',
    currency: 'NGN',
    balance: 0,
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('idempotency_keys');
  await knex.schema.dropTable('ledger_entries');
  await knex.schema.dropTable('transactions');
  await knex.schema.dropTable('wallets');
  await knex.schema.dropTable('users');
}
