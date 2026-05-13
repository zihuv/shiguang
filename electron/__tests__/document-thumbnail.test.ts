import zlib from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  extractDocumentPage,
  isHighFidelityDocxThumbnailExt,
  renderDocumentPageThumbnail,
} from "../document-thumbnail";
import { extractWordBinaryTextFromStreams } from "../document-thumbnail/doc-binary";
import { readZipEntry } from "../document-thumbnail/zip";

function createZip(entries: Record<string, string>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, contents] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name);
    const source = Buffer.from(contents);
    const compressed = zlib.deflateRawSync(source);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(source.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);

    localParts.push(localHeader, nameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(source.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

describe("document thumbnails", () => {
  it("routes docx to the high fidelity renderer only", () => {
    expect(isHighFidelityDocxThumbnailExt("docx")).toBe(true);
    expect(isHighFidelityDocxThumbnailExt(".DOCX")).toBe(true);
    expect(isHighFidelityDocxThumbnailExt("doc")).toBe(false);
    expect(isHighFidelityDocxThumbnailExt("pptx")).toBe(false);
  });

  it("reads deflated zip entries without external dependencies", () => {
    const zip = createZip({ "word/document.xml": "<document>hello</document>" });

    expect(readZipEntry(zip, "word/document.xml")?.toString("utf8")).toBe(
      "<document>hello</document>",
    );
  });

  it("extracts docx paragraphs into a page model", () => {
    const zip = createZip({
      "word/document.xml": `
        <w:document>
          <w:body>
            <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>项目计划</w:t></w:r></w:p>
            <w:p><w:r><w:t>第一段 &amp; 重要信息</w:t></w:r></w:p>
          </w:body>
        </w:document>
      `,
    });

    const page = extractDocumentPage(zip, "docx", { fileName: "plan.docx" });

    expect(page.blocks).toEqual([
      { kind: "heading", text: "项目计划" },
      { kind: "paragraph", text: "第一段 & 重要信息" },
    ]);
  });

  it("extracts odt paragraphs into the same page model", () => {
    const zip = createZip({
      "content.xml": `
        <office:document-content>
          <office:text>
            <text:h>会议纪要</text:h>
            <text:p>待办事项</text:p>
          </office:text>
        </office:document-content>
      `,
    });

    const page = extractDocumentPage(zip, "odt", { fileName: "notes.odt" });

    expect(page.blocks).toEqual([
      { kind: "heading", text: "会议纪要" },
      { kind: "paragraph", text: "待办事项" },
    ]);
  });

  it("extracts pptx first slide text into the shared page model", () => {
    const zip = createZip({
      "ppt/slides/slide1.xml": `
        <p:sld>
          <p:cSld>
            <p:spTree>
              <a:t>第一页标题</a:t>
              <a:t>展示重点</a:t>
            </p:spTree>
          </p:cSld>
        </p:sld>
      `,
    });

    const page = extractDocumentPage(zip, "pptx", { fileName: "deck.pptx" });

    expect(page.blocks).toEqual([
      { kind: "heading", text: "第一页标题" },
      { kind: "paragraph", text: "展示重点" },
    ]);
  });

  it("extracts rtf latin1 text without falling back to icons", () => {
    const rtfPage = extractDocumentPage(
      Buffer.from("{\\rtf1\\ansi caf\xe9\\par body}", "latin1"),
      "rtf",
      {
        fileName: "draft.rtf",
      },
    );

    expect(rtfPage.blocks.map((block) => block.text).join("\n")).toContain("café");
  });

  it("extracts binary doc text from the Word piece table", () => {
    const text = "企业项目实践报告";
    const textOffset = 0x0200;
    const wordDocument = Buffer.alloc(textOffset + Buffer.byteLength(text, "utf16le"));
    wordDocument.writeUInt16LE(0x0804, 0x06);
    wordDocument.writeUInt16LE(0, 0x0a);
    wordDocument.writeUInt32LE(0, 0x01a2);

    const pieceTable = Buffer.alloc(16);
    pieceTable.writeUInt32LE(0, 0);
    pieceTable.writeUInt32LE(text.length, 4);
    pieceTable.writeUInt32LE(0, 8);
    pieceTable.writeUInt32LE(textOffset, 10);
    const clx = Buffer.concat([Buffer.from([2]), Buffer.alloc(4), pieceTable]);
    clx.writeUInt32LE(pieceTable.length, 1);
    wordDocument.writeUInt32LE(clx.length, 0x01a6);
    wordDocument.write(text, textOffset, "utf16le");

    const extracted = extractWordBinaryTextFromStreams(
      new Map([
        ["WordDocument", wordDocument],
        ["0Table", clx],
      ]),
    );

    expect(extracted).toBe(text);
  });

  it("uses a document-style fallback for unparseable binary doc files", () => {
    const page = extractDocumentPage(Buffer.from("not a compound document"), "doc", {
      fileName: "legacy.doc",
    });

    expect(page.blocks).toEqual([
      { kind: "heading", text: "legacy.doc" },
      { kind: "paragraph", text: "DOC 文档" },
    ]);
  });

  it("extracts html text into the shared page model", () => {
    const page = extractDocumentPage(
      Buffer.from("<h1>首页标题</h1><p>第一段内容 &amp; 细节</p>"),
      "html",
      { fileName: "page.html" },
    );

    expect(page.blocks.map((block) => block.text)).toEqual(["首页标题", "第一段内容 & 细节"]);
  });

  it("uses a document-style fallback when extraction yields no blocks", () => {
    const page = extractDocumentPage(Buffer.from("not a zip archive"), "docx", {
      fileName: "broken.docx",
    });

    expect(page.blocks).toEqual([
      { kind: "heading", text: "broken.docx" },
      { kind: "paragraph", text: "DOCX 文档" },
    ]);
  });

  it("renders a unified document page thumbnail", async () => {
    const thumbnail = renderDocumentPageThumbnail(
      {
        ext: "docx",
        fileName: "plan.docx",
        blocks: [
          { kind: "heading", text: "项目计划" },
          { kind: "paragraph", text: "这是一段用于验证文档首页缩略图渲染的正文。" },
        ],
      },
      { maxEdge: 256 },
    );
    const metadata = await sharp(thumbnail).metadata();

    expect(thumbnail.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(metadata.height).toBe(256);
    expect(metadata.width).toBeGreaterThan(120);
  });
});
