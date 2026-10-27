import request from 'supertest';
import {
  ADMIN_KEY,
  assertLedgerInvariants,
  balanceOf,
  createTestApp,
  resetDatabase,
  signupUser,
  type TestApp,
} from './helpers.js';

describe('Wallet deposits and history (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => resetDatabase(t.db));
  afterAll(() => t.app.close());

  const deposit = (token: string, key: string, amount: number) =>
    request(t.url)
      .post('/wallets/me/deposits')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ amount });

  it('credits the wallet from the funding wallet and keeps the ledger balanced', async () => {
    const user = await signupUser(t.url);

    const res = await deposit(user.token, crypto.randomUUID(), 50_000).expect(
      201,
    );

    expect(res.body).toMatchObject({
      walletId: user.walletId,
      amount: 50_000,
      balanceAfter: 50_000,
    });
    expect(await balanceOf(t.db, user.walletId)).toBe(50_000);
    await assertLedgerInvariants(t.db);
  });

  it('applies a replayed deposit only once', async () => {
    const user = await signupUser(t.url);
    const key = crypto.randomUUID();

    const first = await deposit(user.token, key, 10_000).expect(201);
    const replay = await deposit(user.token, key, 10_000).expect(201);

    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body).toEqual(first.body);
    expect(await balanceOf(t.db, user.walletId)).toBe(10_000);
  });

  it('rejects non-integer, zero and oversized amounts', async () => {
    const user = await signupUser(t.url);
    for (const amount of [10.5, 0, -100, 1_000_000_001]) {
      await deposit(user.token, crypto.randomUUID(), amount).expect(400);
    }
  });

  it('blocks deposits for a blocked user', async () => {
    const user = await signupUser(t.url);
    await request(t.url)
      .post(`/admin/users/${user.userId}/block`)
      .set('x-admin-key', ADMIN_KEY)
      .send({ reason: 'Fraud report' })
      .expect(200);

    await deposit(user.token, crypto.randomUUID(), 10_000).expect(403);
  });

  it('is refused by the database itself when a user balance would go negative', async () => {
    const user = await signupUser(t.url);
    await expect(
      t.db('wallets').where({ id: user.walletId }).update({ balance: -1 }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('lists ledger entries newest first with a cursor for the next page', async () => {
    const user = await signupUser(t.url);
    await deposit(user.token, crypto.randomUUID(), 1_000).expect(201);
    await deposit(user.token, crypto.randomUUID(), 2_000).expect(201);
    await deposit(user.token, crypto.randomUUID(), 3_000).expect(201);

    const first = await request(t.url)
      .get('/wallets/me/transactions?limit=2')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(first.body.data.map((e: { amount: number }) => e.amount)).toEqual([
      3_000, 2_000,
    ]);
    expect(first.body.data[0]).toMatchObject({
      type: 'deposit',
      direction: 'credit',
      balanceAfter: 6_000,
    });
    expect(first.body.nextCursor).toBe(first.body.data[1].id);

    const second = await request(t.url)
      .get(`/wallets/me/transactions?limit=2&cursor=${first.body.nextCursor}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(second.body.data.map((e: { amount: number }) => e.amount)).toEqual([
      1_000,
    ]);
    expect(second.body.nextCursor).toBeNull();

    await request(t.url)
      .get('/wallets/me/transactions?limit=0')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(400);
  });
});
