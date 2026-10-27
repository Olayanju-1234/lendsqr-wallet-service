import type { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { KarmaBlacklistProvider } from './karma-blacklist.provider.js';

const config = {
  get: (key: string) =>
    key === 'ADJUTOR_BASE_URL' ? 'https://adjutor.example.com/v2' : 'test-key',
} as unknown as ConfigService<EnvironmentVariables, true>;

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status });

describe('KarmaBlacklistProvider', () => {
  const provider = new KarmaBlacklistProvider(config);
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('calls the Karma lookup with the bearer key and an encoded identity', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { status: 'error' }));

    await provider.isBlacklisted('+2348012345678');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://adjutor.example.com/v2/verification/karma/%2B2348012345678',
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-key',
    );
  });

  it('treats a live record as a hit', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        status: 'success',
        data: { karma_identity: 'fraud@example.com' },
      }),
    );
    await expect(provider.isBlacklisted('fraud@example.com')).resolves.toBe(
      true,
    );
  });

  it('treats 404 as not blacklisted', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { status: 'error' }));
    await expect(provider.isBlacklisted('clean@example.com')).resolves.toBe(
      false,
    );
  });

  it('ignores the fixed sample record an app in test mode returns for everyone', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        status: 'success',
        'mock-response': 'This is a mock response as your app is in test mode',
        data: { karma_identity: '0zspgifzbo.ga' },
      }),
    );
    await expect(provider.isBlacklisted('clean@example.com')).resolves.toBe(
      false,
    );
  });

  it('still honours a test-mode record that is for the queried identity', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        status: 'success',
        'mock-response': 'This is a mock response as your app is in test mode',
        data: { karma_identity: '0zspgifzbo.ga' },
      }),
    );
    await expect(provider.isBlacklisted('0ZSPGIFZBO.GA')).resolves.toBe(true);
  });

  it('fails closed with 503 when Karma errors or times out', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, {}));
    await expect(provider.isBlacklisted('x@example.com')).rejects.toMatchObject(
      { status: 503 },
    );

    fetchMock.mockRejectedValue(new Error('The operation was aborted'));
    await expect(provider.isBlacklisted('x@example.com')).rejects.toMatchObject(
      { status: 503 },
    );
  });
});
