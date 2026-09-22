<div align="center">

<img src="public/icon.svg" alt="Semester" width="88" />

# Semester.

**The study desk — on the web and in your pocket.**

Grades · tasks · homework · timetable · substitute plan · AI study room —
one design, one database, every device.

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![Flutter](https://img.shields.io/badge/Flutter-3.38-02569B?logo=flutter&logoColor=white)](https://flutter.dev)
[![Appwrite](https://img.shields.io/badge/Appwrite-Cloud-F02E2F?logo=appwrite&logoColor=white)](https://appwrite.io)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://docs.docker.com)

</div>

---

Semester is a complete study companion: a **Next.js web app**, a **Flutter Android app** that
mirrors it feature-for-feature, and a small **AI backend**. Everything syncs through one
Appwrite database as **structured rows** — no JSON blobs — so the web client, the phone and
the daily-digest push service all read and write the same truth. Offline work is never lost:
edits live locally first and win over the cloud until their push lands.

## Features

| | |
| --- | --- |
| 📊 **Dashboard** | Open tasks, due-today/this-week counts, overall grade, upcoming work and the next 7 days at a glance |
| ✅ **Tasks & homework** | Due dates + times, priorities, subject tags, notes; filters, sorting, overdue highlighting |
| 📈 **Grades** | Weighted per-subject averages with the German *Note* scale (1,0–6,0) and an overall average |
| 🗓️ **Timetable** | Import your weekly grid as JSON, then see it overlaid with live **substitutions & cancellations** from your school portal |
| 📅 **Calendar** | Month + week views that combine events, exams, deadlines *and* task due dates |
| 🤖 **AI Study Room** | Upload PDF/DOCX/PPTX/TXT/MD → text is extracted server-side, flashcard decks are generated, and chat answers are grounded in your documents with source citations |
| 🌓 **Light & dark** | Stationery-palette design (Fraunces · Instrument Sans · IBM Plex Mono) with a no-flash theme toggle |
| 🔔 **Push digests** | Appwrite Functions: morning/afternoon/evening digests (classes with substitutions, due work, week ahead), homework updates at 15:00 & 20:00, a Sunday week-ahead — and failure alerts if a run breaks |
| 📱 **Home-screen widgets** | Native Android widgets — *Up next* (homework · tasks · exams) and *Today's timetable* — dark/light aware, tap to open the app |
| 🧭 **Mobile navigation** | Five swipeable tabs + More, system back walks tab history, push taps and `semester://` deeplinks land on the right page |

## How the sync works

Both clients speak the same protocol against Appwrite **TablesDB** (database `semester`):

<div align="center">
  <img src="docs/architecture.png" alt="Semester sync architecture — web app and Android app exchange structured rows with Appwrite Cloud (TablesDB, Storage, push messages); the daily-digest Appwrite function reads the same data" width="520" />
</div>

- **Auto-save everywhere** — forms have no save button: text edits commit debounced
  (~0.4 s), picks (priority, subject, date, color) commit instantly, and closing a form
  can never lose input. Every commit lands in the persisted store, which is what feeds
  the push pipeline below.
- **Push** — local changes are diffed against last-synced content digests and upserted
  (debounced ~1.2 s); removed entities get a `deleted` tombstone row.
- **Pull** — on sign-in and via realtime events, cloud rows merge in; entities with
  unsynced local edits win, everything else adopts the cloud state.
- **Writes are JWT-authenticated** (Appwrite rejects user-scoped permissions on session
  auth), every row carries its `userId`, and rows of id-less entities (timetable slots,
  substitutions, selection) get deterministic content-hash ids that are byte-identical
  across web and mobile — so both clients agree on every row without coordination.
- **Offline-first** — no connection, no problem: everything persists on-device and the
  retry loop catches up later. Sign-out keeps your data on the device.

Portal credentials **never leave the server** — only the fetched plan is mirrored into rows.

## Repositories & layout

```
├── src/                    # Next.js web app
│   ├── app/                #   routes: / · todos · homework · grades · timetable · calendar · study-room
│   ├── components/         #   AppShell, UI kit, feature panels
│   ├── lib/
│   │   ├── store/          #   zustand stores (persisted, one per feature)
│   │   ├── auth/           #   Appwrite client + the sync engine (rows, digests, realtime)
│   │   └── server/         #   node-only: AI client, document storage & text extraction
│   └── app/api/            #   AI chat (streaming) + flashcard generation endpoints
├── mobile/                 # Flutter app — same features, same stores, same sync engine
│   └── lib/
│       ├── appwrite/       #   client + row sync (JWT REST upserts, realtime, reconcile)
│       ├── stores/         #   ChangeNotifier stores, same persisted keys as the web
│       └── pages/ widgets/ models/
├── functions/daily-digest/ # Appwrite Function: daily push notifications
├── scripts/                # Appwrite provisioning & migrations (schema, document→rows)
├── Dockerfile              # production image (port 8899)
└── docker-compose.yml
```

## Getting started (web)

```bash
bun install          # or pnpm/npm
bun dev              # → http://localhost:3000
```

Without any configuration the app is fully usable **local-only**. To enable sync and AI:

1. **Appwrite** — create a project at [Appwrite Cloud](https://cloud.appwrite.io), then add
   to `.env.local`:
   ```
   NEXT_PUBLIC_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
   NEXT_PUBLIC_APPWRITE_PROJECT_ID=your-project-id
   ```
   Provision the database once (server key used by the script only, never shipped):
   ```bash
   APPWRITE_PROJECT_ID=… APPWRITE_API_KEY=… node scripts/appwrite-structured-schema.mjs
   ```
2. **AI** — any OpenAI-compatible provider works. In `.env.local`:
   ```
   AI_API_KEY=your-key
   AI_BASE_URL=https://api.z.ai/api/paas/v4      # or OpenAI/OpenRouter/Ollama
   AI_MODEL=glm-4.6                              # deepseek-flash, gpt-4o-mini, …
   ```
   `DEEPSEEK_API_KEY` / `ZAI_API_KEY` / `OPENAI_API_KEY` alone also work.

## Getting started (mobile)

```bash
cd mobile
flutter pub get
flutter run          # or: flutter build apk --release --target-platform android-arm64
```

Point the app at your endpoint/project in `lib/appwrite/client.dart` (defaults match the
web app) and at the deployed web server in the account sheet — the phone reuses it for AI
and the school portal, so keys and credentials stay server-side.

Home-screen widgets: open **Settings → Home-screen widgets** and pin *Up next* or
*Timetable* — they follow your data automatically (dark/light aware).

## Deployment

```bash
docker compose up -d --build     # → http://<host>:8899
```

Requires `.env.local` next to the compose file (AI key; Appwrite env for sync). Uploaded
document text persists in the mounted `./.data` volume. Deploy the digest function with
`appwrite push functions` — it schedules itself daily and reads the same row tables.

## Conventions

- Pages are client components gated on `useHydrated()` — persisted stores never cause
  hydration mismatches.
- Grade average = `Σ(score/max × weight) / Σweight`, shown as a percent plus the German
  Note (100 % → 1,0 · 75 % → 2,5 · 50 % → 4,0 · 0 % → 6,0).
- Theming is runtime CSS variables on `:root` / `.dark` mapped into Tailwind via
  `@theme inline` — never hardcode a hex.
- Subjects are shared across features; deleting one cascades (grades removed, tasks
  detached).
- Every data form auto-saves (web modals and mobile sheets behave identically): the
  first valid input live-creates the entity — store `add*` actions return the new id —
  and the header flips "New …" → "Edit …". An emptied title keeps its last saved value;
  a close-time flush falls back to "Untitled" (events: today's date) when content
  exists but no title was typed. Grades without valid points are not created.

## Roadmap ideas

Spaced-repetition scheduling · Anki/CSV deck export · ICS calendar export · grade
"what do I need on the final?" projection · iOS client.
