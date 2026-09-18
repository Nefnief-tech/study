"use client";

import { UserRound } from "lucide-react";

/** shown when a signed-out user opens an AI panel */
export default function AuthRequiredNotice({ feature }: { feature: string }) {
  return (
    <div className="card border-dashed p-6 text-center">
      <div className="mx-auto mb-3 grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
        <UserRound className="size-4" />
      </div>
      <h3 className="font-display text-lg font-semibold tracking-tight">
        Sign in to {feature}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">
        Use <span className="font-medium">“Sign in to sync”</span> in the sidebar — AI features
        are tied to your account so your usage and documents stay private.
      </p>
    </div>
  );
}
