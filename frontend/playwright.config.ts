import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// Two ways to run (INT-4.1):
//   npm run test:e2e        the screens on the in-browser mock (project "chromium")
//   npm run test:e2e:real   the same app against a throw-away real backend (project "real")
const real = process.env.E2E_REAL === '1'
// The single app (INT-5.1): the backend serves the built frontend, so there is no dev server and one origin.
const single = real && process.env.E2E_SINGLE === '1'
const dir = process.env.LEGALLENS_E2E_DIR ?? join(tmpdir(), 'legallens-e2e')
process.env.LEGALLENS_E2E_DIR = dir
const baseURL = single
  ? 'http://127.0.0.1:8100'
  : real
    ? 'http://localhost:5175'
    : 'http://localhost:5174'
process.env.E2E_BASE_URL = baseURL

export default defineConfig({
  testDir: real ? './e2e-real' : './e2e',
  fullyParallel: !real,
  workers: real ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    // Its own port, so a dev server running against the backend on 5173 never answers the tests.
    baseURL,
    trace: 'on-first-retry',
    // Accessibility scans must see finished frames, not text mid-fade; the app honours reduced motion.
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: real ? 'real' : 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  timeout: real ? (process.env.LEGALLENS_ORCHESTRATOR !== 'stub' ? 600_000 : 90_000) : 30_000,
  webServer: real
    ? [
        {
          command: 'node e2e-real/backend.mjs',
          url: 'http://127.0.0.1:8100/api/v1/health',
          timeout: 120_000,
          // Playwright's default is SIGKILL, which would leave the server running.
          gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
          reuseExistingServer: !!process.env.E2E_REUSE,
        },
        ...(single
          ? []
          : [
              {
                command: 'npm run dev -- --port 5175',
                url: 'http://localhost:5175',
                env: { VITE_API: 'http', API_TARGET: 'http://127.0.0.1:8100' },
                reuseExistingServer: !!process.env.E2E_REUSE,
              },
            ]),
      ]
    : {
        command: 'npm run dev -- --port 5174',
        url: 'http://localhost:5174',
        env: { VITE_API: 'mock' },
        reuseExistingServer: !process.env.CI,
      },
})
