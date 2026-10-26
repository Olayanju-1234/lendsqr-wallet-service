import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Knex } from 'knex';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { KNEX } from '../src/database/database.constants.js';
import type { WalletRow } from '../src/wallets/wallet.types.js';

export const ADMIN_KEY = 'e2e-admin-key-0000';

export interface TestApp {
  app: INestApplication;
  db: Knex;
  url: string;
}

export interface TestUser {
  userId: string;
  walletId: string;
  token: string;
  email: string;
}

let userCounter = 0;

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  return { app, db: app.get<Knex>(KNEX), url: await app.getUrl() };
}

export async function resetDatabase(db: Knex): Promise<void> {
  await db.raw(
    'TRUNCATE idempotency_keys, ledger_entries, transactions RESTART IDENTITY',
  );
  await db('wallets').where({ type: 'user' }).delete();
  await db('users').delete();
  await db('wallets').update({ balance: 0 });
}

export async function signupUser(url: string): Promise<TestUser> {
  userCounter += 1;
  const suffix = String(userCounter).padStart(8, '0');
  const email = `user${suffix}@example.com`;
  const res = await request(url)
    .post('/auth/signup')
    .send({
      email,
      phoneNumber: `+23481${suffix}`,
      firstName: 'Test',
      lastName: `User${suffix}`,
      password: 'correct-horse-battery',
    })
    .expect(201);
  const body = res.body as {
    user: { id: string };
    wallet: { id: string };
    accessToken: string;
  };
  return {
    userId: body.user.id,
    walletId: body.wallet.id,
    token: body.accessToken,
    email,
  };
}

export async function fund(
  url: string,
  user: TestUser,
  amount: number,
): Promise<void> {
  await request(url)
    .post('/wallets/me/deposits')
    .set('Authorization', `Bearer ${user.token}`)
    .set('Idempotency-Key', crypto.randomUUID())
    .send({ amount })
    .expect(201);
}

export async function balanceOf(db: Knex, walletId: string): Promise<number> {
  const row = await db<WalletRow>('wallets').where({ id: walletId }).first();
  return row?.balance ?? Number.NaN;
}

// The two invariants of a double-entry ledger: all balances sum to zero, and every wallet's balance equals its entries.
export async function assertLedgerInvariants(db: Knex): Promise<void> {
  const [{ total }] = await db('wallets').sum<{ total: number }[]>({
    total: 'balance',
  });
  expect(Number(total)).toBe(0);

  const mismatched = await db('wallets as w')
    .leftJoin('ledger_entries as e', 'e.wallet_id', 'w.id')
    .groupBy('w.id', 'w.balance')
    .havingRaw('w.balance <> coalesce(sum(e.amount), 0)')
    .select('w.id');
  expect(mismatched).toEqual([]);
}
