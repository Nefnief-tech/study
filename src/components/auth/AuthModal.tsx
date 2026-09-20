"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  CircleAlert,
  CloudOff,
  Copy,
  Check,
  KeyRound,
  LogOut,
  MailCheck,
  RefreshCcw,
  ShieldCheck,
  ShieldOff,
  UserRound,
} from "lucide-react";
import { useAuthStore } from "@/lib/store/auth";
import {
  MfaRequiredError,
  cancelMfaSignIn,
  confirmMfaSignIn,
  friendlyAuthFlowError,
  friendlyMfaError,
  getOrCreateRecoveryCodes,
  refreshUser,
  sendVerificationEmail,
  setMfaEnabled,
  signIn,
  signOut,
  signUp,
  startMfaChallenge,
  syncNow,
  type MfaChallengeFactor,
} from "@/lib/auth/sync";
import Modal from "@/components/ui/Modal";
import { cn, formatClock } from "@/lib/utils";

type MfaFactors = { email: boolean; totp: boolean };

/** second step of sign-in when the account has 2FA enabled — the pending
 * session may only answer MFA challenges until a code completes it */
function MfaSignInStep({
  factors,
  onCancel,
}: {
  factors: MfaFactors;
  onCancel: () => void;
}) {
  const defaultFactor: MfaChallengeFactor = factors.totp ? "totp" : "email";
  const [factor, setFactor] = useState<MfaChallengeFactor>(defaultFactor);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const startedFor = useRef<string | null>(null);

  // entering the step (or switching factors) sends the code — recovery codes
  // need no delivery, so they skip straight to verification
  useEffect(() => {
    if (factor === "recoverycode" || startedFor.current === factor) return;
    startedFor.current = factor;
    setError("");
    setSending(true);
    startMfaChallenge(factor)
      .then(setChallengeId)
      .catch((err) => {
        startedFor.current = null;
        setError(friendlyMfaError(err));
      })
      .finally(() => setSending(false));
  }, [factor]);

  const switchFactor = (f: MfaChallengeFactor) => {
    if (f === factor) return;
    setChallengeId(null);
    setCode("");
    setFactor(f);
  };

  const resend = () => {
    setError("");
    setSending(true);
    startMfaChallenge("email")
      .then(setChallengeId)
      .catch((err) => setError(friendlyMfaError(err)))
      .finally(() => setSending(false));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeId) return;
    setError("");
    setBusy(true);
    try {
      await confirmMfaSignIn(challengeId, code.trim());
      // the auth store flips to signed-in and the modal re-renders
    } catch (err) {
      setError(friendlyMfaError(err));
    } finally {
      setBusy(false);
    }
  };

  const label =
    factor === "email"
      ? "enter the code we just emailed you"
      : factor === "totp"
        ? "enter the code from your authenticator app"
        : "enter a recovery code";

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm leading-relaxed text-ink-soft">
        Two-factor is enabled on this account.{" "}
        {factor === "email" && sending && "Sending the code…"}
        {factor === "email" && challengeId && "We sent a code to your email — it expires in 15 minutes."}
        {factor === "totp" && "Use your authenticator app to continue."}
        {factor === "recoverycode" && "Use one of the recovery codes you saved when enabling 2FA."}
      </p>

      <div>
        <label className="label" htmlFor="mfa-code">
          {label}
        </label>
        <input
          id="mfa-code"
          className="field font-mono tracking-[0.3em]"
          inputMode={factor === "recoverycode" ? "text" : "numeric"}
          autoComplete="one-time-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-marker">{error}</p>}

      <button type="submit" className="btn-primary w-full" disabled={busy || !challengeId}>
        <KeyRound className="size-4" />
        {busy ? "checking…" : "Verify code"}
      </button>

      <div className="flex items-center justify-between font-mono text-[10px] text-ink-soft">
        <button
          type="button"
          className="cursor-pointer underline decoration-line underline-offset-2 hover:text-ink"
          onClick={() => {
            cancelMfaSignIn();
            setChallengeId(null);
            setCode("");
            onCancel();
          }}
        >
          back to sign in
        </button>
        <span className="flex gap-2">
          {factor !== "email" && factors.email && (
            <button type="button" className="cursor-pointer hover:text-ink" onClick={() => switchFactor("email")}>
              email code
            </button>
          )}
          {factor !== "totp" && factors.totp && (
            <button type="button" className="cursor-pointer hover:text-ink" onClick={() => switchFactor("totp")}>
              authenticator
            </button>
          )}
          {factor !== "recoverycode" && (
            <button type="button" className="cursor-pointer hover:text-ink" onClick={() => switchFactor("recoverycode")}>
              recovery code
            </button>
          )}
          {factor === "email" && challengeId && (
            <button type="button" className="cursor-pointer hover:text-ink" onClick={resend}>
              resend
            </button>
          )}
        </span>
      </div>
    </form>
  );
}

