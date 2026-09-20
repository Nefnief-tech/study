# Semester — Appwrite email templates

Custom email templates for Appwrite Auth, styled after the app's stationery
palette (`src/app/globals.css`): warm paper background, cream card, ink text,
green accent eyebrow labels, serif "Semester" wordmark.

- `build.py` — source of truth; regenerates everything below (`python3 build.py`)
- `dist/<name>.html` — one ready-to-paste fragment per Appwrite template
- `dist/preview.html` — all seven rendered with sample data (open in a browser)

## Applying them in Appwrite

1. **Custom SMTP first.** Appwrite only honors custom templates when the
   project sends through your own SMTP server — the default Appwrite sender
   ignores them. Configure it under *Project → Settings → SMTP* (Cloud) or the
   `SMTP_*` env vars (self-hosted) before expecting any change.
2. Open *Auth → Templates*, pick a template, enable the custom template
   editor, and paste the **whole content** of the matching `dist/<name>.html`:

   | Appwrite template | File |
   |---|---|
   | Verification | `dist/verification.html` |
   | Magic URL | `dist/magic-url.html` |
   | OTP Login | `dist/otp-login.html` |
   | Recovery | `dist/recovery.html` |
   | Invitation | `dist/invite.html` |
   | MFA Code | `dist/mfa-code.html` |
   | Session Alert | `dist/session-alert.html` |

3. Send yourself one real email per flow to confirm rendering (Gmail, Apple
   Mail and Outlook differ most).

## Notes

- The files are **body fragments**: Appwrite wraps them in its own HTML shell,
  which is why there is no `<html>`/`<body>` and no stylesheet. Every element
  is styled inline — table-based layout, no classes, no dependency on
  Appwrite's wrapper CSS (the base templates' `.button` class is replaced by
  fully inline-styled anchors).
- Webfonts can't be loaded reliably in email clients, so Fraunces /
  Instrument Sans / IBM Plex Mono are stood in by Georgia / system sans /
  `IBM Plex Mono → Courier New` fallback stacks.
- All Appwrite variables are kept at parity with the defaults:
  `{{user}}`, `{{project}}`, `{{redirect}}`, `{{otp}}`, `{{phrase}}`,
  `{{agentClient}}`, `{{agentDevice}}`, `{{agentOs}}`, `{{owner}}`, `{{team}}`,
  `{{date}}`, `{{year}}`, `{{time}}`, `{{device}}`, `{{ipAddress}}`,
  `{{country}}`. Don't remove them when editing copy.
- `dist/` is generated (gitignored) — tweak the palette/font constants at the
  top of `build.py` and rebuild if the app's palette ever changes.
