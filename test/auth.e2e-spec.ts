import request from 'supertest';
import {
  ADMIN_KEY,
  createTestApp,
  resetDatabase,
  signupUser,
  type TestApp,
} from './helpers.js';

describe('Accounts and user management (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => resetDatabase(t.db));
  afterAll(() => t.app.close());

  const signup = (overrides: Record<string, string> = {}) =>
    request(t.url)
      .post('/auth/signup')
      .send({
        email: 'ada@example.com',
        phoneNumber: '+2348012345678',
        firstName: 'Ada',
        lastName: 'Obi',
        password: 'correct-horse-battery',
        ...overrides,
      });

  it('creates a user with an empty NGN wallet and returns a token', async () => {
    const res = await signup().expect(201);

    expect(res.body.user).toMatchObject({
      email: 'ada@example.com',
      status: 'active',
    });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('password_hash');
    expect(res.body.wallet).toMatchObject({ currency: 'NGN', balance: 0 });
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('refuses to onboard a blacklisted email or phone number and stores nothing', async () => {
    await signup({ email: 'blacklisted@example.com' }).expect(403);
    await signup({ phoneNumber: '+2348000000000' }).expect(403);

    expect(await t.db('users').count({ count: '*' })).toEqual([{ count: 0 }]);
  });

  it('rejects a duplicate email or phone number with 409', async () => {
    await signup().expect(201);
    await signup({ phoneNumber: '+2348012345679' }).expect(409);
    await signup({ email: 'other@example.com' }).expect(409);
  });

  it('rejects invalid input and unknown fields with 400', async () => {
    const res = await signup({ email: 'not-an-email', role: 'admin' }).expect(
      400,
    );
    expect(res.body.message).toEqual(
      expect.arrayContaining(['property role should not exist']),
    );
  });

  it('logs in with the right password only', async () => {
    await signup().expect(201);

    await request(t.url)
      .post('/auth/login')
      .send({ email: 'ADA@example.com', password: 'correct-horse-battery' })
      .expect(200);
    await request(t.url)
      .post('/auth/login')
      .send({ email: 'ada@example.com', password: 'wrong-password' })
      .expect(401);
  });

  it('requires a valid bearer token on protected routes', async () => {
    await request(t.url).get('/wallets/me').expect(401);
    await request(t.url)
      .get('/wallets/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
  });

  describe('block and unblock', () => {
    it('needs the admin key', async () => {
      const user = await signupUser(t.url);
      await request(t.url)
        .post(`/admin/users/${user.userId}/block`)
        .send({ reason: 'Fraud report' })
        .expect(401);
      await request(t.url)
        .post(`/admin/users/${user.userId}/block`)
        .set('x-admin-key', 'wrong-key-wrong-key')
        .send({ reason: 'Fraud report' })
        .expect(401);
    });

    it('blocks and unblocks a user', async () => {
      const user = await signupUser(t.url);

      const blocked = await request(t.url)
        .post(`/admin/users/${user.userId}/block`)
        .set('x-admin-key', ADMIN_KEY)
        .send({ reason: 'Fraud report' })
        .expect(200);
      expect(blocked.body).toMatchObject({
        status: 'blocked',
        blockedReason: 'Fraud report',
      });

      const unblocked = await request(t.url)
        .post(`/admin/users/${user.userId}/unblock`)
        .set('x-admin-key', ADMIN_KEY)
        .expect(200);
      expect(unblocked.body).toMatchObject({
        status: 'active',
        blockedReason: null,
      });
    });

    it('re-checks an existing user against the blacklist', async () => {
      const clean = await signupUser(t.url);
      const res = await request(t.url)
        .get(`/admin/users/${clean.userId}/blacklist-check`)
        .set('x-admin-key', ADMIN_KEY)
        .expect(200);
      expect(res.body).toMatchObject({
        userId: clean.userId,
        status: 'active',
        blacklisted: false,
      });
      expect(res.body.identities).toHaveLength(2);

      // A user reported after onboarding: insert directly, since signup would refuse this phone number.
      const [reported] = await t
        .db('users')
        .insert({
          email: 'late@example.com',
          phone_number: '+2348000000000',
          first_name: 'Late',
          last_name: 'Report',
          password_hash: 'x',
        })
        .returning('id');
      const flagged = await request(t.url)
        .get(`/admin/users/${reported.id}/blacklist-check`)
        .set('x-admin-key', ADMIN_KEY)
        .expect(200);
      expect(flagged.body.blacklisted).toBe(true);
      expect(flagged.body.identities).toEqual([
        { identity: 'late@example.com', blacklisted: false },
        { identity: '+2348000000000', blacklisted: true },
      ]);

      await request(t.url)
        .get(`/admin/users/${reported.id}/blacklist-check`)
        .expect(401);
    });

    it('returns 404 for an unknown user and 400 for a malformed id', async () => {
      await request(t.url)
        .post(`/admin/users/${crypto.randomUUID()}/unblock`)
        .set('x-admin-key', ADMIN_KEY)
        .expect(404);
      await request(t.url)
        .post('/admin/users/123/unblock')
        .set('x-admin-key', ADMIN_KEY)
        .expect(400);
    });
  });
});