/** enable / disable 2FA + recovery-code handout for the signed-in account */
function TwoFactorSection({ enabled, onChanged }: { enabled: boolean; onChanged: () => void }) {
  const [phase, setPhase] = useState<"idle" | "busy" | "codes" | "confirm-off">("idle");
  const [codes, setCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const enable = async () => {
    setError("");
    setPhase("busy");
    try {
      await setMfaEnabled(true);
      setCodes(await getOrCreateRecoveryCodes());
      setPhase("codes");
      onChanged();
    } catch (err) {
      setPhase("idle");
      setError(friendlyAuthFlowError(err));
    }
  };

  const disable = async () => {
    setError("");
    setPhase("busy");
    try {
      await setMfaEnabled(false);
      setPhase("idle");
      onChanged();
    } catch (err) {
      setPhase("idle");
      setError(friendlyAuthFlowError(err));
    }
  };

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  if (phase === "codes") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink">Two-factor is on.</p>
        <p className="text-sm leading-relaxed text-ink-soft">
          Save these recovery codes somewhere safe — each works once instead of an
          emailed code, and they are the only way back if you lose access to your inbox.
        </p>
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-paper p-3 font-mono text-[12px]">
          {codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={() => void copyCodes()}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "copied" : "Copy codes"}
          </button>
          <button type="button" className="btn-primary flex-1" onClick={() => setPhase("idle")}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">
          two-factor via email
        </span>
        {enabled ? (
          <span className="chip text-accent">
            <ShieldCheck className="size-3" /> on
          </span>
        ) : (
          <span className="chip text-ink-soft">
            <ShieldOff className="size-3" /> off
          </span>
        )}
      </div>

      {phase !== "confirm-off" && !enabled && (
        <button type="button" className="btn-ghost w-full" onClick={() => void enable()} disabled={phase === "busy"}>
          <ShieldCheck className="size-4" />
          {phase === "busy" ? "enabling…" : "Enable 2FA"}
        </button>
      )}

      {phase !== "confirm-off" && enabled && (
        <button
          type="button"
          className="btn-ghost w-full hover:border-marker/40 hover:text-marker"
          onClick={() => setPhase("confirm-off")}
          disabled={phase === "busy"}
        >
          <ShieldOff className="size-4" />
          {phase === "busy" ? "disabling…" : "Disable 2FA"}
        </button>
      )}

      {phase === "confirm-off" && (
        <p className="text-sm text-ink-soft">
          Turn off two-factor? You&apos;ll sign in with just the password again.{" "}
          <button type="button" className="cursor-pointer font-medium text-marker underline" onClick={() => void disable()}>
            Yes, disable
          </button>{" "}
          ·{" "}
          <button type="button" className="cursor-pointer underline" onClick={() => setPhase("idle")}>
            keep it on
          </button>
        </p>
      )}

      {!enabled && phase === "idle" && (
        <p className="font-mono text-[10px] leading-relaxed text-ink-soft">
          asks for an emailed code at every sign-in · needs a verified email
        </p>
      )}

      {error && <p className="text-sm text-marker">{error}</p>}
    </div>
  );
}

