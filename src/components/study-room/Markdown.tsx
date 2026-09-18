"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renders assistant chat content as GitHub-flavored markdown, styled to the
 * app theme. Raw HTML is never executed (react-markdown default).
 */
export default function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        "space-y-2 text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="font-display text-lg font-semibold tracking-tight" {...p} />,
          h2: (p) => <h2 className="font-display text-base font-semibold tracking-tight" {...p} />,
          h3: (p) => <h3 className="text-sm font-semibold" {...p} />,
          h4: (p) => <h4 className="text-sm font-semibold" {...p} />,
          a: (p) => (
            <a className="text-accent underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />
          ),
          ul: (p) => <ul className="ml-4 list-disc space-y-1" {...p} />,
          ol: (p) => <ol className="ml-4 list-decimal space-y-1" {...p} />,
          li: (p) => <li className="pl-1 [&>ul]:mt-1 [&>ol]:mt-1" {...p} />,
          blockquote: (p) => (
            <blockquote className="border-l-2 border-accent/50 pl-3 text-ink-soft" {...p} />
          ),
          hr: () => <hr className="border-line" />,
          table: (p) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs" {...p} />
            </div>
          ),
          th: (p) => (
            <th
              className="border border-line bg-paper px-2 py-1 text-left font-mono tracking-wide uppercase"
              {...p}
            />
          ),
          td: (p) => <td className="border border-line px-2 py-1 align-top" {...p} />,
          code: (p) => (
            <code
              className="rounded bg-paper-deep px-1 py-0.5 font-mono text-[0.85em]"
              {...p}
            />
          ),
          pre: (p) => (
            <pre
              className="overflow-x-auto rounded-lg border border-line bg-paper-deep p-3 font-mono text-xs leading-relaxed [&_code]:bg-transparent [&_code]:p-0"
              {...p}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
