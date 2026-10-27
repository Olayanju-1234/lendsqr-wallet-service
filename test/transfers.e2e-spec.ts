import request from 'supertest';
import { FUNDING_WALLET_ID } from '../src/wallets/wallet.types.js';
import {
  ADMIN_KEY,
  assertLedgerInvariants,
  balanceOf,
  createTestApp,
  fund,
  resetDatabase,
  signupUser,
  type TestApp,
  type TestUser,
} from './helpers.js';

describe('Transfers (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => resetDatabase(t.db));
  afterAll(() => t.app.close());

  const transfer = (
    sender: TestUser,
    body: Record<string, unknown>,
    key: string = crypto.randomUUID(),
  ) =>
    request(t.url)
      .post('/transfers')
      .set('Authorization', `Bearer ${sender.token}`)
      .set('Idempotency-Key', key)
      .send(body);

  const block = (user: TestUser) =>
    request(t.url)
      .post(`/admin/users/${user.userId}/block`)
      .set('x-admin-key', ADMIN_KEY)
      .send({ reason: 'Fraud report' })
      .expect(200);

  describe('rules', () => {
    let alice: TestUser;
    let bob: TestUser;

    beforeEach(async () => {
      alice = await signupUser(t.url);
      bob = await signupUser(t.url);
      await fund(t.url, alice, 10_000);
    });

    it('moves money from the sender wallet to the recipient wallet', async () => {
      const res = await transfer(alice, {
        recipientWalletId: bob.walletId,
        amount: 2_500,
        description: 'Lunch',
      }).expect(201);

      expect(res.body).toMatchObject({
        senderWalletId: alice.walletId,
        recipientWalletId: bob.walletId,
        amount: 2_500,
        currency: 'NGN',
        balanceAfter: 7_500,
        description: 'Lunch',
      });
      expect(await balanceOf(t.db, alice.walletId)).toBe(7_500);
      expect(await balanceOf(t.db, bob.walletId)).toBe(2_500);

      const entries = await t
        .db('ledger_entries')
        .where({ transaction_id: res.body.transactionId })
        .orderBy('amount');
      expect(entries).toMatchObject([
        { wallet_id: alice.walletId, amount: -2_500, balance_after: 7_500 },
        { wallet_id: bob.walletId, amount: 2_500, balance_after: 2_500 },
      ]);
      await assertLedgerInvariants(t.db);
    });

    it('rejects insufficient funds with 422 and changes nothing', async () => {
      await transfer(alice, {
        recipientWalletId: bob.walletId,
        amount: 10_001,
      }).expect(422);

      expect(await balanceOf(t.db, alice.walletId)).toBe(10_000);
      expect(await balanceOf(t.db, bob.walletId)).toBe(0);
      expect(
        await t.db('transactions').where({ type: 'transfer' }),
      ).toHaveLength(0);
    });

    it('rejects a transfer to your own wallet with 400', async () => {
      await transfer(alice, {
        recipientWalletId: alice.walletId,
        amount: 100,
      }).expect(400);
    });

    it('returns 404 for an unknown recipient or the internal funding wallet', async () => {
      await transfer(alice, {
        recipientWalletId: crypto.randomUUID(),
        amount: 100,
      }).expect(404);
      await transfer(alice, {
        recipientWalletId: FUNDING_WALLET_ID,
        amount: 100,
      }).expect(404);
    });

    it('rejects with 403 when the sender is blocked', async () => {
      await block(alice);
      await transfer(alice, {
        recipientWalletId: bob.walletId,
        amount: 100,
      }).expect(403);
    });

    it('rejects with 403 when the recipient is blocked', async () => {
      await block(bob);
      await transfer(alice, {
        recipientWalletId: bob.walletId,
        amount: 100,
      }).expect(403);
      expect(await balanceOf(t.db, alice.walletId)).toBe(10_000);
    });

    it('waits for an in-flight block and then refuses the transfer', async () => {
      // Simulate an admin block that has taken the user's row lock but not yet committed.
      const blocking = await t.db.transaction();
      await blocking('users')
        .where({ id: alice.userId })
        .update({ status: 'blocked', blocked_reason: 'Fraud report' });

      const pending = transfer(alice, {
        recipientWalletId: bob.walletId,
        amount: 100,
      });
      // The transfer is now blocked on FOR SHARE. Give it time to get there, then commit the block.
      await new Promise((resolve) => setTimeout(resolve, 300));
      await blocking.commit();

      await pending.expect(403);
      expect(await balanceOf(t.db, alice.walletId)).toBe(10_000);
    });

    it('validates the body and requires an Idempotency-Key', async () => {
      await transfer(alice, { recipientWalletId: 'nope', amount: 100 }).expect(
        400,
      );
      await transfer(alice, {
        recipientWalletId: bob.walletId,
        amount: 99.5,
      }).expect(400);
      await request(t.url)
        .post('/transfers')
        .set('Authorization', `Bearer ${alice.token}`)
        .send({ recipientWalletId: bob.walletId, amount: 100 })
        .expect(400);
    });
  });

  describe('idempotency', () => {
    let alice: TestUser;
    let bob: TestUser;

    beforeEach(async () => {
      alice = await signupUser(t.url);
      bob = await signupUser(t.url);
      await fund(t.url, alice, 10_000);
    });

    it('returns the original response for a replayed key and moves money once', async () => {
      const key = crypto.randomUUID();
      const body = { recipientWalletId: bob.walletId, amount: 1_000 };

      const first = await transfer(alice, body, key).expect(201);
      const replay = await transfer(alice, body, key).expect(201);

      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(replay.body).toEqual(first.body);
      expect(await balanceOf(t.db, alice.walletId)).toBe(9_000);
      expect(await balanceOf(t.db, bob.walletId)).toBe(1_000);
    });

    it('rejects a reused key with a different body with 422', async () => {
      const key = crypto.randomUUID();
      await transfer(
        alice,
        { recipientWalletId: bob.walletId, amount: 1_000 },
        key,
      ).expect(201);

      await transfer(
        alice,
        { recipientWalletId: bob.walletId, amount: 2_000 },
        key,
      ).expect(422);
      expect(await balanceOf(t.db, alice.walletId)).toBe(9_000);
    });

    it('lets the same key be used by different users', async () => {
      const key = crypto.randomUUID();
      await fund(t.url, bob, 5_000);

      await transfer(
        alice,
        { recipientWalletId: bob.walletId, amount: 1_000 },
        key,
      ).expect(201);
      await transfer(
        bob,
        { recipientWalletId: alice.walletId, amount: 1_000 },
        key,
      ).expect(201);
    });

    it('does not store failed attempts, so a retry after funding succeeds', async () => {
      const key = crypto.randomUUID();
      const body = { recipientWalletId: bob.walletId, amount: 15_000 };

      await transfer(alice, body, key).expect(422);
      await fund(t.url, alice, 5_000);
      await transfer(alice, body, key).expect(201);
    });

    it('applies 10 simultaneous requests with the same key exactly once', async () => {
      const key = crypto.randomUUID();
      const body = { recipientWalletId: bob.walletId, amount: 1_000 };

      const responses = await Promise.all(
        Array.from({ length: 10 }, () => transfer(alice, body, key)),
      );

      expect(responses.map((res) => res.status)).toEqual(Array(10).fill(201));
      const ids = new Set(responses.map((res) => res.body.transactionId));
      expect(ids.size).toBe(1);
      expect(await balanceOf(t.db, alice.walletId)).toBe(9_000);
      expect(await balanceOf(t.db, bob.walletId)).toBe(1_000);
    });
  });

  describe('concurrency', () => {
    it('never overdraws under 50 parallel transfers', async () => {
      const sender = await signupUser(t.url);
      const recipient = await signupUser(t.url);
      await fund(t.url, sender, 10_000);

      // 50 x 300 = 15,000 requested against 10,000 available: exactly 33 can succeed.
      const responses = await Promise.all(
        Array.from({ length: 50 }, () =>
          transfer(sender, {
            recipientWalletId: recipient.walletId,
            amount: 300,
          }),
        ),
      );

      const statuses = responses.map((res) => res.status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(33);
      expect(statuses.filter((s) => s === 422)).toHaveLength(17);
      expect(await balanceOf(t.db, sender.walletId)).toBe(100);
      expect(await balanceOf(t.db, recipient.walletId)).toBe(9_900);
      await assertLedgerInvariants(t.db);
    });

    it('does not deadlock when two users pay each other at the same time', async () => {
      const alice = await signupUser(t.url);
      const bob = await signupUser(t.url);
      await fund(t.url, alice, 10_000);
      await fund(t.url, bob, 10_000);

      const responses = await Promise.all(
        Array.from({ length: 40 }, (_, i) =>
          i % 2 === 0
            ? transfer(alice, { recipientWalletId: bob.walletId, amount: 100 })
            : transfer(bob, { recipientWalletId: alice.walletId, amount: 50 }),
        ),
      );

      expect(responses.map((res) => res.status)).toEqual(Array(40).fill(201));
      expect(await balanceOf(t.db, alice.walletId)).toBe(
        10_000 - 2_000 + 1_000,
      );
      expect(await balanceOf(t.db, bob.walletId)).toBe(10_000 + 2_000 - 1_000);
      await assertLedgerInvariants(t.db);
    });
  });
});
