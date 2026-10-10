// Writes ZIP archives with what the platform already has (CompressionStream), the counterpart
// of zip.ts. Checksums are real: Anki and most other readers verify them.

export interface ZipFile {
  name: string;
  data: Uint8Array;
  /** Skip compression, e.g. for pictures, which do not get smaller. */
  store?: boolean;
}

const encoder = new TextEncoder();

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  return value;
});

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Date and time as MS-DOS stores them: two seconds per step, years counted from 1980. */
function dosTime(date: Date): { time: number; day: number } {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const VERSION = 20; // ZIP 2.0, the first with deflate
const UTF8_NAMES = 0x0800;
/** Sizes and offsets are 32 bits wide, counts 16; beyond that the format needs ZIP64. */
const MAX_SIZE = 0xffffffff;
const MAX_FILES = 0xffff;

export async function writeZip(files: ZipFile[], modified = new Date()): Promise<Blob> {
  if (files.length > MAX_FILES) throw new Error("Too many files for a ZIP archive");
  const { time, day } = dosTime(modified);
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const packed = file.store ? file.data : await deflate(file.data);
    // Compressed data can come out larger than what went in; then the original is stored.
    const compressed = packed.length < file.data.length;
    const data = compressed ? packed : file.data;

    // Both headers share these fields, in this order.
    const common = new DataView(new ArrayBuffer(26));
    common.setUint16(0, VERSION, true);
    common.setUint16(2, UTF8_NAMES, true);
    common.setUint16(4, compressed ? 8 : 0, true);
    common.setUint16(6, time, true);
    common.setUint16(8, day, true);
    common.setUint32(10, crc32(file.data), true);
    common.setUint32(14, data.length, true);
    common.setUint32(18, file.data.length, true);
    common.setUint16(22, name.length, true);

    const local = new Uint8Array(30);
    new DataView(local.buffer).setUint32(0, 0x04034b50, true);
    local.set(new Uint8Array(common.buffer), 4);

    const central = new Uint8Array(46);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, VERSION, true);
    central.set(new Uint8Array(common.buffer), 6);
    centralView.setUint32(42, offset, true);

    parts.push(local, name, data);
    directory.push(central, name);
    offset += local.length + name.length + data.length;
    if (offset > MAX_SIZE) throw new Error("Too large for a ZIP archive");
  }

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, directory.reduce((sum, part) => sum + part.length, 0), true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, new Uint8Array(end.buffer)] as BlobPart[], { type: "application/zip" });
}
