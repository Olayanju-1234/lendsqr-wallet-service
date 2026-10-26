import { IdempotencyService } from './idempotency.service.js';

describe('IdempotencyService.hashRequest', () => {
  const service = new IdempotencyService();

  it('is stable for the same request and differs for a different one', () => {
    const a = service.hashRequest(['transfer', 'wallet-b', 1_000, null]);
    const b = service.hashRequest(['transfer', 'wallet-b', 1_000, null]);
    const c = service.hashRequest(['transfer', 'wallet-b', 2_000, null]);

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('distinguishes the operation, so a deposit and a transfer of the same amount differ', () => {
    expect(service.hashRequest(['deposit', 1_000])).not.toBe(
      service.hashRequest(['transfer', 1_000]),
    );
  });
});
