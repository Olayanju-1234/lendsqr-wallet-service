import { Test } from '@nestjs/testing';
import type { Knex } from 'knex';
import { vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { KNEX } from '../database/database.constants.js';
import { IdempotencyService } from '../idempotency/idempotency.service.js';
import { UserStatus } from '../users/user.types.js';
import { UsersRepository } from '../users/users.repository.js';
import { LedgerService } from '../wallets/ledger.service.js';
import { WalletRow, WalletType } from '../wallets/wallet.types.js';
import { WalletsRepository } from '../wallets/wallets.repository.js';
import { TransfersService } from './transfers.service.js';

const SENDER_WALLET = 'aaaaaaaa-0000-4000-8000-000000000001';
const RECIPIENT_WALLET = 'bbbbbbbb-0000-4000-8000-000000000002';

const wallet = (overrides: Partial<WalletRow>): WalletRow => ({
  id: SENDER_WALLET,
  user_id: 'sender-id',
  type: WalletType.User,
  currency: 'NGN',
  balance: 10_000,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

const sender: AuthenticatedUser = {
  id: 'sender-id',
  email: 'sender@example.com',
  status: UserStatus.Active,
};

describe('TransfersService', () => {
  let service: TransfersService;
  const wallets = {
    findByUserId: vi.fn(),
    lockByIds: vi.fn(),
  };
  const users = { findById: vi.fn() };
  const ledger = { post: vi.fn() };
  const idempotency = {
    hashRequest: vi.fn().mockReturnValue('hash'),
    claim: vi.fn().mockResolvedValue(null),
    complete: vi.fn(),
  };
  // The fake transaction just runs the callback; what matters here is the order of checks, not SQL.
  const trx = {} as Knex.Transaction;
  const db = {
    transaction: vi.fn((fn: (t: Knex.Transaction) => unknown) => fn(trx)),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    idempotency.claim.mockResolvedValue(null);
    wallets.findByUserId.mockResolvedValue(wallet({}));
    wallets.lockByIds.mockResolvedValue([
      wallet({}),
      wallet({ id: RECIPIENT_WALLET, user_id: 'recipient-id', balance: 0 }),
    ]);
    users.findById.mockResolvedValue({
      id: 'recipient-id',
      status: UserStatus.Active,
    });
    ledger.post.mockResolvedValue({
      transaction: { id: 'tx-1', created_at: new Date() },
      debitBalanceAfter: 9_000,
      creditBalanceAfter: 1_000,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        TransfersService,
        { provide: KNEX, useValue: db },
        { provide: WalletsRepository, useValue: wallets },
        { provide: UsersRepository, useValue: users },
        { provide: LedgerService, useValue: ledger },
        { provide: IdempotencyService, useValue: idempotency },
      ],
    }).compile();
    service = moduleRef.get(TransfersService);
  });

  const transfer = (amount = 1_000) =>
    service.transfer(
      sender,
      { recipientWalletId: RECIPIENT_WALLET, amount },
      'key-12345678',
    );

  it('posts a transfer and stores the response under the idempotency key', async () => {
    const result = await transfer();

    expect(result.replayed).toBe(false);
    expect(result.body).toMatchObject({
      transactionId: 'tx-1',
      senderWalletId: SENDER_WALLET,
      recipientWalletId: RECIPIENT_WALLET,
      amount: 1_000,
      balanceAfter: 9_000,
    });
    expect(wallets.lockByIds).toHaveBeenCalledWith(trx, [
      SENDER_WALLET,
      RECIPIENT_WALLET,
    ]);
    expect(idempotency.complete).toHaveBeenCalledWith(
      trx,
      'sender-id',
      'key-12345678',
      result.body,
    );
  });

  it('returns the stored response on replay without touching the ledger', async () => {
    const stored = { transactionId: 'tx-old' };
    idempotency.claim.mockResolvedValue(stored);

    const result = await transfer();

    expect(result).toEqual({ replayed: true, body: stored });
    expect(wallets.lockByIds).not.toHaveBeenCalled();
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('rejects a blocked sender before opening a transaction', async () => {
    await expect(
      service.transfer(
        { ...sender, status: UserStatus.Blocked },
        { recipientWalletId: RECIPIENT_WALLET, amount: 1 },
        'key-12345678',
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects a transfer to the sender’s own wallet', async () => {
    await expect(
      service.transfer(
        sender,
        { recipientWalletId: SENDER_WALLET, amount: 1 },
        'key-12345678',
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('returns 404 when the recipient wallet is missing or not a user wallet', async () => {
    wallets.lockByIds.mockResolvedValue([wallet({})]);
    await expect(transfer()).rejects.toMatchObject({ status: 404 });

    wallets.lockByIds.mockResolvedValue([
      wallet({}),
      wallet({ id: RECIPIENT_WALLET, user_id: null, type: WalletType.Funding }),
    ]);
    await expect(transfer()).rejects.toMatchObject({ status: 404 });
  });

  it('rejects a blocked recipient', async () => {
    users.findById.mockResolvedValue({
      id: 'recipient-id',
      status: UserStatus.Blocked,
    });
    await expect(transfer()).rejects.toMatchObject({ status: 403 });
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('checks the balance on the locked row, not the first read', async () => {
    // The first read shows 10,000 but by the time the lock is taken another transfer has spent it.
    wallets.findByUserId.mockResolvedValue(wallet({ balance: 10_000 }));
    wallets.lockByIds.mockResolvedValue([
      wallet({ balance: 500 }),
      wallet({ id: RECIPIENT_WALLET, user_id: 'recipient-id', balance: 0 }),
    ]);

    await expect(transfer(1_000)).rejects.toMatchObject({ status: 422 });
    expect(ledger.post).not.toHaveBeenCalled();
    expect(idempotency.complete).not.toHaveBeenCalled();
  });

  it('allows a transfer of the exact balance', async () => {
    await expect(transfer(10_000)).resolves.toMatchObject({ replayed: false });
  });
});
