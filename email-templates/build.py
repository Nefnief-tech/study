#!/usr/bin/env python3
"""Build the Semester email templates for Appwrite.

Outputs one ready-to-paste HTML fragment per Appwrite template into
email-templates/dist/, plus preview.html that renders all of them with
sample data substituted.

Appwrite wraps the pasted fragment in its own HTML shell, so every file
is a self-contained body fragment: tables + inline styles only, no
classes, no webfonts (system fallbacks stand in for Fraunces /
Instrument Sans / IBM Plex Mono). Palette tokens below mirror
src/app/globals.css.
"""

import pathlib

PAPER = "#f5f2ea"      # --paper
CARD = "#fdfcf8"       # --card
INK = "#26221b"        # --ink
INK_SOFT = "#756e60"   # --ink-soft
LINE = "#e0dacb"       # --line
ACCENT = "#31633f"     # --accent
INFO = "#38618c"       # --info
FOOT = "#a29a88"       # .dark --ink-soft (footer quiet grey)

SANS = "-apple-system,'Segoe UI','Helvetica Neue',Arial,sans-serif"
SERIF = "Georgia,'Times New Roman',serif"
MONO = "'IBM Plex Mono','Courier New',monospace"

OUT = pathlib.Path(__file__).parent / "dist"


def sub(text: str) -> str:
    """Replace @TOKEN@ palette/font placeholders."""
    for k, v in {
        "PAPER": PAPER, "CARD": CARD, "INK": INK, "INK_SOFT": INK_SOFT,
        "LINE": LINE, "ACCENT": ACCENT, "INFO": INFO, "FOOT": FOOT,
        "SANS": SANS, "SERIF": SERIF, "MONO": MONO,
    }.items():
        text = text.replace("@" + k + "@", v)
    return text


def fragment(eyebrow: str, content: str) -> str:
    """Card shell shared by every template: header row, content, signoff, footer."""
    return sub("""
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:@PAPER@;">
<tr><td align="center" style="padding:32px 12px; background-color:@PAPER@;">

<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:560px;">
<tr><td style="background-color:@CARD@; border:1px solid @LINE@; border-radius:16px; padding:0 40px 36px;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:28px 0 14px; border-bottom:1px solid @LINE@;">
      <span style="font-family:@SERIF@; font-size:19px; font-weight:600; letter-spacing:-0.02em; color:@INK@;">Semester</span>
    </td>
    <td align="right" style="padding:30px 0 14px; border-bottom:1px solid @LINE@;">
      <span style="font-family:@MONO@; font-size:10px; font-weight:600; letter-spacing:2.2px; text-transform:uppercase; color:@ACCENT@;">__EYEBROW__</span>
    </td>
  </tr>
  </table>

__CONTENT__

  <p style="font-family:@SANS@; font-size:15px; line-height:1.6; color:@INK@; margin:28px 0 2px;">Thanks,</p>
  <p style="font-family:@SERIF@; font-size:16px; font-weight:600; color:@INK@; margin:0;">The {{project}} team</p>

</td></tr>
</table>

<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:560px;">
<tr><td align="center" style="padding:18px 16px 4px;">
  <span style="font-family:@MONO@; font-size:10px; letter-spacing:1.6px; text-transform:uppercase; color:@FOOT@;">Semester &middot; your study desk</span>
</td></tr>
</table>

</td></tr>
</table>
""".replace("__EYEBROW__", eyebrow).replace("__CONTENT__", content))


# ---- content building blocks -------------------------------------------------

def p(text: str) -> str:
    return sub("""  <p style="font-family:@SANS@; font-size:15px; line-height:1.65; color:@INK@; margin:26px 0 20px;">__T__</p>"""
               .replace("__T__", text))


def p_soft(text: str) -> str:
    return sub("""  <p style="font-family:@SANS@; font-size:13.5px; line-height:1.6; color:@INK_SOFT@; margin:0 0 26px;">__T__</p>"""
               .replace("__T__", text))


def button(label: str) -> str:
    return sub("""
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 26px;">
  <tr><td align="center" style="border-radius:8px; background-color:@INK@;">
    <a href="{{redirect}}" target="_blank" style="display:inline-block; padding:12px 26px; border-radius:8px; font-family:@SANS@; font-size:14.5px; font-weight:600; color:@PAPER@; text-decoration:none;">__L__</a>
  </td></tr>
  </table>""".replace("__L__", label))


