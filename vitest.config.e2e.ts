import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // Every file shares one test database, so files run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgres://wallet:wallet@localhost:5433/wallet_test',
      JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret',
      ADMIN_API_KEY: 'e2e-admin-key-0000',
      BLACKLIST_PROVIDER: 'mock',
      MOCK_BLACKLIST: 'blacklisted@example.com,+2348000000000',
    },
  },
});
