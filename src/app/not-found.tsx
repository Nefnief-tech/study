import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="grid min-h-[72vh] place-items-center px-4">
      <div className="max-w-md text-center">
        <p className="label">404 · page not found</p>
        <h1 className="mt-3 font-display text-5xl leading-[1.05] font-semibold tracking-tight">
          This desk is <em className="text-accent italic">empty</em>.
        </h1>
        <p className="mx-auto mt-5 max-w-[42ch] leading-relaxed text-ink-soft">
          The page you&apos;re looking for isn&apos;t here. It may have been
          moved, renamed, or it never made it onto the plan.
        </p>
        <Link href="/" className="btn-primary mt-8 inline-flex">
          <ArrowLeft className="size-4" />
          Back to your desk
        </Link>
      </div>
    </div>
  );
}
