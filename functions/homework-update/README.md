# Homework update pushes

Scheduled Appwrite Function that sends one homework-only push per user at
**15:00 and 20:00** Austria time (`0 13,18 * * *` UTC; an hour earlier in
winter — Cloud rejects timezone suffixes).

Content per run: **overdue** homework, due **today**, due **tomorrow**, and
homework **added today** (that isn't already listed). Nothing open → no push.

Message ids are `hw-<slot>-<date>-<hash>` per user/slot/day — re-runs on the
same day never double-send. Slots: afternoon (15:00), evening (20:00).

## Setup (same as daily-digest)

1. `appwrite push function --function-id homework-update`
2. Create a standard API key with `documents.read` + `messages.write`
   (console → API Keys — Cloud does NOT inject config scopes) and add it as
   the function env variable `APPWRITE_API_KEY`.

## Testing

Set the env var **`HW_TEST_USER`** to a user id (Functions → Homework update
→ Variables). While it is set, **every run — manual Execute AND the
schedule —** sends a fresh `[TEST] Homework: …` push to exactly that user:
unique id (no idempotent skip), delivered even when nothing is open
("Nothing open — all homework done 🎉"). Press Execute as often as you like.

There is no scheduled-vs-manual signal on Appwrite Cloud, so the `[TEST]`
title prefix is your indicator that test mode is on. **Remove the variable
to go live** (then scheduled runs push real summaries to all users, and
same-slot re-executes report `already-sent`).

Local, offline: `APPWRITE_API_KEY=mock node test/mock-run.mjs` runs the
builders against fake rows and prints the generated pushes.

Remove `HW_TEST_USER` when you're done testing.
