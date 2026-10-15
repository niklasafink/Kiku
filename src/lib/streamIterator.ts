// Safari cannot loop over a ReadableStream with `for await`; pdf.js does that to read the text of a
// page (and in its worker to unpack compressed data). Without this, every PDF fails there with
// "undefined is not a function". Imported for its side effect, before pdf.js runs.

type IterableStream = ReadableStream & { [Symbol.asyncIterator]?: unknown; values?: unknown };

const proto = typeof ReadableStream === "undefined" ? null : (ReadableStream.prototype as IterableStream);

if (proto && !proto[Symbol.asyncIterator]) {
  async function* values(this: ReadableStream) {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
  proto.values = values;
  proto[Symbol.asyncIterator] = values;
}
