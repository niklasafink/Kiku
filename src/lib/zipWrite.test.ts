import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 as nodeCrc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { openZip } from "./zip";
import { crc32, writeZip } from "./zipWrite";

const encoder = new TextEncoder();
/** Bytes that do not compress, like a picture. */
function noise(length: number): Uint8Array {
  let state = 0x9e3779b9;
  return Uint8Array.from({ length }, () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state & 0xff;
  });
}

const FILES = [
  { name: "collection.anki2", data: encoder.encode("Zelle ".repeat(20000)) },
  { name: "media", data: encoder.encode('{"0": "bild.webp"}') },
  { name: "0", data: noise(5000), store: true },
  { name: "1", data: noise(3000) },
  { name: "Ordner/Übung ä€😀.txt", data: encoder.encode("Größe") },
  { name: "leer", data: new Uint8Array(0) },
];

describe("crc32", () => {
  it("matches the reference values", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(crc32(encoder.encode("123456789"))).toBe(0xcbf43926);
    for (const file of FILES) expect(crc32(file.data)).toBe(nodeCrc32(file.data));
  });
});

describe("writeZip", () => {
  it("writes an archive our reader gets every file back from", async () => {
    const blob = await writeZip(FILES);
    const buffer = await blob.arrayBuffer();
    const zip = openZip(buffer);
    expect(zip.names).toEqual(FILES.map((file) => file.name));
    for (const file of FILES) expect([...(await zip.bytes(file.name))!]).toEqual([...file.data]);
    // The repetitive file shrinks; what does not get smaller (noise, a few bytes) is stored as it is.
    expect(buffer.byteLength).toBeLessThan(12000);
    const view = new DataView(buffer);
    const methods: number[] = [];
    for (let offset = view.getUint32(buffer.byteLength - 6, true); view.getUint32(offset, true) === 0x02014b50; ) {
      methods.push(view.getUint16(offset + 10, true));
      offset += 46 + view.getUint16(offset + 28, true);
    }
    expect(methods).toEqual([8, 0, 0, 0, 0, 0]);
  });

  it("passes the checks of the system's unzip, checksums included", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "kiku-")), "written.zip");
    writeFileSync(path, new Uint8Array(await (await writeZip(FILES, new Date(2026, 9, 10, 12, 30, 44))).arrayBuffer()));
    const test = execFileSync("unzip", ["-t", path], { encoding: "utf8" });
    expect(test).toContain("No errors detected");
    expect(test.match(/ OK$/gm)).toHaveLength(FILES.length);
    expect(execFileSync("unzip", ["-p", path, "media"], { encoding: "utf8" })).toBe('{"0": "bild.webp"}');
    expect(execFileSync("unzip", ["-l", path], { encoding: "utf8" })).toMatch(/10-10-2026 12:30\s+collection\.anki2/);
  });

  it("writes an empty archive", async () => {
    const buffer = await (await writeZip([])).arrayBuffer();
    expect(buffer.byteLength).toBe(22);
    expect(openZip(buffer).names).toEqual([]);
  });
});
