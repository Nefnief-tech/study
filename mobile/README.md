# Semester — Flutter app

Mobile companion to the Semester web app (`../`), built with **Flutter 3.38 / Dart 3.10**.
Same features, same design language (stationery palette, Fraunces + Instrument Sans + IBM Plex
Mono, dotted planner grid), same **Appwrite database and sync architecture** — the two clients
interoperate through the exact same documents.

## Run it

```bash
flutter pub get
flutter run            # device/emulator
flutter build apk      # or --release
```

The Android toolchain lives in `android/`; the app id is `com.semesterapp.semester`.
There is no iOS folder yet — `flutter create --platforms ios .` adds it on a Mac.

## How it maps to the web app

| Web (`../src`)                  | Mobile (`lib/`)                                   |
| ------------------------------- | ------------------------------------------------- |
| `lib/types.ts`                  | `models/types.dart` — identical JSON keys         |
| `lib/store/*.ts` (zustand)      | `stores/*.dart` (ChangeNotifier + SharedPreferences, same `semester.*` keys, same zustand-persist envelope) |
| `lib/auth/appwrite.ts`          | `appwrite/client.dart` — same endpoint/project, JWT cache for API calls |
| `lib/auth/sync.ts`              | `appwrite/sync.dart` — identical doc IDs (`sha256(userId:collection:key)`, 32 hex chars), identical payload shapes, same dirty-flag "cloud wins on load" model, 1.2 s debounced pushes, per-deck documents with deletion tracking |
| `lib/store/*.ts` row sync       | `appwrite/sync.dart` row adapters — subjects/todos/homeworks/grades/events live as **one structured row per entity** in Appwrite `tablesdb` tables (rowId = entity UUID, `deleted` tombstone, sha256 content digests, pending-local-wins merge). Only timetable / study-room / chats / decks remain JSON snapshot blobs. Schema: `../scripts/appwrite-structured-schema.mjs` |
| `lib/server/*` + `app/api/*`    | `services/api.dart` — reuses the deployed web server (AI key + portal scraper stay server-side) |
| `components/ui/*`               | `widgets/*` (chips, badges, buttons, sheets, subject select) |
| `app/*` pages                   | `pages/*`                                          |
| `globals.css` tokens            | `theme/app_theme.dart` (`SemColors` light/dark)    |

The school-portal credentials stay device-local (never synced), exactly like the web app.

## Navigation (mobile-friendly adaptation)

The web bottom bar squeezes 7 destinations; on phones the app keeps the 5 daily-use ones
(Overview · Tasks · Timetable · Calendar · Study Room) and puts **Homework**, **Grades** and
**Account & sync** in the top-bar ⋮ menu. Modals render as bottom sheets; date inputs use the
native pickers.

## Server URL

AI study-room and the Vertretungsplan fetch go to the Semester web server
(Account sheet → *Semester server*). Default: `http://10.0.2.2:8899` — the Android-emulator
alias for your machine's `localhost:8899` (the Docker deployment port). Change it to your
https production URL for real use.

## Push notifications (Appwrite Messaging)

See **[PUSH_SETUP.md](PUSH_SETUP.md)**. Without the Firebase config file the app builds and
runs fine — push is simply inactive; every Firebase call is guarded.

## Toolchain notes (this machine)

- The Arch `flutter` package at `/usr/lib/flutter` is broken (no tool snapshot) — the working
  SDK is at `~/flutter-sdk/flutter` (add its `bin` to PATH).
- `android/gradle.properties` pins `org.gradle.java.home` to JDK 21 because the system Java 26
  is too new for the Android Gradle Plugin.
- `flutter_local_notifications` needs core-library desugaring — already enabled in
  `android/app/build.gradle.kts`.
