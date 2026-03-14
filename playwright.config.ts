import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, 'e2e', '.env') })

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3069'
const isStaging = !!process.env.E2E_BASE_URL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  projects: [
    // --- Setup projects: authenticate once per role ---
    {
      name: 'setup:client',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'setup:curator',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'setup:admin',
      testMatch: /auth\.setup\.ts/,
    },

    // --- Test projects with pre-authenticated sessions ---
    {
      name: 'client-tests',
      dependencies: ['setup:client'],
      use: { storageState: 'e2e/.auth/client.json' },
      testMatch: [
        'tests/dashboard.spec.ts',
        'tests/food-tracker.spec.ts',
        'tests/water-tracking.spec.ts',
        'tests/weight-logging.spec.ts',
        'tests/steps-logging.spec.ts',
        'tests/food-entry.spec.ts',
        'tests/navigation.spec.ts',
        'tests/profile.spec.ts',
        'tests/settings-profile.spec.ts',
        'tests/settings-body.spec.ts',
        'tests/settings-notifications.spec.ts',
        'tests/settings-social.spec.ts',
        'tests/notifications.spec.ts',
        'tests/food-edit-delete.spec.ts',
        'tests/chat-client.spec.ts',
      ],
    },
    {
      name: 'curator-tests',
      dependencies: ['setup:curator'],
      use: { storageState: 'e2e/.auth/curator.json' },
      testMatch: [
        'tests/curator-hub.spec.ts',
        'tests/curator-navigation.spec.ts',
        'tests/curator-client-detail.spec.ts',
        'tests/chat-curator.spec.ts',
      ],
    },
    {
      name: 'admin-tests',
      dependencies: ['setup:admin'],
      use: { storageState: 'e2e/.auth/admin.json' },
      testMatch: ['tests/admin-panel.spec.ts', 'tests/admin-navigation.spec.ts'],
    },

    // --- Auth tests: no pre-authenticated session ---
    {
      name: 'auth-tests',
      testMatch: ['tests/auth.spec.ts', 'tests/role-access.spec.ts'],
    },
  ],

  // Only start local server if not targeting staging
  ...(!isStaging
    ? {
        webServer: {
          command: 'npm run build && npm run start',
          url: 'http://localhost:3069',
          reuseExistingServer: !process.env.CI,
        },
      }
    : {}),
})
