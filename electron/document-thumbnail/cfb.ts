const CFB_SIGNATURE = "d0cf11e0a1b11ae1";
const FREE_SECTOR = 0xffffffff;
const END_OF_CHAIN = 0xfffffffe;
const DIFAT_SECTOR = 0xfffffffc;
const FAT_SECTOR = 0xfffffffd;

interface CfbHeader {
  sectorSize: number;
  miniSectorSize: number;
  firstDirectorySector: number;
  miniStreamCutoffSize: number;
  firstMiniFatSector: number;
  miniFatSectorCount: number;
  firstDifatSector: number;
  difatSectorCount: number;
  difat: number[];
}

interface CfbDirectoryEntry {
  name: string;
  type: number;
  startSector: number;
  size: number;
}

interface CfbContext {
  buffer: Buffer;
  header: CfbHeader;
  fat: number[];
  miniFat: number[];
  miniStream: Buffer;
  entries: CfbDirectoryEntry[];
}

function sectorOffset(sector: number, sectorSize: number): number {
  return (sector + 1) * sectorSize;
}

function readHeader(buffer: Buffer): CfbHeader {
  if (buffer.subarray(0, 8).toString("hex") !== CFB_SIGNATURE) {
    throw new Error("Invalid CFB file signature");
  }

  const sectorSize = 1 << buffer.readUInt16LE(0x1e);
  const miniSectorSize = 1 << buffer.readUInt16LE(0x20);
  const difat: number[] = [];
  for (let offset = 0x4c; offset < 0x200; offset += 4) {
    const sector = buffer.readUInt32LE(offset);
    if (sector !== FREE_SECTOR) {
      difat.push(sector);
    }
  }

  return {
    sectorSize,
    miniSectorSize,
    firstDirectorySector: buffer.readUInt32LE(0x30),
    miniStreamCutoffSize: buffer.readUInt32LE(0x38),
    firstMiniFatSector: buffer.readUInt32LE(0x3c),
    miniFatSectorCount: buffer.readUInt32LE(0x40),
    firstDifatSector: buffer.readUInt32LE(0x44),
    difatSectorCount: buffer.readUInt32LE(0x48),
    difat,
  };
}

function readSector(buffer: Buffer, header: CfbHeader, sector: number): Buffer {
  const offset = sectorOffset(sector, header.sectorSize);
  return buffer.subarray(offset, offset + header.sectorSize);
}

function readFat(buffer: Buffer, header: CfbHeader): number[] {
  const difat = [...header.difat];
  let difatSector = header.firstDifatSector;

  for (
    let index = 0;
    index < header.difatSectorCount && difatSector !== END_OF_CHAIN && difatSector !== FREE_SECTOR;
    index += 1
  ) {
    const sector = readSector(buffer, header, difatSector);
    for (let offset = 0; offset < header.sectorSize - 4; offset += 4) {
      const fatSector = sector.readUInt32LE(offset);
      if (fatSector !== FREE_SECTOR) {
        difat.push(fatSector);
      }
    }
    difatSector = sector.readUInt32LE(header.sectorSize - 4);
  }

  const fat: number[] = [];
  for (const fatSector of difat) {
    if (fatSector === FREE_SECTOR || fatSector === END_OF_CHAIN) {
      continue;
    }
    const sector = readSector(buffer, header, fatSector);
    for (let offset = 0; offset < header.sectorSize; offset += 4) {
      fat.push(sector.readUInt32LE(offset));
    }
  }
  return fat;
}

function readChain(
  buffer: Buffer,
  header: CfbHeader,
  fat: number[],
  startSector: number,
  size?: number,
): Buffer {
  if (startSector === END_OF_CHAIN || startSector === FREE_SECTOR) {
    return Buffer.alloc(0);
  }

  const sectors: Buffer[] = [];
  const visited = new Set<number>();
  let sector = startSector;

  while (
    sector !== END_OF_CHAIN &&
    sector !== FREE_SECTOR &&
    sector !== FAT_SECTOR &&
    sector !== DIFAT_SECTOR &&
    !visited.has(sector)
  ) {
    visited.add(sector);
    sectors.push(readSector(buffer, header, sector));
    sector = fat[sector] ?? END_OF_CHAIN;
  }

  const result = Buffer.concat(sectors);
  return typeof size === "number" ? result.subarray(0, size) : result;
}

function readDirectoryEntries(directoryStream: Buffer): CfbDirectoryEntry[] {
  const entries: CfbDirectoryEntry[] = [];
  for (let offset = 0; offset + 128 <= directoryStream.length; offset += 128) {
    const nameLength = directoryStream.readUInt16LE(offset + 64);
    const rawNameLength = Math.max(0, nameLength - 2);
    const name = directoryStream.toString("utf16le", offset, offset + rawNameLength);
    const type = directoryStream.readUInt8(offset + 66);
    const startSector = directoryStream.readUInt32LE(offset + 116);
    const size = Number(directoryStream.readBigUInt64LE(offset + 120));
    if (name && type !== 0) {
      entries.push({ name, type, startSector, size });
    }
  }
  return entries;
}

function readMiniFat(context: Pick<CfbContext, "buffer" | "header" | "fat">): number[] {
  const { buffer, header, fat } = context;
  if (header.firstMiniFatSector === END_OF_CHAIN || header.miniFatSectorCount === 0) {
    return [];
  }

  const miniFatStream = readChain(buffer, header, fat, header.firstMiniFatSector);
  const miniFat: number[] = [];
  for (let offset = 0; offset + 4 <= miniFatStream.length; offset += 4) {
    miniFat.push(miniFatStream.readUInt32LE(offset));
  }
  return miniFat;
}

function readMiniStream(
  context: Pick<CfbContext, "buffer" | "header" | "fat" | "entries">,
): Buffer {
  const root = context.entries.find((entry) => entry.type === 5);
  if (!root) {
    return Buffer.alloc(0);
  }
  return readChain(context.buffer, context.header, context.fat, root.startSector, root.size);
}

function readMiniChain(context: CfbContext, startSector: number, size: number): Buffer {
  const chunks: Buffer[] = [];
  const visited = new Set<number>();
  let sector = startSector;

  while (sector !== END_OF_CHAIN && sector !== FREE_SECTOR && !visited.has(sector)) {
    visited.add(sector);
    const offset = sector * context.header.miniSectorSize;
    chunks.push(context.miniStream.subarray(offset, offset + context.header.miniSectorSize));
    sector = context.miniFat[sector] ?? END_OF_CHAIN;
  }

  return Buffer.concat(chunks).subarray(0, size);
}

function createCfbContext(buffer: Buffer): CfbContext {
  const header = readHeader(buffer);
  const fat = readFat(buffer, header);
  const directoryStream = readChain(buffer, header, fat, header.firstDirectorySector);
  const entries = readDirectoryEntries(directoryStream);
  const context: CfbContext = {
    buffer,
    header,
    fat,
    miniFat: [],
    miniStream: Buffer.alloc(0),
    entries,
  };
  context.miniFat = readMiniFat(context);
  context.miniStream = readMiniStream(context);
  return context;
}

export function readCompoundFileStreams(buffer: Buffer): Map<string, Buffer> {
  const context = createCfbContext(buffer);
  const streams = new Map<string, Buffer>();

  for (const entry of context.entries) {
    if (entry.type !== 2) {
      continue;
    }

    const stream =
      entry.size < context.header.miniStreamCutoffSize
        ? readMiniChain(context, entry.startSector, entry.size)
        : readChain(context.buffer, context.header, context.fat, entry.startSector, entry.size);
    streams.set(entry.name, stream);
  }

  return streams;
}
