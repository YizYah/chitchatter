# Surface core ChatRoom errors to the user for user-initiated actions

## Plan Summary

- **What / why:** `ChatRoom` reports operation failures on `ChatRoomEvent.ERROR` instead of throwing, but nothing in the web layer subscribes, so every failure is invisible to the user (issue #618). Subscribe to the event where `ShellContext.showAlert` is already in scope and raise an alert for the operations the user actually initiated.
- **Key decision:** Alert only for `SEND_MESSAGE`, `SEND_INLINE_MEDIA`, and `RESCIND_FILE_OFFER`. The remaining six contexts (`ANNOUNCE_SELF`, `GREET_PEER`, `REFRESH_CONNECTION_TYPES`, `SEND_TYPING_STATUS`, `STOP_SEEDING`, `LEAVE`) stay logger-only — they are background, ephemeral, or teardown paths where a snackbar would be noise.
- **How:** An exhaustive `switch` over `ChatRoomErrorContext` inside the existing `useChatRoomNotifications` effect, so adding a future enum member without a decision fails the TypeScript build.
- **Most important files:** `src/components/Room/useChatRoomNotifications.ts` (new subscription) and `src/components/Room/useChatRoomNotifications.test.tsx` (regression test).
- **Priority / complexity:** High value (restores user-visible feedback for failed sends), low complexity — one hook edit plus tests, no new dependencies.

## Problem Statement

`ChatRoom` deliberately does not throw out of operations a caller cannot act on — a failed broadcast, a rescind that cannot be announced, a half-succeeding teardown, a connection-type refresh that fails. Instead it funnels them through a single private `reportError` (`src/core/chat/ChatRoom.ts:992-997`), which logs via the injected logger adapter and emits `ChatRoomEvent.ERROR` with a payload of `{ error: Error; context: ChatRoomErrorContext }` (`src/core/chat/events.ts:95`).

Nine reporting sites feed that one emit site, covering message sends, inline-media sends, typing status, peer greeting, self-announcement, file-offer rescinds, connection-type refresh, seeding teardown, and room departure. **Nothing in the web app subscribes to `ChatRoomEvent.ERROR`.** The only consumers today are the injected logger (a `console.error`) and `scripts/tui-spike.ts`. So every one of those failures is silent to the person using the app: a message that fails to send clears the input and appears in the local transcript, and nothing tells the sender it never left the machine.

The remedy is to subscribe in the web layer and map the payload's `context` to a short, user-facing message for the operations that warrant one, staying deliberately silent on the rest.

#### Planning Context

**Key requirements**

- Subscribe to `ChatRoomEvent.ERROR` in the web layer, wherever `ShellContext.showAlert` is already in scope.
- `switch` on the payload's `context` (a `ChatRoomErrorContext` enum) rather than matching error prose.
- Raise a user-visible alert only for user-initiated operations; stay silent on background/ephemeral/teardown operations.
- Add a regression test asserting the alert, because the failure mode is silence that no existing test would catch.

**Decisions made (with rationale)**

- **Home of the subscription — `src/components/Room/useChatRoomNotifications.ts`.** This hook already owns the "what should the user see or hear about this event" responsibility, already maps `ChatRoom` events to `showAlert` (e.g. `PEER_JOIN` → alert at lines 102-106), already holds `showAlert` in a `latest` ref (lines 41-57) and already returns unsubscribers from its effect (lines 129-131). Adding one more `chatRoom.on(...)` here is the smallest change that fits the existing pattern exactly, rather than introducing a new hook or component.
- **Which contexts alert — `SEND_MESSAGE`, `SEND_INLINE_MEDIA`, `RESCIND_FILE_OFFER` only.** These are the three failures of actions the user just took on purpose and would reasonably expect feedback on. The issue itself pre-decides `STOP_SEEDING` and `LEAVE` as silent teardown paths the user has already walked away from. `ANNOUNCE_SELF`, `GREET_PEER` and `REFRESH_CONNECTION_TYPES` are automatic/background protocol housekeeping the user never triggered and cannot act on; `SEND_TYPING_STATUS` is high-frequency ephemeral chatter whose failure is inconsequential. Alerting on any of these would be noise, not signal. All six stay logger-only.
- **Exhaustive `switch`.** Every `ChatRoomErrorContext` member is handled explicitly — the three alerting cases plus the six silent cases grouped into a no-op (`break`) — with a `default` that performs an `assertNever`-style exhaustiveness check. This makes adding a new enum member without a deliberate show/suppress decision a compile error, matching the issue's recommendation and the reason the context was modelled as an enum in the first place (`src/core/chat/events.ts:42-54`).
- **Severity `'error'`.** Consistent with the repo's existing failure alerts: `'success'` for joins, `'warning'` for leaves, `'error'` for failures (`useChatRoomNotifications.ts:104,114`; `src/components/Download/PeerDownloadFileButton.tsx:54`).
- **No `isDirectMessageRoom` guard on the error listener.** `PEER_LEAVE` needs that guard because the registry rebroadcasts membership to every open DM room (`ChatRoomRegistry.ts:51`), causing one alert per open conversation. `ERROR` is emitted once by the specific room instance whose operation failed (`ChatRoom.ts:996`), so it does not double-fire; a send failure inside a DM room should still alert. The new listener therefore sits outside the `isDirectMessageRoom` conditional block (lines 99-126) and alongside the unconditional `MESSAGE_RECEIVED` listener.
- **Plain English string literals.** No i18n layer exists; existing alerts are literals (e.g. `'Someone has joined the room'` at line 103, `'The file could not be shared'` in `useRoomFileShare.test.tsx:119`). The new copy follows suit.

**Out of scope**

- Changing `ChatRoom`, `reportError`, the `ChatRoomEvent.ERROR` payload, or the `ChatRoomErrorContext` enum. The core already emits everything needed.
- Alerting on the six background/ephemeral/teardown contexts.
- Any new file outside the fix — in particular **no `.hublaunch/goals.md`** (explicitly declined); this PR goes to the upstream maintainer and must contain only the change for #618.
- CI workflows, release config, licence, funding, or security files (forbidden by the repository working rules).
- Refactors, renames, formatting sweeps, or drive-by fixes.
- New dependencies.

## Detailed Requirements

**Functional**

1. When `ChatRoom` emits `ChatRoomEvent.ERROR` with `context === SEND_MESSAGE`, the user sees an error alert indicating their message could not be sent.
2. Likewise for `SEND_INLINE_MEDIA` (media/inline send failed) and `RESCIND_FILE_OFFER` (un-sharing a file failed).
3. For `ANNOUNCE_SELF`, `GREET_PEER`, `REFRESH_CONNECTION_TYPES`, `SEND_TYPING_STATUS`, `STOP_SEEDING`, and `LEAVE`, no alert is shown (logger behaviour is unchanged — it already fires inside `reportError`).

**Technical**

4. The subscription lives in `useChatRoomNotifications.ts`, added to the `unsubscribers` array in the existing effect and torn down by the existing cleanup loop (lines 129-131).
5. The handler reads `showAlert` from `latest.current` (not the closed-over value), matching the surrounding listeners (e.g. line 103) so that focus/settings changes do not resubscribe.
6. The `switch` is exhaustive over `ChatRoomErrorContext`; the `default` branch is statically unreachable and enforced with a `never`-typed assignment so a new enum member breaks the build.

**Non-Functional**

7. Smallest viable change; existing conventions (TypeScript, ESLint/Prettier config, Vitest + `@testing-library/react`) followed exactly.
8. No new dependencies.
9. One logical commit in the repo's conventional-commit style, e.g. `fix: surface core errors to the user for user-initiated actions`.
10. Branch from `develop`; PR targets `develop`.

## Proposed Solution

Add a single `chatRoom.on(ChatRoomEvent.ERROR, …)` listener to the existing effect in `useChatRoomNotifications.ts`, placed outside the `isDirectMessageRoom` conditional (so it is always active). The handler switches on `context` and calls `latest.current.showAlert(message, { severity: 'error' })` for the three user-initiated contexts, does nothing for the six silent contexts, and ends with an exhaustiveness guard.

```ts
chatRoom.on(ChatRoomEvent.ERROR, ({ context }) => {
  const { showAlert } = latest.current

  switch (context) {
    case ChatRoomErrorContext.SEND_MESSAGE:
      showAlert('Your message could not be sent', { severity: 'error' })
      break
    case ChatRoomErrorContext.SEND_INLINE_MEDIA:
      showAlert('Your media could not be sent', { severity: 'error' })
      break
    case ChatRoomErrorContext.RESCIND_FILE_OFFER:
      showAlert('The file could not be unshared', { severity: 'error' })
      break
    // Background, ephemeral and teardown paths: logged, not surfaced.
    case ChatRoomErrorContext.ANNOUNCE_SELF:
    case ChatRoomErrorContext.GREET_PEER:
    case ChatRoomErrorContext.REFRESH_CONNECTION_TYPES:
    case ChatRoomErrorContext.SEND_TYPING_STATUS:
    case ChatRoomErrorContext.STOP_SEEDING:
    case ChatRoomErrorContext.LEAVE:
      break
    default: {
      // Exhaustiveness guard: a new ChatRoomErrorContext must make a
      // deliberate show/suppress decision here, or this fails to compile.
      const unhandled: never = context
      void unhandled
    }
  }
})
```

The `ChatRoomErrorContext` import is added to the existing `import { ChatRoomEvent } from 'core/chat/events'` line (`useChatRoomNotifications.ts:5`).

<details><summary><b>Implementation Detail</b></summary>

### Implementation Steps

**Phase 1 — Add the subscription (`src/components/Room/useChatRoomNotifications.ts`)**

1. Extend the import on line 5 to `import { ChatRoomEvent, ChatRoomErrorContext } from 'core/chat/events'`.
2. Inside the effect's `unsubscribers` array (begins line 66), add the `chatRoom.on(ChatRoomEvent.ERROR, …)` listener shown above. Place it **outside** the `isDirectMessageRoom` spread block (lines 99-126) — e.g. immediately after the `MESSAGE_RECEIVED` listener that ends on line 93 — so the error listener is registered in every room, DM or group. Read `showAlert` from `latest.current` (lines 50-57 keep it fresh), matching the existing listeners.
3. No change to the dependency array (line 132), the cleanup loop (lines 129-131), or the returned `{ unreadMessages }` (line 134).

**Phase 2 — Regression tests (`src/components/Room/useChatRoomNotifications.test.tsx`)**

Reuse the existing harness: `createRoom` (lines 24-35) builds a real `ChatRoom`, `renderNotifications` (lines 37-70) mounts the hook with a `showAlert` spy via a `ShellContext.Provider`.

4. **Positive test — a failed send alerts.** The cleanest way to drive a real `SEND_MESSAGE` error is to break only the MESSAGE sender on the transport, exactly as `ChatRoom.test.ts:1232-1283` does: wrap `transport.makeAction` so that for `PeerAction.MESSAGE` the send function throws (`throw new Error('transport is gone')`), leaving every other action intact. Because `createRoom` constructs its transport internally, add a small, local sibling helper in this test file (e.g. `createRoomWithFailingSend()`) that builds the same `ChatRoom` config as `createRoom` but with the patched `InMemoryTransport`, or parameterise `createRoom` to accept an optional pre-built transport. Then:
   - `await chatRoom.join()`
   - mount via `renderNotifications(chatRoom, false)`
   - `await act(async () => { await chatRoom.sendMessage('nope') })`
   - assert `showAlert` was called once with `expect.stringContaining('could not be sent')` and `{ severity: 'error' }`.
   This mirrors the assertion style of the existing `PEER_LEAVE` test (lines 81-85).
5. **Negative test — a background failure stays silent.** `refreshConnectionTypes` is public (`ChatRoom.ts:563-572`) and reports `REFRESH_CONNECTION_TYPES` when `transport.getPeerConnectionTypes()` rejects. In the test, stub that method on the room's transport to reject (`vi.spyOn(transport, 'getPeerConnectionTypes').mockRejectedValue(new Error('boom'))` on a room built with an accessible transport), mount the hook, `await act(async () => { await chatRoom.refreshConnectionTypes() })`, and assert `expect(showAlert).not.toHaveBeenCalled()`. This proves the silent contexts are suppressed, not merely unencountered.
6. Keep both tests in the existing `describe('useChatRoomNotifications', …)` block, following the naming and `async/act` style already used (lines 72-102).

### Edge Cases

- **DM-room send failure still alerts.** Because the error listener is outside the `isDirectMessageRoom` guard and `ERROR` is emitted once by the originating room instance, a failed send in a direct-message conversation surfaces exactly one alert — the desired behaviour.
- **Rapid repeated failures.** Each failed operation emits one `ERROR`, producing one `showAlert` call each. This matches the existing snackbar behaviour (e.g. one alert per `PEER_JOIN`); no debouncing is introduced or required.
- **Unmount mid-flight.** The listener is torn down by the existing cleanup loop (lines 129-131); an error emitted after unmount has no subscriber, same as every other listener in this hook.
- **New enum member added later.** The `default` branch's `const unhandled: never = context` fails to compile until the author adds the new context to either the alerting or the silent group — the intended safety net.

### Accessibility & UX

- Error alerts use MUI `severity: 'error'`, rendered by the shell's existing snackbar/alert plumbing (`AlertOptions = Pick<AlertProps, 'severity'>`, `src/models/shell.ts`); no new UI surface is added.
- Copy is short, plain, and user-facing, matching the house style ("Your message could not be sent").

### Performance

- One additional event listener per mounted room; negligible. No new renders, no new state, no polling.

### Observability

- Logger behaviour is unchanged: `reportError` still logs every context via the injected logger adapter before emitting (`ChatRoom.ts:995`). The new code only adds user-facing presentation on top.

### Rollout / Migration

- Pure additive front-end change; no migration, no flags, no config. Ships with the PR.

### Dependencies & Related Work

- Depends only on existing symbols: `ChatRoomEvent.ERROR`, `ChatRoomErrorContext` (`src/core/chat/events.ts`), `ShellContext.showAlert` (`src/contexts/ShellContext.ts:33`), and the `AlertOptions` severity type (`src/models/shell.ts`).
- Related: `src/core/adapters/types.ts:16-18` documents that the logger adapter exists so a host without a `useChatRoomNotifications` can still see errors — confirming that wording user-facing alerts is explicitly the web layer's job, which is what this change does.

</details>

## Technical Considerations

- **Dependencies:** none added. Reuses `showAlert` and the existing enum.
- **Config / build:** no config changes. The exhaustive `switch` relies on the project's existing strict TypeScript settings to enforce the `never` guard.
- **Security:** alert copy is static and contains no error-message interpolation, so no untrusted error text reaches the DOM; nothing sensitive is surfaced.
- **Repo rules:** no edits to CI, release, licence, funding, or security files. Branch from `develop`, PR to `develop`, one logical commit.

## Testing Strategy

- **Unit / hook (primary):** the two tests in Phase 2 above, in `src/components/Room/useChatRoomNotifications.test.tsx`, using the existing real-room + `showAlert`-spy harness. One asserts a user-initiated failure alerts with `severity: 'error'`; one asserts a background failure (`REFRESH_CONNECTION_TYPES`) does not alert.
- **Integration:** covered implicitly — the tests drive real `ChatRoom` operations (`sendMessage`, `refreshConnectionTypes`) through the live event pipeline rather than emitting the event by hand, so they exercise the actual emit path in `reportError`.
- **Full suite:** run the project's test command (Vitest) and lint/format checks; make the existing suite pass. If any suite step needs secrets or services the sandbox lacks, note it in the PR body rather than weakening the tests.
- **Manual (reviewer, optional):** in a running room, force a send failure (e.g. offline) and confirm a single error snackbar appears; confirm no snackbar appears for background/teardown failures.

## Documentation Updates

- None required. There is no user-facing docs surface for in-app snackbars, and the behaviour change is self-describing. The PR description should state which contexts alert and which stay silent, and why (teardown/background/ephemeral), and note how the suite was run.

## Acceptance Criteria

1. `useChatRoomNotifications` subscribes to `ChatRoomEvent.ERROR` and unsubscribes on cleanup alongside its other listeners.
2. A `SEND_MESSAGE` error results in exactly one `showAlert(<message about the message not being sent>, { severity: 'error' })`.
3. `SEND_INLINE_MEDIA` and `RESCIND_FILE_OFFER` each produce one `severity: 'error'` alert with appropriate copy.
4. `ANNOUNCE_SELF`, `GREET_PEER`, `REFRESH_CONNECTION_TYPES`, `SEND_TYPING_STATUS`, `STOP_SEEDING`, and `LEAVE` errors produce **no** alert.
5. The `switch` is exhaustive; removing the handling of any `ChatRoomErrorContext` member (or adding a new member) fails the TypeScript build.
6. A regression test asserts the alert for a user-initiated failure, and a test asserts silence for a background failure; both pass.
7. No new dependencies; no files added or changed outside `useChatRoomNotifications.ts` and its test; no CI/release/licence/security files touched.
8. The existing test suite passes.

## Assumptions

- The subscription is added inside `useChatRoomNotifications.ts` (where `showAlert` is already in scope), not a new hook or component.
- Alerting contexts are exactly `SEND_MESSAGE`, `SEND_INLINE_MEDIA`, `RESCIND_FILE_OFFER`; the other six stay logger-only (per the user's Q1 answer, option A).
- Alerts use `severity: 'error'`, consistent with existing failure alerts.
- Alert copy is short, user-facing English literals matching the existing style, with no i18n indirection. Exact wording ("Your message could not be sent", "Your media could not be sent", "The file could not be unshared") may be adjusted by the implementer to match reviewer preference, as long as it is plain and user-facing.
- No `isDirectMessageRoom` guard is applied to the error listener (errors are per-operation, not broadcast), so send failures inside a DM room still alert.
- The `switch` is exhaustive over `ChatRoomErrorContext`, with a `never`-typed `default` so a future context without a decision fails the build.
- The regression test extends `useChatRoomNotifications.test.tsx` using the existing real-room + `showAlert`-spy harness: the positive case drives `SEND_MESSAGE` by breaking the MESSAGE transport action (mirroring `ChatRoom.test.ts:1232-1283`), and the negative case drives `REFRESH_CONNECTION_TYPES` by stubbing `transport.getPeerConnectionTypes` to reject. Driving errors through real operations (rather than emitting the event directly) is preferred because `ChatRoom`'s `emit` is private and the real path is what the regression must protect.
- No `.hublaunch/goals.md` or any other out-of-scope file is created (per the user's Q2 answer, option C).
- Branch from `develop`; PR targets `develop`; one logical change; commit in the repo's conventional-commit style (e.g. `fix: …`).

## Repo Snapshot Note

Planned against `develop` at commit `16ee2f7f08f3ca9dbf28d88bcef6252c8803c80a`. All referenced paths and line numbers were re-verified against the current checkout and match: `src/core/chat/events.ts` (ERROR at line 39, enum at 55-65, payload at 95), `src/core/chat/ChatRoom.ts` (`reportError` at 992-997, `refreshConnectionTypes` at 563-572), `src/components/Room/useChatRoomNotifications.ts` (effect and listeners at 59-132), and `src/components/Room/useChatRoomNotifications.test.tsx` (harness at 24-70). No drift found.