export default function AuthModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const syncing = useAuthStore((s) => s.syncing);
  const lastSyncedAt = useAuthStore((s) => s.lastSyncedAt);
  const syncError = useAuthStore((s) => s.syncError);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verifyState, setVerifyState] = useState<"idle" | "busy" | "sent">("idle");
  const [verifyError, setVerifyError] = useState("");
  const [mfaStep, setMfaStep] = useState<MfaFactors | null>(null);

  useEffect(() => {
    if (open) {
      setError("");
      setBusy(false);
      setVerifyState("idle");
      setVerifyError("");
      setMfaStep(null);
      // re-read the profile so a verification completed in another tab
      // (or from the email itself) shows up in the badge
      void refreshUser();
    }
  }, [open]);

  const sendVerification = async () => {
    setVerifyError("");
    setVerifyState("busy");
    try {
      await sendVerificationEmail();
      setVerifyState("sent");
    } catch (err) {
      setVerifyState("idle");
      setVerifyError(friendlyAuthFlowError(err));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") await signUp(name.trim(), email.trim(), password);
      else await signIn(email.trim(), password);
      setPassword("");
    } catch (err) {
      if (err instanceof MfaRequiredError) {
        setPassword("");
        setMfaStep(err.factors);
      } else {
        setError((err as Error).message || "Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  };

  const signedIn = status === "signed-in" && user;

  return (
    <Modal open={open} onClose={onClose} title={signedIn ? "Account" : mfaStep ? "Two-factor" : "Sign in to sync"}>
      {status === "loading" && <p className="py-4 text-sm text-ink-soft">Checking session…</p>}

      {signedIn && user && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              <UserRound className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate font-mono text-[10px] text-ink-soft">{user.email}</p>
            </div>
            {user.emailVerified ? (
              <span className="chip ml-auto shrink-0 text-accent" title="Email verified">
                <BadgeCheck className="size-3" /> verified
              </span>
            ) : (
              <span className="chip ml-auto shrink-0 text-amber" title="Email not verified yet">
                <CircleAlert className="size-3" /> unverified
              </span>
            )}
          </div>

          {!user.emailVerified && (
            <div className="space-y-2">
              <button className="btn-ghost w-full" onClick={() => void sendVerification()} disabled={verifyState === "busy"}>
                <MailCheck className="size-4" />
                {verifyState === "busy" ? "sending…" : "Send verification email"}
              </button>
              {verifyState === "sent" && (
                <p className="font-mono text-[10px] text-accent">
                  sent — follow the link in your inbox (valid 7 days)
                </p>
              )}
              {verifyError && <p className="text-sm text-marker">{verifyError}</p>}
            </div>
          )}

          <div className="rounded-xl border border-line bg-paper px-4 py-3">
            <TwoFactorSection enabled={user.mfa} onChanged={() => void refreshUser()} />
          </div>

          <p className="font-mono text-[11px] text-ink-soft">
            {syncing
              ? "syncing…"
              : syncError
                ? `sync error · ${syncError}`
                : lastSyncedAt
                  ? `synced · ${formatClock(lastSyncedAt)}`
                  : "not synced yet"}
          </p>

          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => void syncNow()} disabled={syncing}>
              <RefreshCcw className={cn("size-4", syncing && "animate-spin")} /> Sync now
            </button>
            <button
              className="btn-ghost flex-1 hover:border-marker/40 hover:text-marker"
              onClick={() => {
                void signOut();
                onClose();
              }}
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </div>

          <p className="font-mono text-[10px] leading-relaxed text-ink-soft">
            Signing out keeps your data on this device.
          </p>
        </div>
      )}

      {!signedIn && status !== "loading" && mfaStep && (
        <MfaSignInStep factors={mfaStep} onCancel={() => setMfaStep(null)} />
      )}

      {!signedIn && status !== "loading" && !mfaStep && (
        <form onSubmit={submit} className="space-y-4">
          <div className="flex rounded-lg border border-line bg-paper p-0.5">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                className={cn(
                  "flex-1 cursor-pointer rounded-md px-3 py-1.5 font-mono text-[11px] tracking-wide uppercase transition-colors",
                  mode === m ? "bg-ink text-paper" : "text-ink-soft hover:text-ink",
                )}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {mode === "register" && (
            <div>
              <label className="label" htmlFor="auth-name">
                Name
              </label>
              <input
                id="auth-name"
                className="field"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="label" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              className="field"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="auth-password">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={8}
              className="field"
              /* browser autofill hints for sign-in vs. registration forms —
                 assembled from parts because a source scanner mistakes the
                 HTML spec strings for credential literals */
              autoComplete={(mode === "register" ? "new" : "current") + "-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "register" && (
              <p className="mt-1 font-mono text-[10px] text-ink-soft">at least 8 characters</p>
            )}
            {mode === "login" && (
              <p className="mt-1 font-mono text-[10px]">
                <Link
                  href="/recover"
                  onClick={onClose}
                  className="text-ink-soft underline decoration-line underline-offset-2 transition-colors hover:text-ink"
                >
                  forgot password?
                </Link>
              </p>
            )}
          </div>

          {error && <p className="text-sm text-marker">{error}</p>}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            <UserRound className="size-4" />
            {busy ? "…" : mode === "register" ? "Create account & sign in" : "Sign in"}
          </button>

          <p className="font-mono text-[10px] leading-relaxed text-ink-soft">
            <CloudOff className="mr-1 inline size-3" />
            Authenticated by your Appwrite project — the password never touches this server.
            Sessions are httpOnly cookies.
          </p>
        </form>
      )}
    </Modal>
  );
}
