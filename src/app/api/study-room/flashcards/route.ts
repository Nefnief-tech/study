import { getDocuments } from "@/lib/server/storage";
import { userInAiTeam, verifyUser } from "@/lib/server/auth";
import { chatCompletions, extractJson, resolveAIConfig } from "@/lib/server/ai";
import type { Flashcard } from "@/lib/types";

export const runtime = "nodejs";

const MAX_PER_DOC = 30_000;
const MAX_TOTAL = 90_000;

/** generates a flashcard deck from the given documents */
export async function POST(req: Request) {
  // signed-in users only — this route spends AI credits
  const user = await verifyUser(req);
  if (!user) return Response.json({ error: "auth_required" }, { status: 401 });

  // AI is gated to the `ai` Appwrite team — members only
  if (!(await userInAiTeam(req))) {
    return Response.json({ error: "ai_locked" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { documentIds?: string[] } | null;
  const ids = Array.isArray(body?.documentIds) ? body!.documentIds : [];
  if (ids.length === 0) {
    return Response.json({ error: "no_documents" }, { status: 400 });
  }

  const config = resolveAIConfig();
  if (!config) {
    return Response.json({ error: "not_configured" }, { status: 501 });
  }

  const docs = await getDocuments(ids);
  if (docs.length === 0) {
    return Response.json({ error: "documents_not_found" }, { status: 404 });
  }

  // stitch the material together, trimming so the prompt stays within budget
  let budget = MAX_TOTAL;
  const parts: string[] = [];
  for (const doc of docs) {
    const slice = doc.text.slice(0, Math.min(MAX_PER_DOC, budget));
    budget -= slice.length;
    parts.push(`# Document: ${doc.name}\n\n${slice}${slice.length < doc.text.length ? "\n\n[truncated]" : ""}`);
    if (budget <= 0) break;
  }
  const material = parts.join("\n\n---\n\n");

  const upstream = await chatCompletions(config, [
    {
      role: "system",
      content:
        "You create study flashcards from the student's course material. " +
        "Respond ONLY with JSON of the shape " +
        '{"title": string, "cards": [{"front": string, "back": string}]} — no prose around it. ' +
        "Create 8 to 20 cards depending on how much material there is. " +
        "Front: a question, term or prompt. Back: a precise answer, definition or explanation. " +
        "Cover the key concepts, definitions, formulas and facts; skip trivia. " +
        "Write in the same language as the material.",
    },
    { role: "user", content: `Material:\n\n${material}` },
  ]);

  if (!upstream.ok) {
    return Response.json(
      { error: "ai_error", detail: (await upstream.text()).slice(0, 300) },
      { status: 502 },
    );
  }

  const raw = (await upstream.json().catch(() => null))?.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson<{ title?: string; cards?: Array<{ front?: string; back?: string }> }>(raw ?? "");
  const cards = (parsed?.cards ?? [])
    .filter((c) => typeof c.front === "string" && typeof c.back === "string" && c.front.trim() && c.back.trim())
    .slice(0, 40)
    .map((c) => ({ id: crypto.randomUUID(), front: c.front!.trim(), back: c.back!.trim() }));

  if (cards.length === 0) {
    return Response.json({ error: "generation_failed" }, { status: 502 });
  }

  return Response.json({
    title: typeof parsed?.title === "string" && parsed.title.trim() ? parsed.title.trim() : `Deck · ${docs.length} ${docs.length === 1 ? "document" : "documents"}`,
    cards,
  } satisfies { title: string; cards: Flashcard[] });
}
