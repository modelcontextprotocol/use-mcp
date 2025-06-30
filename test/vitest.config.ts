import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./setup/global-setup.ts'],
    globalTeardown: ['./setup/global-teardown.ts'],
    testTimeout: 60000, // 60 second timeout for integration tests
    reporters: process.env.VITEST_REPORTER === 'hanging-process' ? ['hanging-process'] : ['default'],
  },
})
