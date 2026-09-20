"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleAlert, Home, KeyRound, MailCheck } from "lucide-react";
import {
  completePasswordRecovery,
  friendlyAuthFlowError,
  requestPasswordRecovery,
} from "@/lib/auth/sync";

function RequestForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await requestPasswordRecovery(email.trim());
      setSent(true);
    } catch (err) {
      setError(friendlyAuthFlowError(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <>
        <MailCheck className="mx-auto size-10 text-accent" />
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          If an account exists for <strong>{email.trim()}</strong>, a reset link is on its
          way. It is valid for one hour and works from any device.
        </p>
        <Link href="/" className="btn-ghost mt-6 inline-flex">
          <Home className="size-4" /> Back to Semester
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-left">
      <p className="text-sm leading-relaxed text-ink-soft">
        Enter your account email and we&apos;ll send you a link to set a new password.
      </p>
      <div>
        <label className="label" htmlFor="recover-email">
          Email
        </label>
        <input
          id="recover-email"
          type="email"
          required
          className="field"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-marker">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        <KeyRound className="size-4" />
        {busy ? "…" : "Send recovery link"}
      </button>
      <p className="text-center font-mono text-[10px] text-ink-soft">
        <Link href="/" className="hover:text-ink">
          back to sign in
        </Link>
      </p>
    </form>
  );
}

function CompleteForm({ userId, secret }: { userId: string; secret: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await completePasswordRecovery(userId, secret, password);
      setDone(true);
    } catch (err) {
      setError(friendlyAuthFlowError(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <>
        <MailCheck className="mx-auto size-10 text-accent" />
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          Your password has been updated — and this address counts as verified now.
          Sign in with the new password.
        </p>
        <Link href="/" className="btn-primary mt-6 inline-flex">
          <Home className="size-4" /> Sign in
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-left">
      <p className="text-sm leading-relaxed text-ink-soft">Choose a new password for your account.</p>
      <div>
        <label className="label" htmlFor="recover-password">
          New password
        </label>
        <input
          id="recover-password"
          type="password"
          required
          minLength={8}
          className="field"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor="recover-confirm">
          Repeat new password
        </label>
        <input
          id="recover-confirm"
          type="password"
          required
          minLength={8}
          className="field"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-marker">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        <KeyRound className="size-4" />
        {busy ? "…" : "Set new password"}
      </button>
    </form>
  );
}

function RecoverCard() {
  const params = useSearchParams();
  const userId = params.get("userId") ?? "";
  const secret = params.get("secret") ?? "";
  const completing = Boolean(userId) && Boolean(secret);
  const incomplete = !completing && (Boolean(userId) || Boolean(secret));

  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="card w-full max-w-md p-8 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
          password recovery
        </p>
        <h1 className="mt-4 font-serif text-2xl font-semibold tracking-tight">
          {completing ? "Set a new password" : "Forgot your password?"}
        </h1>

        {incomplete && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-left text-sm text-ink-soft">
            <CircleAlert className="size-4 shrink-0 text-marker" />
            This link is incomplete. Open the newest email and follow the button again.
          </p>
        )}

        {completing ? (
          <div className="mt-5">
            <CompleteForm userId={userId} secret={secret} />
          </div>
        ) : (
          !incomplete && (
            <div className="mt-5">
              <RequestForm />
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default function RecoverPage() {
  return (
    <Suspense>
      <RecoverCard />
    </Suspense>
  );
}
