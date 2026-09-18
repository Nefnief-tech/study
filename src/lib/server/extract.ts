import JSZip from "jszip";
import type { DocKind } from "../types";

const MAX_CHARS = 200_000;

function unescapeXml(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalize(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, MAX_CHARS);
}

async function pdfText(buf: Buffer) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  const raw = Array.isArray(text) ? text.join("\n\n") : text;
  // pdf.js leaves escape artifacts for (), \ and some quotes — clean the common ones
  return raw.replace(/\\([()\\[\]{}])/g, "$1").replace(/[‘’]/g, "'");
}

async function docxText(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return "";
  return xml
    .split(/<\/w:p>/)
    .map((p) =>
      Array.from(p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g))
        .map((m) => unescapeXml(m[1]))
        .join(""),
    )
    .filter((p) => p.trim().length > 0)
    .join("\n");
}

async function pptxText(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => (Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0])));
  const out: string[] = [];
  for (const [i, name] of slides.entries()) {
    const xml = await zip.file(name)!.async("string");
    const texts = Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map((m) => unescapeXml(m[1]));
    if (texts.length > 0) out.push(`--- Slide ${i + 1} ---\n${texts.join("\n")}`);
  }
  return out.join("\n\n");
}

export async function extractText(kind: DocKind, buf: Buffer): Promise<string> {
  let text: string;
  switch (kind) {
    case "pdf":
      text = await pdfText(buf);
      break;
    case "docx":
      text = await docxText(buf);
      break;
    case "pptx":
      text = await pptxText(buf);
      break;
    default:
      text = buf.toString("utf8");
  }
  return normalize(text);
}
