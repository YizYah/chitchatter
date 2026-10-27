# HubLaunch Lessons Learned

## Current Status

- Phase: Implementation complete and verified. Committing.
- Last action: tests/typecheck/lint/build all pass.
- Blockers: None.

## Key Discoveries

- Dependencies are NOT pre-installed in the container. Run `npm ci` first or vitest/vite fail with ERR_MODULE_NOT_FOUND.
- ESLint `@typescript-eslint/no-shadow` forbids destructuring `const { showAlert } = latest.current` inside the ERROR handler because `showAlert` already exists in the outer hook scope. Use `latest.current.showAlert(...)` directly (matches PEER_JOIN/PEER_LEAVE listeners).

## Solutions That Worked

- Added `ChatRoomEvent.ERROR` listener in useChatRoomNotifications.ts outside the isDirectMessageRoom block, exhaustive switch over ChatRoomErrorContext with a `never` default guard.
- Parameterized `createRoom(targetPeerId?, transport?)` in the test to inject a transport with a broken MESSAGE action (positive test) or a rejecting getPeerConnectionTypes spy (negative/silent test).

## Things to Avoid

- Don't destructure showAlert from latest.current (shadow lint error).

## Files Modified

- src/components/Room/useChatRoomNotifications.ts
- src/components/Room/useChatRoomNotifications.test.tsx

## Verification Results

- npm run check:types: PASS (No type errors)
- npm run lint: PASS (0 warnings)
- npm test: PASS (31 files, 333 tests)
- npm run build: PASS (app + sdk)

## Playwright e2e — CANNOT RUN in sandbox

- `npx playwright install chromium` works, but the browser crashes: chrome-headless-shell is missing system libs (libnspr4.so, libnss3.so, libX11.so.6, libatk, etc.).
- `npx playwright install-deps` requires root/apt; no sudo password available. So e2e cannot run here.
- This is environmental, not a code defect. The e2e suite covers home/room/settings UI, unrelated to the error-alert change. Note in PR body.

## Next Steps

- Done. Committed. Change fully covered by Vitest unit tests.