def raw_link() -> str:
    return sub("""  <p style="font-family:@MONO@; font-size:12px; line-height:1.5; word-break:break-all; margin:0 0 26px;"><a href="{{redirect}}" target="_blank" style="color:@INFO@;">{{redirect}}</a></p>""")


def notice(text: str) -> str:
    return sub("""
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:@PAPER@; border:1px solid @LINE@; border-radius:10px; margin:0 0 24px;">
  <tr><td style="padding:12px 16px; font-family:@SANS@; font-size:13px; line-height:1.6; color:@INK_SOFT@;">__T__</td></tr>
  </table>""".replace("__T__", text))


def otp_box() -> str:
    return sub("""
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 26px;">
  <tr><td align="center" style="padding:18px 26px; background-color:@PAPER@; border:1px solid @LINE@; border-radius:10px; font-family:@MONO@; font-size:30px; font-weight:600; letter-spacing:14px; text-indent:14px; color:@INK@;">{{otp}}</td></tr>
  </table>""")


def phrase_chip() -> str:
    return sub("""
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
  <tr><td style="padding:10px 16px; background-color:@PAPER@; border:1px solid @LINE@; border-radius:8px; font-family:@MONO@; font-size:12px; color:@INK_SOFT@;">
    security phrase&nbsp;&nbsp;<span style="color:@INK@; font-weight:600; letter-spacing:1px;">{{phrase}}</span>
  </td></tr>
  </table>
  <p style="font-family:@SANS@; font-size:12.5px; line-height:1.55; color:@INK_SOFT@; margin:0 0 26px;">You can trust this email if the phrase matches the one shown during sign-in.</p>""")


def agent_line(prefix: str) -> str:
    return notice(
        prefix
        + ' requested with <strong style="color:@INK@;">{{agentClient}}</strong> on '
        + '<strong style="color:@INK@;">{{agentDevice}}</strong> &middot; <strong style="color:@INK@;">{{agentOs}}</strong>. '
        + "If you didn&#39;t request this, you can safely ignore the email."
    )


def details_table(rows: list[tuple[str, str]]) -> str:
    trs = "".join(
        '<tr>'
        '<td width="118" style="padding:7px 0; font-family:@MONO@; font-size:10px; font-weight:600; letter-spacing:1.6px; text-transform:uppercase; color:@INK_SOFT@; vertical-align:middle;">'
        + label
        + '</td>'
        '<td style="padding:7px 0; font-family:@SANS@; font-size:14px; font-weight:600; color:@INK@; vertical-align:middle;">'
        + value
        + '</td></tr>'
        for label, value in rows
    )
    return sub("""
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:@PAPER@; border:1px solid @LINE@; border-radius:10px; margin:0 0 26px;">
  <tr><td style="padding:10px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">__ROWS__</table>
  </td></tr>
  </table>""".replace("__ROWS__", trs))


# ---- the seven Appwrite templates --------------------------------------------

