"use client";

import { UserRound } from "lucide-react";
import AccountPanel from "@/components/auth/AccountPanel";

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="flex items-center gap-3 font-display text-4xl font-semibold tracking-tight">
        Account
        <UserRound className="size-5 text-accent" />
      </h1>
      <p className="mt-1 font-mono text-xs tracking-wide text-ink-soft">
        sign in, two-factor & sync — credentials live with your Appwrite project
      </p>

      <div className="mt-6 rounded-2xl border border-line bg-card px-5 py-5">
        <AccountPanel />
      </div>
    </div>
  );
}
