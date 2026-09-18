"use client";

import { KeyRound } from "lucide-react";

/** shown in place of the AI panels while no provider is configured */
export default function SetupNotice({ kind }: { kind: "flashcards" | "chat" }) {
  return (
    <div className="card border-dashed p-6">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
          <KeyRound className="size-4" />
        </div>
        <h3 className="font-display text-lg font-semibold tracking-tight">
          AI is not configured yet
        </h3>
      </div>
      <p className="text-sm leading-relaxed text-ink-soft">
        {kind === "flashcards"
          ? "Add an API key to unlock flashcard generation."
          : "Add an API key to unlock chat about your documents."}{" "}
        Any OpenAI-compatible provider works — Z.ai, DeepSeek, OpenAI, OpenRouter or a local Ollama. Create a{" "}
        <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-xs">.env.local</code> file in
        the project root:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-paper p-3 font-mono text-xs leading-relaxed text-ink-soft">
{`AI_API_KEY=your-key-here
AI_BASE_URL=https://api.z.ai/api/paas/v4
AI_MODEL=glm-4.6`}
      </pre>
      <p className="mt-3 font-mono text-[10px] tracking-wide text-ink-soft uppercase">
        then restart the dev server
      </p>
    </div>
  );
}
