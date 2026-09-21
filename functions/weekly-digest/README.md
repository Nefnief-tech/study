# Weekly digest push

Scheduled Appwrite Function that sends one week-ahead push per user,
**Sundays 21:00** Austria time (`0 19 * * 0` UTC; 20:00 in winter — Cloud
rejects timezone suffixes).

Content per run, looking at the coming **7 days**: exams and deadlines
(first), homework due, open tasks due. Nothing ahead → no push.

Message ids `wk-<date>-<hash>` are deterministic per user/day — re-runs on
the same Sunday never double-send.

## Setup (same as the other functions)

1. `appwrite push function --function-id weekly-digest`
2. Standard API key with `documents.read` + `messages.write` as the env
   variable `APPWRITE_API_KEY` (Cloud does NOT inject config scopes).

## Testing

Set **`WEEK_TEST_USER`** to a user id: every run then sends a fresh
`[TEST] Week ahead: …` push to that user only — unique id, no idempotent
skip, delivered even when nothing is ahead. Remove the variable to go live.

Optional: **`ALERT_USER`** — when the run fails (e.g. database read), that
user gets a "weekly failed" push instead of silence.

Local, offline: `APPWRITE_API_KEY=mock node test/mock-run.mjs`.
