// Reads ZIP archives with what the platform already has (DecompressionStream). Office files
// (.xlsx, .pptx, .docx) are ZIP archives of XML, so they can be opened without a library.

interface Entry {
  method: number;
  compressedSize: number;
  headerOffset: number;
}

const decoder = new TextDecoder();

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface Zip {
  names: string[];
  /** File content as text, or null if the archive has no such file. */
  text(name: string): Promise<string | null>;
  /** File content as bytes, or null if the archive has no such file. */
  bytes(name: string): Promise<Uint8Array | null>;
}

export function openZip(buffer: ArrayBuffer): Zip {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // The directory sits at the end, after an optional comment.
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error("Not a ZIP archive");

  const entries = new Map<string, Entry>();
  let offset = view.getUint32(end + 16, true);
  for (let i = view.getUint16(end + 10, true); i > 0 && view.getUint32(offset, true) === 0x02014b50; i--) {
    const nameLength = view.getUint16(offset + 28, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.set(name, {
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      headerOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }

  async function read(name: string): Promise<Uint8Array | null> {
    const entry = entries.get(name);
    if (!entry) return null;
    const start =
      entry.headerOffset + 30 + view.getUint16(entry.headerOffset + 26, true) + view.getUint16(entry.headerOffset + 28, true);
    const data = bytes.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return inflate(data);
    throw new Error(`Unsupported ZIP compression ${entry.method}`);
  }

  return {
    names: [...entries.keys()],
    bytes: read,
    async text(name) {
      const data = await read(name);
      return data && decoder.decode(data);
    },
  };
}
