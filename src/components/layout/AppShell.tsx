"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Calculator,
  LayoutDashboard,
  Sparkles,
  SquareCheckBig,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import { cn, formatClock } from "@/lib/utils";
import { initSync, signOut } from "@/lib/auth/sync";
import { pingAppwrite } from "@/lib/auth/appwrite";
import { useAuthStore } from "@/lib/store/auth";
import ThemeToggle from "@/components/ui/ThemeToggle";
import AuthModal from "@/components/auth/AuthModal";

const NAV: Array<{ href: Route; label: string; icon: LucideIcon }> = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/todos", label: "Tasks", icon: SquareCheckBig },
  { href: "/homework", label: "Homework", icon: BookOpen },
  { href: "/grades", label: "Grades", icon: Calculator },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/study-room", label: "Study Room", icon: Sparkles },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [authOpen, setAuthOpen] = useState(false);
  const auth = useAuthStore();

  useEffect(() => {
    void initSync();
    pingAppwrite()
      .then((pong) => console.log("[Appwrite] ping ✓", pong))
      .catch((e) => console.warn("[Appwrite] ping failed:", e?.message ?? e));
  }, []);

  const current = NAV.find((n) => isActive(pathname, n.href));

  const syncLabel =
    auth.status === "loading"
      ? "checking session…"
      : !auth.online
        ? "offline — saved locally"
        : auth.syncing
          ? "syncing…"
          : auth.syncError
            ? "sync error"
            : auth.lastSyncedAt
              ? `synced · ${formatClock(auth.lastSyncedAt)}`
              : "not synced yet";

  return (
    <div className="min-h-dvh">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-paper px-5 py-7 md:flex">
        <Link href="/" className="group mb-8 block">
          <span className="font-display text-[26px] leading-none font-semibold tracking-tight">
            Semester
            <span className="text-accent">.</span>
          </span>
          <span className="mt-1 block font-mono text-[10px] tracking-[0.22em] text-ink-soft uppercase">
            the study desk
          </span>
        </Link>

        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-ink font-medium text-paper"
                    : "text-ink-soft hover:bg-ink/5 hover:text-ink",
                )}
              >
                <Icon className="size-4" strokeWidth={active ? 2.2 : 2} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3 border-t border-line pt-4">
          {auth.status === "unconfigured" ? (
            <div className="flex items-start justify-between gap-3">
              <p className="font-mono text-[10px] leading-relaxed text-ink-soft">
                Data lives in your browser
                <br />
                (localStorage) — nothing
                <br />
                leaves this device.
              </p>
              <ThemeToggle />
            </div>
          ) : auth.status === "signed-in" && auth.user ? (
            <div className="space-y-2.5">
              <button
                onClick={() => setAuthOpen(true)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-ink/5"
              >
                <div className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                  <UserRound className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{auth.user.email}</p>
                  <p
                    className={cn(
                      "font-mono text-[10px]",
                      auth.syncError ? "text-marker" : "text-ink-soft",
                    )}
                  >
                    {syncLabel}
                  </p>
                </div>
              </button>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => void signOut()}
                  className="cursor-pointer font-mono text-[10px] tracking-wide text-ink-soft uppercase transition-colors hover:text-marker"
                >
                  sign out
                </button>
                <ThemeToggle />
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <button className="btn-ghost flex-1" onClick={() => setAuthOpen(true)}>
                <UserRound className="size-4" />
                {auth.status === "loading" ? "checking…" : "Sign in to sync"}
              </button>
              <ThemeToggle />
            </div>
          )}
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-paper/90 px-4 backdrop-blur md:hidden">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight">
          Semester<span className="text-accent">.</span>
        </Link>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[11px] tracking-[0.18em] text-ink-soft uppercase">
            {current?.label ?? "Overview"}
          </span>
          {auth.status !== "unconfigured" && (
            <button
              onClick={() => setAuthOpen(true)}
              aria-label="Account"
              className={cn(
                "relative grid size-8 cursor-pointer place-items-center rounded-lg transition-colors hover:bg-ink/5",
                auth.status === "signed-in" ? "text-accent" : "text-ink-soft",
              )}
            >
              <UserRound className="size-4" />
              {auth.status === "signed-in" && (
                <span
                  className={cn(
                    "absolute right-1 top-1 size-1.5 rounded-full",
                    auth.syncing || auth.syncError ? "bg-marker" : "bg-accent",
                  )}
                />
              )}
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* content on a faint planner grid */}
      <main className="md:pl-60">
        <div className="mx-auto max-w-6xl px-4 pt-6 pb-28 md:px-10 md:pt-10 md:pb-16">
          <div className="bg-[radial-gradient(var(--color-grid)_1px,transparent_1.5px)] [background-size:22px_22px]">
            {children}
          </div>
        </div>
      </main>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-paper/95 backdrop-blur md:hidden">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] transition-colors",
                active ? "font-medium text-accent" : "text-ink-soft",
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
              {label.split(" ")[0]}
            </Link>
          );
        })}
      </nav>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
