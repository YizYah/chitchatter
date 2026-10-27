import { defineConfig, devices } from '@playwright/test'
import fs from 'fs'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/* Some containerized/sandboxed CI hosts are missing system shared libraries
 * (e.g. libnspr4.so) and a fontconfig file that headless Chromium needs to launch,
 * causing every test to fail with "Target page, context or browser has been closed"
 * before a browser is even up. If this host has a pre-staged copy of those libs
 * available, wire them in. This is a no-op on hosts where these paths don't exist
 * (i.e. normal CI/dev machines with proper system libs already installed). */
const sandboxLibDirs = [
  '/tmp/localroot/usr/lib/x86_64-linux-gnu',
  '/tmp/localroot/lib/x86_64-linux-gnu',
].filter(dir => fs.existsSync(dir))
if (sandboxLibDirs.length > 0) {
  process.env.LD_LIBRARY_PATH = [...sandboxLibDirs, process.env.LD_LIBRARY_PATH]
    .filter(Boolean)
    .join(':')
}
const sandboxFontConfigFile = '/tmp/fcconfig/fonts.conf'
if (fs.existsSync(sandboxFontConfigFile)) {
  process.env.FONTCONFIG_FILE = sandboxFontConfigFile
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  /* Global timeout for each test */
  timeout: 30 * 1000,
  /* Default timeout for `expect(...)` assertions. Bumped from the 5s default since the
     dev server (Vite, unbundled) can be slow to cold-compile the first few modules it
     serves under CPU-constrained CI/sandbox environments. */
  expect: {
    timeout: 15 * 1000,
  },
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: 2,
  /* Opt out of parallel tests on CI. Cap local/non-CI runs to 2 workers instead of
     the CPU-count-based default: each worker spins up its own dev-server requests and
     Chromium instance, and under CPU-constrained CI/sandbox environments too much
     concurrency causes the dev server's cold compile + WebRTC crypto init to blow
     through test timeouts, producing flaky failures unrelated to the app itself. */
  workers: process.env.CI ? 1 : 2,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report' }]]
    : 'list',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',

    /* Service workers are blocked from registering or running to prevent test caching issues */
    serviceWorkers: 'block',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer
     * Options: 'on-first-retry' | 'on-all-retries' | 'off' | 'on' | 'retain-on-failure' */
    trace: 'on-first-retry',

    /* Screenshot on failure
     * Options: 'off' | 'only-on-failure' | 'on' */
    screenshot: 'only-on-failure',

    /* Video recording settings
     * Options:
     * - 'off': No videos
     * - 'on': Record videos for all tests (large file sizes)
     * - 'retain-on-failure': Record videos but only keep them for failed tests (current setting)
     * - 'on-first-retry': Only record videos when a test fails the first time and gets retried */
    video: 'retain-on-failure',

    /* Headless mode for CI */
    headless: true,

    /* Action timeout */
    actionTimeout: 15 * 1000,

    /* Navigation timeout */
    navigationTimeout: 20 * 1000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /* Disable mDNS local IP hiding so WebRTC connections between local browser contexts
           can establish successfully in sandboxed/offline E2E environments without relying on system DNS.
           Also disable /dev/shm usage since containers often mount it too small, which otherwise
           crashes the renderer (surfaces as "Target page, context or browser has been closed"). */
        launchOptions: {
          args: [
            '--disable-features=WebRtcHideLocalIpsWithMdns',
            '--disable-dev-shm-usage',
          ],
        },
      },
    },

    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    //
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
    //
    // /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run start:e2e',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      IS_E2E_TEST: 'true',
    },
  },
})