TEMPLATES: dict[str, str] = {
    # Auth > Templates > Verification  ({{user}}, {{project}}, {{redirect}})
    "verification": fragment(
        "Verify your email",
        p("Follow this link to verify the email address of your "
          "<strong>{{project}}</strong> account.")
        + button("Confirm email address")
        + p_soft("If you didn&#39;t ask to verify this address, you can safely ignore this message."),
    ),

    # Auth > Templates > Magic URL  ({{user}}, {{project}}, {{redirect}},
    #   {{agentClient}}, {{agentDevice}}, {{agentOs}}, {{phrase}})
    "magic-url": fragment(
        "Magic sign-in",
        p("Click the button below to securely sign in to your "
          "<strong>{{project}}</strong> account. The link expires in 1 hour.")
        + button("Sign in to {{project}}")
        + p_soft("If the button doesn&#39;t work, paste this address into your browser:")
        + raw_link()
        + agent_line("This sign-in was")
        + phrase_chip(),
    ),

    # Auth > Templates > OTP Login  ({{user}}, {{project}}, {{otp}},
    #   {{agentClient}}, {{agentDevice}}, {{agentOs}}, {{phrase}})
    "otp-login": fragment(
        "Sign-in code",
        p("Enter this code when prompted to securely sign in to your "
          "<strong>{{project}}</strong> account. It expires in 15 minutes.")
        + otp_box()
        + agent_line("This sign-in was")
        + phrase_chip(),
    ),

    # Auth > Templates > Recovery  ({{user}}, {{project}}, {{redirect}})
    "recovery": fragment(
        "Password reset",
        p("Follow this link to reset the password of your "
          "<strong>{{project}}</strong> account.")
        + button("Reset password")
        + p_soft("If you didn&#39;t ask to reset your password, you can safely ignore this message."),
    ),

    # Auth > Templates > Invitation  ({{user}}, {{owner}}, {{team}},
    #   {{project}}, {{redirect}})
    "invite": fragment(
        "Team invitation",
        p("<strong>{{owner}}</strong> invited you to join the "
          "<strong>{{team}}</strong> team on <strong>{{project}}</strong>.")
        + button("Accept invite to {{team}}")
        + p_soft("Not interested? You can safely ignore this message."),
    ),

    # Auth > Templates > MFA Code  ({{user}}, {{project}}, {{otp}},
    #   {{agentClient}}, {{agentDevice}}, {{agentOs}})
    "mfa-code": fragment(
        "Two-step verification",
        p("Enter this code to confirm two-step verification on your "
          "<strong>{{project}}</strong> account. It expires in 15 minutes.")
        + otp_box()
        + agent_line("This code was"),
    ),

    # Auth > Templates > Session Alert  ({{user}}, {{project}}, {{date}},
    #   {{year}}, {{time}}, {{device}}, {{ipAddress}}, {{country}})
    "session-alert": fragment(
        "New session",
        p("A new session was created on your <strong>{{project}}</strong> account "
          "on <strong>{{date}}, {{year}} at {{time}} UTC</strong>. Here are the details:")
        + details_table([
            ("Device", "{{device}}"),
            ("IP address", "{{ipAddress}}"),
            ("Country", "{{country}}"),
        ])
        + p_soft("If this was you, there&#39;s nothing more you need to do. "
                 "If you don&#39;t recognize this session, please secure your account."),
    ),
}


# ---- preview page ------------------------------------------------------------

SAMPLES = {
    "{{user}}": "Alex",
    "{{project}}": "Semester",
    "{{redirect}}": "https://semester.example.app/verify?secret=abc123",
    "{{otp}}": "824193",
    "{{phrase}}": "maple-lantern",
    "{{agentClient}}": "Semester Web",
    "{{agentDevice}}": "Chrome",
    "{{agentOs}}": "Windows 11",
    "{{owner}}": "Fabian",
    "{{team}}": "study group",
    "{{date}}": "September 20",
    "{{year}}": "2026",
    "{{time}}": "17:42",
    "{{device}}": "Chrome on Windows 11",
    "{{ipAddress}}": "84.112.20.7",
    "{{country}}": "Austria",
}


def apply_samples(html: str) -> str:
    for var, value in SAMPLES.items():
        html = html.replace(var, value)
    return html


def build_preview(rendered: dict[str, str]) -> str:
    sections = "".join(
        f"<h2>{name}</h2>\n<div class='frame'>{html}</div>\n"
        for name, html in rendered.items()
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Semester — Appwrite email templates preview</title>
<style>
  body {{ margin:0; background:#17150f; font-family:'Instrument Sans',system-ui,sans-serif; }}
  main {{ max-width:640px; margin:0 auto; padding:48px 16px 80px; }}
  h1 {{ font-family:Georgia,serif; font-weight:600; letter-spacing:-0.02em; color:#ece6d6; font-size:26px; margin:0 0 4px; }}
  .note {{ font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#a29a88; margin:0 0 40px; }}
  h2 {{ font-family:'IBM Plex Mono',monospace; font-size:12px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#8fb99a; margin:40px 0 10px; }}
  .frame {{ border:1px solid #353025; border-radius:14px; overflow:hidden; }}
</style>
</head>
<body>
<main>
<h1>Semester email templates</h1>
<p class="note">appwrite dist fragments &middot; sample data &middot; built by build.py</p>
{sections}
</main>
</body>
</html>"""


def main() -> None:
    OUT.mkdir(exist_ok=True)
    rendered = {}
    for name, html in TEMPLATES.items():
        (OUT / f"{name}.html").write_text(html, encoding="utf-8")
        rendered[name] = apply_samples(html)
    (OUT / "preview.html").write_text(build_preview(rendered), encoding="utf-8")
    print(f"wrote {len(TEMPLATES)} templates + preview.html to {OUT}")


if __name__ == "__main__":
    main()
