import { TextDecoder } from "node:util";
import { readCompoundFileStreams } from "./cfb";
import { normalizeDocumentText } from "./model";

const GB18030_DECODER = new TextDecoder("gb18030", { fatal: false });
const WINDOWS_1252_DECODER = new TextDecoder("windows-1252", { fatal: false });
const CELL_MARK = String.fromCharCode(7);

function isCjkLanguage(lid: number): boolean {
  return (
    lid === 0x0804 ||
    lid === 0x0404 ||
    lid === 0x0c04 ||
    lid === 0x1004 ||
    lid === 0x0411 ||
    lid === 0x0412
  );
}

function decodeCompressedWordText(buffer: Buffer, lid: number): string {
  const decoder = isCjkLanguage(lid) ? GB18030_DECODER : WINDOWS_1252_DECODER;
  return decoder.decode(buffer);
}

function cleanWordText(input: string): string {
  return normalizeDocumentText(
    Array.from(input)
      .filter((char) => {
        const code = char.charCodeAt(0);
        return code >= 32 || code === 7 || code === 9 || code === 10 || code === 13;
      })
      .join("")
      .split(CELL_MARK)
      .join("\t")
      .replace(/\r/g, "\n"),
  );
}

export function extractWordBinaryTextFromStreams(streams: Map<string, Buffer>): string {
  const wordDocument = streams.get("WordDocument");
  if (!wordDocument || wordDocument.length < 0x1aa) {
    return "";
  }

  const lid = wordDocument.readUInt16LE(0x06);
  const flags = wordDocument.readUInt16LE(0x0a);
  const tableStream = streams.get((flags & 0x0200) !== 0 ? "1Table" : "0Table");
  if (!tableStream) {
    return "";
  }

  const fcClx = wordDocument.readUInt32LE(0x01a2);
  const lcbClx = wordDocument.readUInt32LE(0x01a6);
  if (lcbClx <= 0 || fcClx + lcbClx > tableStream.length) {
    return "";
  }

  const clx = tableStream.subarray(fcClx, fcClx + lcbClx);
  let offset = 0;
  while (offset < clx.length) {
    const type = clx.readUInt8(offset);
    offset += 1;

    if (type === 1) {
      if (offset + 2 > clx.length) {
        return "";
      }
      const cbGrpprl = clx.readUInt16LE(offset);
      offset += 2 + cbGrpprl;
      continue;
    }

    if (type !== 2 || offset + 4 > clx.length) {
      return "";
    }

    const pieceTableLength = clx.readUInt32LE(offset);
    offset += 4;
    const pieceTable = clx.subarray(offset, offset + pieceTableLength);
    if (pieceTable.length < 16 || (pieceTable.length - 4) % 12 !== 0) {
      return "";
    }

    const pieceCount = (pieceTable.length - 4) / 12;
    const pcdOffset = (pieceCount + 1) * 4;
    const parts: string[] = [];

    for (let index = 0; index < pieceCount; index += 1) {
      const cpStart = pieceTable.readUInt32LE(index * 4);
      const cpEnd = pieceTable.readUInt32LE((index + 1) * 4);
      const charCount = cpEnd - cpStart;
      if (charCount <= 0) {
        continue;
      }

      const pcd = pcdOffset + index * 8;
      const rawFc = pieceTable.readUInt32LE(pcd + 2);
      const compressed = (rawFc & 0x40000000) !== 0;
      const fileOffset = compressed ? (rawFc & 0x3fffffff) / 2 : rawFc;
      const byteLength = compressed ? charCount : charCount * 2;
      if (fileOffset < 0 || fileOffset + byteLength > wordDocument.length) {
        continue;
      }

      const bytes = wordDocument.subarray(fileOffset, fileOffset + byteLength);
      parts.push(compressed ? decodeCompressedWordText(bytes, lid) : bytes.toString("utf16le"));
    }

    return cleanWordText(parts.join(""));
  }

  return "";
}

export function extractWordBinaryText(buffer: Buffer): string {
  try {
    const streams = readCompoundFileStreams(buffer);
    return extractWordBinaryTextFromStreams(streams);
  } catch {
    return "";
  }
}
