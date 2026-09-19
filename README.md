# Semester — all-in-one study desk

A student study app built with **Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Zustand**.
All data persists in the browser via `localStorage` (Zustand `persist`) — no backend yet, easy to
swap for a DB later since all reads/writes go through the stores in `src/lib/store/`.

## Run it

```bash
pnpm install
pnpm dev     # http://localhost:3000
```

## Auth & cloud sync (Appwrite, optional)

Add a login and per-user cloud sync on top of the localStorage apps:

1. Create a project at [Appwrite Cloud](https://cloud.appwrite.io) (or self-host)
2. `.env.local`: set `NEXT_PUBLIC_APPWRITE_ENDPOINT` + `NEXT_PUBLIC_APPWRITE_PROJECT_ID`
3. One-time provisioning: `APPWRITE_PROJECT_ID=… APPWRITE_API_KEY=… node scripts/appwrite-setup.mjs`
   (creates the web platform, database `semester`, collection `snapshots` with owner-only
   document permissions — the server API key is used by the script only, never shipped)

Then restart; the sidebar shows "Sign in to sync". Sync model: **the cloud is the source
of truth on page load** — on a signed-in load every store is replaced by its cloud state,
and afterwards each local change is pushed (debounced ~1.2s). Subjects, todos, homeworks,
grades and events sync as **structured rows** — one row per entity in Appwrite `tablesdb`
tables (`semester/subjects`, `todos`, `homeworks`, `grades`, `events`; rowId = entity UUID,
`deleted` tombstone, sha256 content digests, pending-local edits win until the push lands).
Timetable, study room, chats and decks remain JSON snapshot documents, synced the same way
as before. Provision the row tables once with
`APPWRITE_PROJECT_ID=… APPWRITE_API_KEY=… node scripts/appwrite-structured-schema.mjs`
and migrate existing snapshot data with `scripts/appwrite-migrate-blobs-to-rows.mjs`.
Offline work is never silently clobbered: local edits whose push hasn't succeeded yet keep
a dirty flag (`semester.syncmeta`) and win over the cloud on the next load. Sign-out keeps
data on the device. Without Appwrite env vars the app stays local-only.

## AI setup (Study Room)

Everything else works without any key; flashcards & chat need one. Create `.env.local`
(a template is included) with any OpenAI-compatible provider — Z.ai, OpenAI, OpenRouter,
or a local Ollama:

```
AI_API_KEY=your-key-here
AI_BASE_URL=https://api.z.ai/api/paas/v4
AI_MODEL=glm-4.6
```

`DEEPSEEK_API_KEY` / `ZAI_API_KEY` / `OPENAI_API_KEY` alone also work (defaults per provider: deepseek-flash · glm-4.6 · gpt-4o-mini). Restart the dev
server afterwards. Uploaded files are extracted (unpdf/JSZip) and stored under `.data/`
(gitignored) — only text, never the raw files. Chat streams tokens via
`/api/study-room/chat`; decks are generated as JSON via `/api/study-room/flashcards`.

## Features

| Route         | What it does                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`           | Dashboard: open/due-today/this-week counts, overall grade (Note), upcoming tasks, next-7-days schedule, per-subject averages, clear-all-data          |
| `/todos`      | Tasks with due date+time, priority, subject tag, notes. Filter by status/subject, sort by due date or priority. Overdue + due-today highlighting      |
| `/grades`     | Per-subject grade calculator: entries with score/max/weight, weighted average + German Note (1,0–6,0) per subject, overall average, weight-sum indicator |
| `/calendar`   | Month + week views. Shows events (study session / deadline / exam / event) **and pulls task due dates in automatically**. Click a day to add, click a chip to edit/tick |
| `/study-room` | **AI Study Room**: upload PDF/DOCX/PPTX/TXT/MD → text is extracted server-side; generate flashcard decks from the material and chat with streaming answers grounded in the selected documents (with source citations). Requires an AI key — see `.env.local` |

Light/dark mode via the toggle in the sidebar (and mobile top bar). The choice persists in
`localStorage` under `semester.theme`; with no stored choice it follows the system preference.
A tiny inline script in the root layout applies it before first paint, so there is no flash.

## Structure

```
src/
  app/                  # routes (dashboard, todos, grades, calendar, study-room)
  components/
    layout/AppShell.tsx # sidebar (desktop) + top bar & bottom tabs (mobile), first-run seeding
    ui/                 # Modal, SubjectSelect (with inline subject creation), badges/chips
    todos/ grades/ calendar/ study-room/ (Documents, Flashcards, Chat panels)
  lib/
    types.ts            # Subject, Todo, GradeEntry, StudyEvent
    store/              # zustand stores: subjects, todos, grades, events, studyroom (persisted)
    server/             # node-only: document storage (.data/), text extraction, AI client
    auth/               # Appwrite client wrapper + sync engine (optional cloud mode)
    utils.ts            # date helpers, weighted-average math, German note scale, palette
```

Subjects are shared across all three features (a subject has a name + color from the stationery
palette); deleting one cascades: its grades are removed and tasks/events are detached.

## Conventions

- Pages are client components gated on `useHydrated()` (`src/lib/hooks.ts`) so the persisted
  stores never cause hydration mismatches — render a `PageSkeleton` until mounted.
- Dates: todo `due` is a `datetime-local` string, events use `yyyy-MM-dd` + optional `HH:mm`,
  grade dates `yyyy-MM-dd`.
- Grade average = `Σ(score/max × weight) / Σweight`, shown as a percent plus the German Note.
  Weights are relative; the UI flags when a subject's weights don't sum to 100.
- German scale: linear 100% → 1,0 · 75% → 2,5 · 50% → 4,0 · 0% → 6,0 (`germanNote()` in
  `src/lib/utils.ts`); ≥ 4,0 counts as warn, above 4,0 as fail.
- Theming: all colors are runtime CSS vars on `:root` / `.dark`, mapped into Tailwind via
  `@theme inline` — add a color by adding the var + mapping, never a hardcoded hex.
- ID generation: `crypto.randomUUID()`.

## Daily digest (Appwrite Function)

`functions/daily-digest/` runs on a daily cron (`30 15 * * *` UTC) and sends push notifications
via Appwrite Messaging: tomorrow's classes **with cancellations/substitutions** from the
mirrored Vertretungsplan, overdue/due-soon homework & tasks, and the next 7 days of exams and
deadlines. Deploy with `appwrite push functions` — details in
[functions/daily-digest/README.md](functions/daily-digest/README.md). Both apps mirror the
fetched substitute plan (never the credentials) into a `portal` snapshot after each fetch.

## Next up (suggested)

- Swap `localStorage` for Prisma + SQLite/Postgres behind API routes when accounts are needed
- Grade "what do I need on the final?" projection, recurring events, ICS export
- Study Room: OCR for scanned PDFs, deck export (CSV/Anki), spaced-repetition scheduling
