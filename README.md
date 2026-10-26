# Lendsqr wallet service

A wallet service that creates user accounts, checks them against a blacklist, lets an admin block and unblock them, and moves money between wallets safely under concurrent requests.

Built with NestJS 12, TypeScript, Knex and PostgreSQL 18. Hosted on Render.

- **Live URL:** https://lendsqr-wallet-service.onrender.com (free tier: the first request after 15 idle minutes takes about a minute)
- **Health:** `GET /health`

## Contents

- [Setup](#setup)
- [API](#api)
- [Design decisions](#design-decisions)
- [Trade-offs and what I would do next](#trade-offs-and-what-i-would-do-next)
- [Project layout](#project-layout)

## Setup

Requirements: Node 24, Docker.

```bash
git clone https://github.com/Olayanju-1234/lendsqr-wallet-service.git
cd lendsqr-wallet-service
npm ci
cp .env.example .env        # then set JWT_SECRET and ADMIN_API_KEY to long random strings
docker compose up -d --wait  # Postgres 18 on localhost:5433 with the wallet and wallet_test databases
npm run build && npm run db:migrate
npm run start:dev
```

Tests:

```bash
npm test          # unit tests (no database)
npm run test:e2e  # end-to-end tests against the wallet_test database, including the concurrency tests
npm run lint && npm run typecheck
```

Environment variables (validated at boot; the app refuses to start if one is wrong):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | 32+ characters; signs access tokens |
| `JWT_EXPIRES_IN_SECONDS` | Token lifetime, default 3600 |
| `ADMIN_API_KEY` | 16+ characters; sent as `x-admin-key` on `/admin` routes |
| `BLACKLIST_PROVIDER` | `karma` (Lendsqr Adjutor Karma) or `mock` |
| `ADJUTOR_BASE_URL`, `ADJUTOR_API_KEY` | Used when the provider is `karma` |
| `MOCK_BLACKLIST` | Comma-separated emails and phone numbers the mock treats as blacklisted |

The hosted instance runs with the mock provider so the behaviour can be demonstrated: signing up with `blacklisted@example.com` or `+2348000000000` is refused. Switching `BLACKLIST_PROVIDER=karma` and setting `ADJUTOR_API_KEY` calls the real Karma lookup with no code change.

## API

All amounts are integers in **kobo** (₦1 = 100 kobo). Requests and responses are JSON. Errors use NestJS's standard shape: `{ "statusCode": 422, "message": "Insufficient funds", "error": "Unprocessable Entity" }`.

### Accounts

| Method and path | Auth | What it does |
|---|---|---|
| `POST /auth/signup` | none | Creates a user and their NGN wallet after the blacklist check. Returns the user, the wallet and an access token. |
| `POST /auth/login` | none | Returns an access token. |
| `GET /users/me` | Bearer | The caller's profile and status. |

Signup body:

```json
{
  "email": "ada@example.com",
  "phoneNumber": "+2348012345678",
  "firstName": "Ada",
  "lastName": "Obi",
  "password": "correct-horse-battery"
}
```

Responses: `201` created, `400` validation error (unknown fields are rejected too), `403` an identity is blacklisted, `409` email or phone already registered, `503` the blacklist service could not be reached.

### Wallets

| Method and path | Auth | What it does |
|---|---|---|
| `GET /wallets/me` | Bearer | Balance and currency. |
| `GET /wallets/me/transactions?page=1&limit=20` | Bearer | Ledger entries, newest first, with `direction`, `balanceAfter` and the counterparty wallet. |
| `POST /wallets/me/deposits` | Bearer + `Idempotency-Key` | Credits the wallet. Body: `{ "amount": 50000 }`. Stands in for a verified payment webhook. |

### Transfers

`POST /transfers` with a Bearer token and an `Idempotency-Key` header (8 to 255 characters; a UUID works).

```json
{ "recipientWalletId": "e1962497-b3d0-46a0-97d7-fe085bf58dcc", "amount": 2500, "description": "Lunch" }
```

```json
{
  "transactionId": "3f0c…",
  "senderWalletId": "…",
  "recipientWalletId": "e1962497-…",
  "amount": 2500,
  "currency": "NGN",
  "balanceAfter": 7500,
  "description": "Lunch",
  "createdAt": "2026-10-27T09:12:44.120Z"
}
```

| Status | When |
|---|---|
| `201` | Transfer applied. A replay of the same key returns the original body with the header `Idempotent-Replayed: true`. |
| `400` | Validation error, missing `Idempotency-Key`, or transfer to your own wallet. |
| `403` | Sender or recipient is blocked. |
| `404` | Recipient wallet does not exist. |
| `409` | A request with this key is still in flight. |
| `422` | Insufficient funds, or the key was already used with a different body. |

### Admin

| Method and path | Auth | What it does |
|---|---|---|
| `POST /admin/users/:id/block` | `x-admin-key` | Body `{ "reason": "Fraud report" }`. A blocked user cannot send, receive or deposit. |
| `POST /admin/users/:id/unblock` | `x-admin-key` | Restores the user. |

### Quick walkthrough with curl

```bash
BASE=https://lendsqr-wallet-service.onrender.com

# 1. Two users
ADA=$(curl -s -X POST $BASE/auth/signup -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","phoneNumber":"+2348012345678","firstName":"Ada","lastName":"Obi","password":"correct-horse-battery"}')
BOB=$(curl -s -X POST $BASE/auth/signup -H 'content-type: application/json' \
  -d '{"email":"bob@example.com","phoneNumber":"+2348012345679","firstName":"Bob","lastName":"Eze","password":"correct-horse-battery"}')
ADA_TOKEN=$(echo $ADA | jq -r .accessToken); BOB_WALLET=$(echo $BOB | jq -r .wallet.id)

# 2. Fund Ada, then pay Bob. Send the transfer twice with the same key: money moves once.
curl -s -X POST $BASE/wallets/me/deposits -H "authorization: Bearer $ADA_TOKEN" \
  -H "idempotency-key: $(uuidgen)" -H 'content-type: application/json' -d '{"amount":10000}'
KEY=$(uuidgen)
for i in 1 2; do
  curl -si -X POST $BASE/transfers -H "authorization: Bearer $ADA_TOKEN" -H "idempotency-key: $KEY" \
    -H 'content-type: application/json' -d "{\"recipientWalletId\":\"$BOB_WALLET\",\"amount\":2500}" | grep -i "HTTP/\|idempotent-replayed\|balanceAfter"
done
```

## Design decisions

### Money is an integer in kobo, stored as `bigint`

Floating point cannot represent 0.1 exactly, and `DECIMAL` columns come back from the driver as strings that are easy to mishandle. Integers in the smallest unit are exact, compare correctly and add correctly. Amounts are capped at ₦10,000,000 per operation so every value stays far inside JavaScript's safe-integer range; the `pg` driver is told to parse `bigint` columns as numbers on that basis.

### Double-entry ledger

Every movement is a `transactions` row plus two `ledger_entries` rows: a negative one for the wallet that pays and a positive one for the wallet that receives, each recording `balance_after`. Deposits debit a system *funding* wallet, so the sum of all balances is always zero and any wallet's balance can be recomputed from its entries. The e2e suite asserts both invariants after the concurrency tests. The `wallets.balance` column is a cached total so reads do not aggregate the ledger.

### Concurrency: row locks in a consistent order

A transfer runs in one database transaction:

1. claim the idempotency key;
2. `SELECT … FOR UPDATE` both wallets, **ordered by id**;
3. check the sender's balance on the locked row;
4. write the transaction and both ledger entries, update both balances;
5. store the response against the key;
6. commit.

`FOR UPDATE` makes concurrent transfers that touch the same wallet queue up, so a balance check can never be based on a stale read. Locking in id order means a transfer from A to B and one from B to A acquire the same locks in the same order, so Postgres never has to abort one for deadlock. The database adds a last line of defence: `CHECK (balance >= 0)` on user wallets, so even a bug in this code could not overdraw a wallet.

The e2e suite fires 50 parallel transfers of ₦300 from a wallet holding ₦10,000 and asserts exactly 33 succeed, 17 fail with 422, and the final balances are ₦100 and ₦9,900. A second test runs 40 interleaved A→B and B→A transfers and asserts all succeed.

### Idempotency and replay protection

Money-moving endpoints require an `Idempotency-Key` header, scoped per user. The key is inserted into `idempotency_keys` with `ON CONFLICT DO NOTHING` *inside the same transaction* as the transfer:

- **First request:** the insert succeeds, the transfer runs, the response is stored on the key, everything commits together.
- **Replay after completion:** the insert conflicts, the stored response is returned with `Idempotent-Replayed: true`. No locks are taken and nothing moves.
- **Concurrent duplicate:** the second insert blocks on the unique index until the first transaction commits, then reads the stored response. Ten simultaneous requests with the same key produce one transfer; the test covers it.
- **Same key, different body:** a hash of the request is stored with the key; a mismatch returns 422 rather than silently returning an unrelated response.
- **Failed attempt:** the transaction rolls back, which also removes the key, so the client can retry the same key after fixing the cause (for example, after funding the wallet).

### Blacklist check

`BlacklistService` depends on a `BlacklistProvider` interface. `KarmaBlacklistProvider` calls Adjutor's `GET /verification/karma/{identity}` with a 5-second timeout for the email and the phone number; `MockBlacklistProvider` reads a list from the environment. The check **fails closed**: if Karma times out or errors, signup returns 503 instead of onboarding someone who might be blacklisted. Because the check runs before any row is written, a rejected signup leaves nothing in the database.

### Block and unblock

`users.status` is `active` or `blocked`, with the reason and time recorded. The auth guard reloads the user from the database on every request rather than trusting the status in the token, so a block takes effect on the next request, not when the token expires. Transfers also check the *recipient's* status inside the transaction, so a blocked account cannot receive funds either.

### Security defaults

- Passwords hashed with bcrypt (cost 10); the hash never appears in a response.
- JWT access tokens with a one-hour lifetime; admin routes use a separate key compared in constant time.
- `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`: unknown fields are rejected, so nobody can post `status: "active"` or `balance`.
- `helmet` headers, `trust proxy` for correct client IPs behind Render, and a rate limit of 10 requests per minute per IP on signup and login.
- Secrets come from the environment and are validated at boot.

## Trade-offs and what I would do next

- **Deposits are self-service.** A real wallet is funded by a payment provider webhook with signature verification and reconciliation. The deposit endpoint exists so transfers can be demonstrated; it already goes through the same ledger and idempotency path a webhook handler would use.
- **Single currency.** Wallets carry a `currency` column and transfers refuse to cross currencies, but there is no FX.
- **Admin auth is a shared key.** Enough for the assessment; in production this would be a role on an authenticated staff user with an audit log of who blocked whom.
- **Idempotency keys never expire.** Stripe keeps them for 24 hours; a scheduled cleanup would be the next step.
- **Migrations run at start-up** because Render's free plan has no pre-deploy hook. Knex's migration lock makes that safe with one instance; with several instances I would move it to a release step.
- **Pessimistic locking** was chosen over optimistic version columns because a wallet is a natural contention point and a retry loop would add complexity without adding safety here.

## Project layout

```
src/
├── auth/          signup, login, JWT guard
├── blacklist/     BlacklistProvider interface, Karma and mock implementations
├── common/        decorators (CurrentUser, IdempotencyKey), admin guard, replay header
├── config/        environment validation
├── database/      Knex module, migrations, migrate script
├── idempotency/   key claim and completion
├── transfers/     transfer endpoint and service
├── users/         profile, admin block/unblock
└── wallets/       wallet, deposits, ledger posting, history
test/              e2e specs: accounts, deposits, transfers, concurrency
```
