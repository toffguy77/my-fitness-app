import { defineConfig, devices } from '@playwright/test'

import type { SessionOptions } from './e2e/fixtures/session'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, 'e2e', '.env') })

// The suite talks to the routing proxy, not to Next directly.
//
// In production Traefik sends /api/v1 straight to the API; locally Next used to
// proxy it through its `rewrites`, and a Next rewrite does not forward
// Set-Cookie. With the session in a cookie that difference is the difference
// between a suite that tests the product and one that tests a fiction.
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3070'
const isStaging = !!process.env.E2E_BASE_URL

export default defineConfig<SessionOptions>({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Two workers in CI: the runner has two cores, and a single worker made the
  // suite long enough to be cancelled by the job timeout.
  workers: process.env.CI ? 2 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    // Kept for the attempt that failed, not only for its retries: a retry of a
    // stateful test often fails for a second reason, and its trace explains
    // that one instead of the original.
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  projects: [
    // Each test signs in for itself, through the API, in the session fixture.
    //
    // There used to be a setup project per role that logged in once and saved
    // `storageState` for the whole run. That stopped working when the session
    // moved into a cookie: the refresh token rotates on every use, and
    // replaying one frozen cookie across a hundred tests is precisely the
    // reuse the server is built to detect. It revoked the family, and every
    // test after that landed on the sign-in page.
    //
    // `role` says who a project is; e2e/fixtures/session.ts does the rest.
    {
      name: 'client-tests',
      use: { role: 'client' },
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
        'tests/change-password.spec.ts',
        'tests/settings-body.spec.ts',
        'tests/settings-notifications.spec.ts',
        'tests/settings-social.spec.ts',
        'tests/notifications.spec.ts',
        'tests/food-edit-delete.spec.ts',
        'tests/chat-client.spec.ts',
        'tests/content-feed.spec.ts',
        'tests/workout-logging.spec.ts',
        'tests/food-tracker-nav.spec.ts',
        'tests/settings-apple-health.spec.ts',
      ],
    },
    {
      name: 'curator-tests',
      use: { role: 'curator' },
      testMatch: [
        'tests/curator-hub.spec.ts',
        'tests/curator-navigation.spec.ts',
        'tests/curator-client-detail.spec.ts',
        'tests/chat-curator.spec.ts',
        'tests/content-curator.spec.ts',
        'tests/curator-tasks.spec.ts',
      ],
    },
    {
      name: 'admin-tests',
      use: { role: 'admin' },
      testMatch: ['tests/admin-panel.spec.ts', 'tests/admin-navigation.spec.ts'],
    },

    // --- Auth tests: no pre-authenticated session ---
    {
      name: 'auth-tests',
      testMatch: [
        'tests/auth.spec.ts',
        'tests/role-access.spec.ts',
        'tests/landing.spec.ts',
        'tests/guest-onboarding.spec.ts',
        'tests/error-screens.spec.ts',
        'tests/forgot-password.spec.ts',
        'tests/reset-password.spec.ts',
        'tests/legal-pages.spec.ts',
      ],
    },
  ],

  // Only start local server if not targeting staging
  ...(!isStaging
    ? {
        webServer: {
          command: 'npm run build && npm run start',
          url: 'http://localhost:3069',
          // Always reuse: in CI the workflow starts the web server itself,
          // because it also has to start the API and seed test accounts before
          // the suite runs. Playwright only needs the URL to be live.
          reuseExistingServer: true,
        },
      }
    : {}),
})
