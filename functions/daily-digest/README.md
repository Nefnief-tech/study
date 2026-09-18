# Daily digest — Appwrite Function

A scheduled Appwrite Function that sends you push notifications every day:

| Push | Content |
| ---- | ------- |
| **Tomorrow** | Your lessons for the next day from the timetable — with **CANCELLED** and substituted lessons taken from the mirrored Eltern-portal substitute plan. Skipped on free days. |
| **Due soon** | Open homework & tasks that are **overdue** or due **today/tomorrow**, sorted by date, subject names resolved, high-priority marked with ‼️. |
| **Next 7 days** | Exams, deadlines and events in the coming week (exams first). |

Empty digests are never sent. Message IDs are deterministic per day (`dgt-classes-20260919-…`),
so re-running the function the same day never double-sends.

## How it gets your data

Everything lives in your existing `snapshots` collection — the function reads the same
documents the apps write (identical SHA-256 document IDs):

- `timetable`, `todos`, `homework`, `events`, `subjects` — synced by both apps automatically.
- `portal` — the **Vertretungsplan without credentials**, mirrored by both apps after every
  successful portal fetch (`mirrorPortal` in `src/lib/auth/sync.ts` and
  `mobile/lib/appwrite/sync.dart`). Your portal login data never leaves your devices.
  If no plan was mirrored, the classes push simply omits cancellation info and says so.

## Deploy

```bash
appwrite login
cd /media/games/study-2026          # repo root with appwrite.config.json
appwrite push functions             # creates the function, cron schedule + scoped API key
```

`appwrite.config.json` defines:

- **runtime** `node-22` · **entrypoint** `src/main.js` · no dependencies (plain `fetch`)
- **schedule** `30 15 * * *` (UTC) = **17:30 CEST** in summer, 16:30 CET in winter —
  edit the cron in `appwrite.config.json` and re-push to change it
- **scopes** `documents.read` + `messages.write` — declared in appwrite.config.json, but
  Appwrite Cloud does **not** inject the key automatically, so create a standard API key with
  exactly those two scopes (console → API Keys, or `appwrite project update-key`) and add it
  as a function env variable named `APPWRITE_API_KEY` (Functions → Daily digest → Variables).

## Test it without waiting for the cron

- **Mocked** (no Appwrite needed) — feeds fake snapshots incl. a cancelled class and prints
  the generated pushes:

  ```bash
  node functions/daily-digest/test/mock-run.mjs
  ```

- **Real** — open the function in the Appwrite console → **Execute** (any payload), or:

  ```bash
  appwrite functions createExecution --function-id daily-digest
  ```

  Executions are idempotent per day, so testing never spams duplicate pushes.

## Prerequisites for delivery

1. Push set up on the device — see `mobile/PUSH_SETUP.md` (Firebase + FCM provider in the
   Appwrite console).
2. You are signed in on at least one device, so the snapshots exist in Appwrite.
3. The Vertretungsplan is mirrored: open the Timetable page once while signed in
   (auto-fetch mirrors it) — otherwise cancellations can't be respected.
