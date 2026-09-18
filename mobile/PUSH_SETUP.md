# Push notifications via Appwrite Messaging

The app registers an FCM token as an Appwrite **push target** on the signed-in user
(`account.createPushTarget`), so your Appwrite project can send push messages to the device
through the Messaging API — no separate push service.

Without setup the app builds and runs normally; push stays inactive (all Firebase calls are
guarded). To enable it:

## 1. Firebase project + Android app

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. Add an **Android app** with package name `com.semesterapp.semester`.
3. Download `google-services.json` and drop it into `mobile/android/app/`.
4. Uncomment the plugin in `mobile/android/build.gradle.kts`:

   ```kotlin
   plugins {
       // …
       id("com.google.gms.google-services") apply false   // ← uncomment
   }
   ```

   and in `mobile/android/app/build.gradle.kts`:

   ```kotlin
   plugins {
       // …
       id("com.google.gms.google-services")               // ← uncomment
   }
   ```

5. `flutter build apk` — the build now requires the json file to be present.

## 2. Appwrite: FCM provider + Android platform

In the Appwrite console for project `study` (`6aac46e3001a9ef65b25`):

1. **Messaging → Add provider → FCM** — paste the Firebase *server key* and *sender ID*
   (Project settings → Cloud Messaging).
2. **Overview → Add platform → Android** — package name `com.semesterapp.semester`.
   (Or add the platform to `appwrite.config.json` and `appwrite push platforms`.)

## 3. Sending a message

Console: **Messaging → Create message → Push**, choose topic/target, send.

Or via the API (server key required — this is a server-side operation, same trust level as
the web app's `APPWRITE_API_KEY`):

```bash
curl -X POST "$ENDPOINT/messaging/messages/push" \
  -H "X-Appwrite-Project: 6aac46e3001a9ef65b25" \
  -H "X-Appwrite-Key: $APPWRITE_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "messageId": "semester-test",
    "title": "Semester",
    "body": "Your Vertretungsplan for tomorrow is ready.",
    "topics": ["all"],
    "draft": false
  }'
```

Subscribe the device to a topic (e.g. `all`) if you want broadcast pushes — create the topic
once in the console (Messaging → Topics), then subscribe the push target client-side:

```dart
import 'package:appwrite/appwrite.dart';

// after PushService has registered the target
final messaging = Messaging(appwriteClient);
await messaging.createSubscriber(
  topicId: 'all',
  subscriberId: ID.unique(),
  targetId: myPushTargetId, // the id created by PushService
);
```

## How it behaves

- **Foreground**: messages arrive through `FirebaseMessaging.onMessage` and are shown via a
  local notification on the `semester_push` channel.
- **Background/terminated**: `semesterFirebaseMessagingHandler` (registered in `main.dart`)
  shows the notification.
- **Token rotation**: `onTokenRefresh` re-registers the target with the new token; the target
  id is a stable per-install value (seeded in SharedPreferences), so refreshes replace the
  target instead of duplicating it.
- **Sign-out** removes this device's push target.
