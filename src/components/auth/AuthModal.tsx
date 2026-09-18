"use client";

import { useEffect, useState } from "react";
import { CloudOff, LogOut, RefreshCcw, UserRound } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth";
import { signIn, signOut, signUp, syncNow } from "@/lib/auth/sync";
import Modal from "@/components/ui/Modal";
import { cn, formatClock } from "@/lib/utils";

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

  useEffect(() => {
    if (open) {
      setError("");
      setBusy(false);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") await signUp(name.trim(), email.trim(), password);
      else await signIn(email.trim(), password);
      setPassword("");
    } catch (err) {
      setError((err as Error).message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const signedIn = status === "signed-in" && user;

  return (
    <Modal open={open} onClose={onClose} title={signedIn ? "Account" : "Sign in to sync"}>
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

      {!signedIn && status !== "loading" && (
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
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "register" && (
              <p className="mt-1 font-mono text-[10px] text-ink-soft">at least 8 characters</p>
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
