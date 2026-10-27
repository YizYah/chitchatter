# Chitchatter

Chitchatter is a serverless, peer-to-peer (WebRTC) chat web app built with
React 18, TypeScript, and Vite. It uses Trystero for P2P signaling, MUI for
UI components, Vitest for unit tests, and Playwright for end-to-end tests.

## Setup

Install dependencies:

    npm ci

## Verification

Type-check with `tsc` and lint with ESLint, build the Vite app (and the SDK
bundle) with the `build` script, and run unit tests with Vitest and
end-to-end tests with Playwright.

<!-- RALPH_CHECK_COMMANDS
npm run check:types
npm run lint
RALPH_CHECK_COMMANDS_END -->

<!-- RALPH_BUILD_COMMANDS
npm run build
RALPH_BUILD_COMMANDS_END -->

<!-- RALPH_REGRESSION_COMMANDS
npm test
npx playwright test
RALPH_REGRESSION_COMMANDS_END -->
