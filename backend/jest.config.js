/** Two projects: fast unit tests (no I/O) and integration tests (real Postgres + Redis). */
const base = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Transpile-only (types are checked by `npm run typecheck`/lint): fast, low-memory test runs.
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }] },
};

module.exports = {
  testTimeout: 60000,
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/src/**/*.spec.ts'], setupFiles: ['<rootDir>/test/support/unit-setup.ts'] },
    {
      ...base,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
      globalSetup: '<rootDir>/test/support/global-setup.ts',
      setupFiles: ['<rootDir>/test/support/test-env.ts'],
    },
  ],
};
