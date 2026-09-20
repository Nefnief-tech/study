"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BadgeCheck, CircleAlert, Home } from "lucide-react";
import { confirmVerification, friendlyAuthFlowError, refreshUser } from "@/lib/auth/sync";

type VerifyState = "confirming" | "done" | "error";

function VerifyCard() {
  const [state, setState] = useState<VerifyState>("confirming");
  const [message, setMessage] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const userId = params.get("userId") ?? "";
    const secret = params.get("secret") ?? "";

    const confirming = userId && secret ? confirmVerification(userId, secret) : Promise.reject(
      new Error("This link is incomplete. Open the newest email and follow the button again."),
    );

    confirming
      .then(async () => {
        setState("done");
        await refreshUser(); // updates the badge in this tab, if signed in here
      })
      .catch((err) => {
        const text = friendlyAuthFlowError(err);
        // confirming an already-verified address is a success for the user
        if (/already/i.test(text)) {
          setState("done");
          void refreshUser();
        } else {
          setState("error");
          setMessage(text);
        }
      });
  }, []);

  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="card w-full max-w-md p-8 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
          email verification
        </p>
        <h1 className="mt-4 font-serif text-2xl font-semibold tracking-tight">
          {state === "confirming" && "Confirming your email…"}
          {state === "done" && "Email verified"}
          {state === "error" && "Couldn't verify your email"}
        </h1>

        {state === "confirming" && (
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">One moment — checking the link.</p>
        )}

        {state === "done" && (
          <>
            <BadgeCheck className="mx-auto mt-4 size-10 text-accent" />
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              Your email address is confirmed. Sync, recovery mails and the daily digest
              will now reach you.
            </p>
            <Link href="/" className="btn-primary mt-6 inline-flex">
              <Home className="size-4" /> Back to Semester
            </Link>
          </>
        )}

        {state === "error" && (
          <>
            <CircleAlert className="mx-auto mt-4 size-10 text-marker" />
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{message}</p>
            <Link href="/" className="btn-ghost mt-6 inline-flex">
              <Home className="size-4" /> Back to Semester
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyCard />
    </Suspense>
  );
}
