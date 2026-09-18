import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DocKind, StudyDoc } from "../types";

/**
 * Extracted document text lives on the server in `.data/study-room/` — it is
 * derived data (re-created by re-uploading) and can be far larger than what
 * fits into localStorage. The client only ever sees the metadata (StudyDoc).
 */
export interface StoredDocument extends StudyDoc {
  owner: string;
  text: string;
}

const DIR = path.join(process.cwd(), ".data", "study-room");

async function ensureDir() {
  await mkdir(DIR, { recursive: true });
}

function filePath(id: string) {
  // ids are always UUIDs generated here — this keeps any path handling moot
  return path.join(DIR, `${id}.json`);
}

export async function saveDocument(doc: StoredDocument) {
  await ensureDir();
  await writeFile(filePath(doc.id), JSON.stringify(doc));
}

export async function getDocument(id: string): Promise<StoredDocument | null> {
  try {
    return JSON.parse(await readFile(filePath(id), "utf8")) as StoredDocument;
  } catch {
    return null;
  }
}

export async function listDocuments(): Promise<StoredDocument[]> {
  try {
    const files = await readdir(DIR);
    const docs = await Promise.all(
      files.filter((f) => f.endsWith(".json")).map((f) => getDocument(f.slice(0, -5))),
    );
    return docs
      .filter((d): d is StoredDocument => d !== null)
      .sort((a, b) => b.uploadedAt - a.uploadedAt);
  } catch {
    return [];
  }
}

export async function getDocuments(ids: string[]): Promise<StoredDocument[]> {
  const out: StoredDocument[] = [];
  for (const id of ids) {
    const doc = await getDocument(id);
    if (doc) out.push(doc);
  }
  return out;
}

export async function deleteDocument(id: string) {
  await unlink(filePath(id)).catch(() => {});
}

export function toMeta(doc: StoredDocument): StudyDoc {
  const { text: _text, ...meta } = doc;
  return meta;
}

export function detectKind(name: string): DocKind | null {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "pdf" || ext === "docx" || ext === "pptx" || ext === "txt" || ext === "md") return ext;
  if (ext === "markdown") return "md";
  return null;
}
