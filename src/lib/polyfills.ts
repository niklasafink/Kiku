// Newer language functions that pdf.js uses and Safari before 2025 (and older Chrome) lacks. Without
// them a PDF fails with "undefined is not a function". Imported for its side effect, in the page and
// in the pdf.js worker, before pdf.js runs. Each one only fills a gap, nothing is replaced.
/* eslint-disable @typescript-eslint/no-explicit-any */

function define(target: any, name: string, value: unknown) {
  if (target && typeof target[name] !== "function") Object.defineProperty(target, name, { value, writable: true, configurable: true });
}

define(Promise, "withResolvers", function <T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
});

define(Promise, "try", function (this: PromiseConstructor, callback: (...args: unknown[]) => unknown, ...args: unknown[]) {
  return new Promise((resolve) => resolve(callback(...args)));
});

define(Array, "fromAsync", async function (source: AsyncIterable<unknown> | Iterable<unknown>, map?: (value: unknown, index: number) => unknown) {
  const out: unknown[] = [];
  let index = 0;
  for await (const value of source as AsyncIterable<unknown>) out.push(map ? await map(value, index++) : value);
  return out;
});

const group = (items: Iterable<unknown>, callback: (value: unknown, index: number) => unknown, into: (key: unknown, value: unknown) => void) => {
  let index = 0;
  for (const value of items) into(callback(value, index++), value);
};
define(Object, "groupBy", (items: Iterable<unknown>, callback: (value: unknown, index: number) => PropertyKey) => {
  const result: Record<PropertyKey, unknown[]> = Object.create(null);
  group(items, callback, (key, value) => (result[key as string] ??= []).push(value));
  return result;
});
define(Map, "groupBy", (items: Iterable<unknown>, callback: (value: unknown, index: number) => unknown) => {
  const result = new Map<unknown, unknown[]>();
  group(items, callback, (key, value) => {
    const list = result.get(key);
    if (list) list.push(value);
    else result.set(key, [value]);
  });
  return result;
});

for (const type of [Map, WeakMap] as any[]) {
  define(type.prototype, "getOrInsert", function (this: Map<unknown, unknown>, key: unknown, value: unknown) {
    if (!this.has(key)) this.set(key, value);
    return this.get(key);
  });
  define(type.prototype, "getOrInsertComputed", function (this: Map<unknown, unknown>, key: unknown, callback: (key: unknown) => unknown) {
    if (!this.has(key)) this.set(key, callback(key));
    return this.get(key);
  });
}

define(Math, "sumPrecise", (values: Iterable<number>) => {
  let sum = 0;
  for (const value of values) sum += value;
  return sum;
});

define(URL, "parse", (url: string | URL, base?: string | URL) => {
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
});

define(Uint8Array.prototype, "toHex", function (this: Uint8Array) {
  return Array.from(this, (byte) => byte.toString(16).padStart(2, "0")).join("");
});
define(Uint8Array.prototype, "toBase64", function (this: Uint8Array) {
  let binary = "";
  for (const byte of this) binary += String.fromCharCode(byte);
  return btoa(binary);
});
define(Uint8Array, "fromBase64", (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0)));
define(Uint8Array, "fromHex", (text: string) => Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16)));

// Safari before 17 lacks ArrayBuffer.transfer; pdf.js uses it to pass page data on, and without it a page
// shows its lines but no text. The old buffer is emptied by handing it over, as the real function does.
function transfer(this: ArrayBuffer, length?: number) {
  const size = length ?? this.byteLength;
  const moved = structuredClone(this, { transfer: [this] });
  if (size === moved.byteLength) return moved;
  const copy = new ArrayBuffer(size);
  new Uint8Array(copy).set(new Uint8Array(moved, 0, Math.min(size, moved.byteLength)));
  return copy;
}
define(ArrayBuffer.prototype, "transfer", transfer);
define(ArrayBuffer.prototype, "transferToFixedLength", transfer);

export {};
