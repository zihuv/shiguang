import { existsSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { GlobalFonts } from "@napi-rs/canvas";
import type { DocumentBlock, DocumentPageModel } from "./model";

export interface RenderDocumentThumbnailOptions {
  maxEdge: number;
}

const PAGE_WIDTH = 840;
const PAGE_HEIGHT = 1188;
const PAGE_MARGIN_X = 72;
const PAGE_MARGIN_Y = 86;
const MAX_LAYOUT_BLOCKS = 48;
const CJK_FONT_FAMILY = "Shiguang Document CJK";
const DOCUMENT_FONT_STACK = `"Inter", "Segoe UI", "${CJK_FONT_FAMILY}", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
let documentFontsRegistered = false;

const CJK_FONT_CANDIDATES = [
  "/System/Library/Fonts/Hiragino Sans GB.ttc",
  "/System/Library/Fonts/STHeiti Medium.ttc",
  "/System/Library/Fonts/PingFang.ttc",
  "/Library/Fonts/Arial Unicode.ttf",
  "C:\\Windows\\Fonts\\msyh.ttc",
  "C:\\Windows\\Fonts\\simhei.ttf",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
];

interface TextStyle {
  font: string;
  color: string;
  lineHeight: number;
  marginAfter: number;
}

function ensureDocumentFonts(): void {
  if (documentFontsRegistered) {
    return;
  }

  for (const fontPath of CJK_FONT_CANDIDATES) {
    if (!existsSync(fontPath)) {
      continue;
    }
    GlobalFonts.registerFromPath(fontPath, CJK_FONT_FAMILY);
    break;
  }

  documentFontsRegistered = true;
}

function styleForBlock(block: DocumentBlock): TextStyle {
  if (block.kind === "heading") {
    return {
      font: `600 34px ${DOCUMENT_FONT_STACK}`,
      color: "#111827",
      lineHeight: 44,
      marginAfter: 20,
    };
  }

  return {
    font: `400 24px ${DOCUMENT_FONT_STACK}`,
    color: "#374151",
    lineHeight: 36,
    marginAfter: 16,
  };
}

function wrapText(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = "";

  for (const char of text.replace(/\s+/g, " ")) {
    const next = line ? `${line}${char}` : char;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line.trimEnd());
      line = char.trimStart();
    } else {
      line = next;
    }
  }

  if (line.trim()) {
    lines.push(line.trimEnd());
  }
  return lines;
}

function drawDocumentHeader(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  page: DocumentPageModel,
): void {
  const label = page.ext.toUpperCase();
  ctx.fillStyle = "#dbeafe";
  ctx.fillRect(PAGE_MARGIN_X, 42, Math.max(58, label.length * 18 + 24), 30);
  ctx.fillStyle = "#1d4ed8";
  ctx.font = '600 17px "Inter", "Segoe UI", sans-serif';
  ctx.fillText(label, PAGE_MARGIN_X + 12, 64);

  ctx.fillStyle = "#9ca3af";
  ctx.font = `400 17px ${DOCUMENT_FONT_STACK}`;
  const maxFileNameWidth = PAGE_WIDTH - PAGE_MARGIN_X * 2 - 120;
  let fileName = page.fileName;
  while (fileName.length > 4 && ctx.measureText(fileName).width > maxFileNameWidth) {
    fileName = `${fileName.slice(0, -4)}...`;
  }
  ctx.fillText(fileName, PAGE_MARGIN_X + 98, 64);
}

export function renderDocumentPageThumbnail(
  page: DocumentPageModel,
  options: RenderDocumentThumbnailOptions,
): Buffer {
  ensureDocumentFonts();

  const maxEdge = Math.max(128, Math.round(options.maxEdge));
  const scale = maxEdge / PAGE_HEIGHT;
  const canvas = createCanvas(Math.round(PAGE_WIDTH * scale), maxEdge);
  const ctx = canvas.getContext("2d");

  ctx.scale(scale, scale);
  ctx.fillStyle = "#eef2f7";
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  ctx.shadowColor = "rgba(15, 23, 42, 0.16)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(18, 18, PAGE_WIDTH - 36, PAGE_HEIGHT - 36);
  ctx.shadowColor = "transparent";

  drawDocumentHeader(ctx, page);

  let y = PAGE_MARGIN_Y + 34;
  const maxTextWidth = PAGE_WIDTH - PAGE_MARGIN_X * 2;
  const maxContentY = PAGE_HEIGHT - PAGE_MARGIN_Y;

  for (const block of page.blocks.slice(0, MAX_LAYOUT_BLOCKS)) {
    const style = styleForBlock(block);
    ctx.font = style.font;
    ctx.fillStyle = style.color;

    const lines = wrapText(ctx, block.text, maxTextWidth);
    for (const line of lines) {
      if (y + style.lineHeight > maxContentY) {
        return canvas.toBuffer("image/png");
      }
      ctx.fillText(line, PAGE_MARGIN_X, y);
      y += style.lineHeight;
    }
    y += style.marginAfter;
  }

  return canvas.toBuffer("image/png");
}
