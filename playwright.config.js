import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

/**
 * Локально e2e гоняем против vite preview (npm run preview),
 * в CI — тоже preview на порту 5175.
 * Live production можно проверять через BASE_URL=https://ddmsngr.github.io/fleet-manager
 */
const BASE = process.env.BASE_URL || 'http://localhost:5175/fleet-manager'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,       // graph state shared через localStorage — сериально
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: 1,
  reporter: CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: process.env.BASE_URL ? undefined : {
    command: 'npm run preview -- --port 5175',
    url: BASE,
    reuseExistingServer: !CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
