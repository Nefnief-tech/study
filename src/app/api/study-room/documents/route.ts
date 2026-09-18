import { detectKind, listDocuments, saveDocument, toMeta } from "@/lib/server/storage";
import { extractText } from "@/lib/server/extract";
import { verifyUser } from "@/lib/server/auth";
import { resolveAIConfig } from "@/lib/server/ai";
import type { StudyDoc } from "@/lib/types";

export const runtime = "nodejs";

const MAX_UPLOAD = 20 * 1024 * 1024; // 20 MB

/** lists the signed-in user's document metadata + whether an AI provider is configured */
export async function GET(req: Request) {
  const user = await verifyUser(req);
  const documents = await listDocuments();
  const mine = documents.filter((d) => d.owner === user);
  return Response.json({
    configured: resolveAIConfig() !== null,
    documents: mine.map(toMeta),
  });
}

/** upload one file (multipart field "file"), extract its text, store it */
export async function POST(req: Request) {
  const user = await verifyUser(req);
  if (!user) {
    return Response.json({ error: "auth_required" }, { status: 401 });
  }
  const owner = user;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "missing_file" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD) {
    return Response.json({ error: "too_large" }, { status: 413 });
  }
  const kind = detectKind(file.name);
  if (!kind) {
    return Response.json({ error: "unsupported_type" }, { status: 415 });
  }

  let text: string;
  try {
    text = await extractText(kind, Buffer.from(await file.arrayBuffer()));
  } catch {
    return Response.json({ error: "extract_failed" }, { status: 422 });
  }
  if (text.trim().length === 0) {
    return Response.json({ error: "no_text" }, { status: 422 });
  }

  const doc = {
    id: crypto.randomUUID(),
    owner,
    name: file.name,
    kind,
    size: file.size,
    chars: text.length,
    uploadedAt: Date.now(),
    text,
    bucketFileId: ((form?.get("bucketFileId") as string) || undefined),
  };
  await saveDocument(doc);
  return Response.json(toMeta(doc));
}
