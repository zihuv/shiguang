import { TextDecoder } from "node:util";
import { extractWordBinaryText } from "./doc-binary";
import { readZipEntry } from "./zip";
import {
  createDocumentPageModel,
  decodeXmlEntities,
  normalizeDocumentText,
  textToDocumentBlocks,
  type DocumentBlock,
  type DocumentPageModel,
} from "./model";

export interface ExtractDocumentPageOptions {
  fileName: string;
}

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: false });
const LATIN1_DECODER = new TextDecoder("latin1", { fatal: false });

function stripXmlTags(fragment: string): string {
  return decodeXmlEntities(fragment.replace(/<[^>]+>/g, ""));
}

function extractDocxTextFromParagraph(fragment: string): string {
  const prepared = fragment.replace(/<w:tab\b[^>]*\/>/g, "\t").replace(/<w:br\b[^>]*\/>/g, "\n");
  const textRuns = [...prepared.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) =>
    decodeXmlEntities(match[1] ?? ""),
  );
  return normalizeDocumentText(textRuns.length > 0 ? textRuns.join("") : stripXmlTags(prepared));
}

function extractDocxBlocks(buffer: Buffer): DocumentBlock[] {
  const documentXml = readZipEntry(buffer, "word/document.xml");
  if (!documentXml) {
    return [];
  }

  const xml = UTF8_DECODER.decode(documentXml);
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map((match): DocumentBlock | null => {
      const fragment = match[0];
      const text = extractDocxTextFromParagraph(fragment);
      if (!text) {
        return null;
      }
      const kind = /<w:pStyle\b[^>]*w:val="(?:Title|Heading[1-6])"/i.test(fragment)
        ? "heading"
        : "paragraph";
      return { kind, text };
    })
    .filter((block): block is DocumentBlock => block !== null);
}

function extractOdtBlocks(buffer: Buffer): DocumentBlock[] {
  const contentXml = readZipEntry(buffer, "content.xml");
  if (!contentXml) {
    return [];
  }

  const xml = UTF8_DECODER.decode(contentXml)
    .replace(/<text:tab\b[^>]*\/>/g, "\t")
    .replace(/<text:line-break\b[^>]*\/>/g, "\n");

  return [...xml.matchAll(/<(text:h|text:p)\b[^>]*>([\s\S]*?)<\/(?:text:h|text:p)>/g)]
    .map((match): DocumentBlock | null => {
      const text = normalizeDocumentText(stripXmlTags(match[2] ?? ""));
      if (!text) {
        return null;
      }
      return { kind: match[1] === "text:h" ? "heading" : "paragraph", text };
    })
    .filter((block): block is DocumentBlock => block !== null);
}

function extractPptxBlocks(buffer: Buffer): DocumentBlock[] {
  const slideXml = readZipEntry(buffer, "ppt/slides/slide1.xml");
  if (!slideXml) {
    return [];
  }

  const xml = UTF8_DECODER.decode(slideXml);
  const lines = [...xml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)]
    .map((match) => normalizeDocumentText(decodeXmlEntities(match[1] ?? "")))
    .filter((text) => text.length > 0);

  return lines.map((text, index) => ({
    kind: index === 0 ? "heading" : "paragraph",
    text,
  }));
}

function decodeRtfEscapedText(input: string): string {
  return input
    .replace(/\\'[0-9a-fA-F]{2}/g, (match) =>
      LATIN1_DECODER.decode(Buffer.from([Number.parseInt(match.slice(2), 16)])),
    )
    .replace(/\\u(-?\d+)\??/g, (_, rawCode: string) => {
      const code = Number.parseInt(rawCode, 10);
      return String.fromCharCode(code < 0 ? code + 65536 : code);
    });
}

function stripRtf(input: string): string {
  return normalizeDocumentText(
    decodeRtfEscapedText(input)
      .replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|pict)[\s\S]*?\}/g, " ")
      .replace(/\\par[d]?/g, "\n")
      .replace(/\\line/g, "\n")
      .replace(/\\tab/g, "\t")
      .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
      .replace(/\\[{}\\]/g, (match) => match.slice(1))
      .replace(/[{}]/g, " "),
  );
}

function stripHtml(input: string): string {
  return normalizeDocumentText(
    decodeXmlEntities(
      input
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<\/(?:h[1-6]|p|li|tr|div|section|article)>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<td\b[^>]*>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

export function extractDocumentPage(
  buffer: Buffer,
  ext: string,
  options: ExtractDocumentPageOptions,
): DocumentPageModel {
  const normalizedExt = ext.trim().replace(/^\./, "").toLowerCase();
  let blocks: DocumentBlock[] = [];

  try {
    if (normalizedExt === "docx") {
      blocks = extractDocxBlocks(buffer);
    } else if (normalizedExt === "odt") {
      blocks = extractOdtBlocks(buffer);
    } else if (normalizedExt === "pptx" || normalizedExt === "ppsx") {
      blocks = extractPptxBlocks(buffer);
    } else if (normalizedExt === "odp") {
      blocks = extractOdtBlocks(buffer);
    } else if (normalizedExt === "rtf") {
      blocks = textToDocumentBlocks(stripRtf(LATIN1_DECODER.decode(buffer)));
    } else if (normalizedExt === "html" || normalizedExt === "htm") {
      blocks = textToDocumentBlocks(stripHtml(buffer.toString("utf8")));
    } else if (normalizedExt === "doc") {
      blocks = textToDocumentBlocks(extractWordBinaryText(buffer));
    } else {
      blocks = textToDocumentBlocks(buffer.toString("utf8"));
    }
  } catch {
    blocks = [];
  }

  return createDocumentPageModel(options.fileName, normalizedExt, blocks);
}
