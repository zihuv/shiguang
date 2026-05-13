export type DocumentBlockKind = "heading" | "paragraph";

export interface DocumentBlock {
  kind: DocumentBlockKind;
  text: string;
}

export interface DocumentPageModel {
  fileName: string;
  ext: string;
  blocks: DocumentBlock[];
}

const MAX_BLOCKS = 80;
const MAX_TEXT_LENGTH = 8_000;

export function normalizeDocumentText(input: string): string {
  return input
    .split(String.fromCharCode(0))
    .join("")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function decodeXmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (entity, value: string) => {
    if (value[0] === "#") {
      const radix = value[1]?.toLowerCase() === "x" ? 16 : 10;
      const raw = radix === 16 ? value.slice(2) : value.slice(1);
      const codePoint = Number.parseInt(raw, radix);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }

    switch (value) {
      case "amp":
        return "&";
      case "apos":
        return "'";
      case "gt":
        return ">";
      case "lt":
        return "<";
      case "nbsp":
        return " ";
      case "quot":
        return '"';
      default:
        return entity;
    }
  });
}

export function textToDocumentBlocks(input: string, heading?: string): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  if (heading) {
    blocks.push({ kind: "heading", text: normalizeDocumentText(heading) });
  }

  for (const paragraph of normalizeDocumentText(input).split(/\n{2,}|\n/)) {
    const text = paragraph.trim();
    if (text) {
      blocks.push({ kind: "paragraph", text });
    }
    if (blocks.length >= MAX_BLOCKS) {
      break;
    }
  }

  return blocks;
}

export function createDocumentPageModel(
  fileName: string,
  ext: string,
  blocks: DocumentBlock[],
): DocumentPageModel {
  const normalizedBlocks = blocks
    .map((block) => ({
      kind: block.kind,
      text: normalizeDocumentText(block.text).slice(0, MAX_TEXT_LENGTH),
    }))
    .filter((block) => block.text.length > 0)
    .slice(0, MAX_BLOCKS);

  if (normalizedBlocks.length === 0) {
    normalizedBlocks.push({ kind: "heading", text: fileName || `${ext.toUpperCase()} document` });
    normalizedBlocks.push({ kind: "paragraph", text: `${ext.toUpperCase()} 文档` });
  }

  return {
    fileName,
    ext,
    blocks: normalizedBlocks,
  };
}
