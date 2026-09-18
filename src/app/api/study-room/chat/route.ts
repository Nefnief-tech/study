import { getDocuments } from "@/lib/server/storage";
import { verifyUser } from "@/lib/server/auth";
import { chatCompletions, resolveAIConfig, streamContent, type LLMMessage } from "@/lib/server/ai";
import { appwriteConfigured } from "@/lib/auth/appwrite";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";

const MAX_PER_DOC = 30_000;
const MAX_TOTAL = 90_000;
const MAX_HISTORY = 16;

/** streaming chat grounded in the selected documents — responds with plain text deltas */
export async function POST(req: Request) {
  // signed-in users only — this route spends AI credits
  if (appwriteConfigured) {
    const user = await verifyUser(req);
    if (!user) return Response.json({ error: "auth_required" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { messages?: ChatMessage[]; documentIds?: string[] }
    | null;
  const history = Array.isArray(body?.messages) ? body!.messages : [];
  const ids = Array.isArray(body?.documentIds) ? body!.documentIds : [];
  if (history.length === 0) {
    return Response.json({ error: "no_messages" }, { status: 400 });
  }

  const config = resolveAIConfig();
  if (!config) {
    return Response.json({ error: "not_configured" }, { status: 501 });
  }

  let context = "";
  const sourceNames: string[] = [];
  if (ids.length > 0) {
    const docs = await getDocuments(ids);
    let budget = MAX_TOTAL;
    const parts: string[] = [];
    for (const doc of docs) {
      const slice = doc.text.slice(0, Math.min(MAX_PER_DOC, budget));
      budget -= slice.length;
      parts.push(`# Document: ${doc.name}\n\n${slice}${slice.length < doc.text.length ? "\n\n[truncated]" : ""}`);
      sourceNames.push(doc.name);
      if (budget <= 0) break;
    }
    context = parts.join("\n\n---\n\n");
  }

  const messages: LLMMessage[] = [
    {
      role: "system",
      content:
        "You are the study assistant inside a student's study app. Answer clearly and concretely. " +
        (context
          ? `Base your answers on the student's uploaded documents below and cite the document name when you use one. ` +
            `If the documents don't contain the answer, say so and answer from general knowledge, marking it clearly.\n\n` +
            `=== STUDENT DOCUMENTS ===\n${context}\n=== END DOCUMENTS ===\n`
          : "No documents are attached — answer from general knowledge and suggest uploading material if it would help. ") +
        "Answer in the language the student writes in. Use markdown sparingly (short lists, inline code).",
    },
    ...history.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content })),
  ];

  const upstream = await chatCompletions(config, messages, { stream: true }).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) {
    const detail = upstream ? (await upstream.text().catch(() => "")).slice(0, 300) : "provider unreachable";
    return Response.json({ error: "ai_error", detail }, { status: 502 });
  }

  // prefix frame carries the source names, then pure text deltas follow
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify({ sources: sourceNames }) + "\n"));
      try {
        for await (const delta of streamContent(upstream)) {
          controller.enqueue(encoder.encode(delta));
        }
      } catch {
        controller.enqueue(encoder.encode("\n\n[connection to the AI provider was interrupted]"));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
