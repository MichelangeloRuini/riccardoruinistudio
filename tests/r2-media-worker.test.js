const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const workerUrl = pathToFileURL(path.resolve(__dirname, "../cloudflare/r2-media-worker.mjs"));
const objects = {
  "assets/example.webp": {
    bytes: new TextEncoder().encode("webp-image"),
    contentType: "image/webp"
  },
  "assets/example.mp4": {
    bytes: new TextEncoder().encode("0123456789abcdef"),
    contentType: "video/mp4"
  }
};

function createBucket() {
  const calls = [];
  const metadata = record => ({
    size: record.bytes.byteLength,
    httpEtag: '"test-etag"',
    writeHttpMetadata(headers) {
      headers.set("Content-Type", record.contentType);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
  });

  return {
    calls,
    async head(key) {
      calls.push({ operation: "head", key });
      return objects[key] ? metadata(objects[key]) : null;
    },
    async get(key, options) {
      calls.push({ operation: "get", key, options });
      const record = objects[key];
      if (!record) return null;
      const range = options?.range;
      const bytes = range
        ? record.bytes.slice(range.offset, range.offset + range.length)
        : record.bytes;
      return { ...metadata(record), body: bytes };
    },
    async createMultipartUpload() {}
  };
}

async function loadWorker() {
  return import(`${workerUrl.href}?test=${Date.now()}-${Math.random()}`);
}

test("GET without Range streams the full WebP with 200 and no Content-Range", async () => {
  const { handleRequest } = await loadWorker();
  const bucket = createBucket();
  const response = await handleRequest(
    new Request("https://media.example/assets/example.webp"),
    { EXISTING_R2_BINDING: bucket }
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(response.headers.get("content-length"), "10");
  assert.equal(response.headers.get("content-range"), null);
  assert.equal(await response.text(), "webp-image");
  assert.deepEqual(bucket.calls, [{
    operation: "get",
    key: "assets/example.webp",
    options: undefined
  }]);
});

test("GET with a valid video Range returns only the requested bytes with 206", async () => {
  const { handleRequest } = await loadWorker();
  const bucket = createBucket();
  const response = await handleRequest(
    new Request("https://media.example/assets/example.mp4", {
      headers: { Range: "bytes=2-5" }
    }),
    { CURRENT_BUCKET_NAME_DOES_NOT_MATTER: bucket }
  );

  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-type"), "video/mp4");
  assert.equal(response.headers.get("content-length"), "4");
  assert.equal(response.headers.get("content-range"), "bytes 2-5/16");
  assert.equal(await response.text(), "2345");
  assert.deepEqual(bucket.calls[1].options, { range: { offset: 2, length: 4 } });
});

test("HEAD returns full metadata with 200 and no body or Content-Range", async () => {
  const { handleRequest } = await loadWorker();
  const bucket = createBucket();
  const response = await handleRequest(
    new Request("https://media.example/assets/example.webp", { method: "HEAD" }),
    { R2: bucket }
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-length"), "10");
  assert.equal(response.headers.get("content-range"), null);
  assert.equal(await response.text(), "");
  assert.deepEqual(bucket.calls, [{ operation: "head", key: "assets/example.webp" }]);
});

test("suffix ranges work and invalid or multiple ranges return 416", async () => {
  const { handleRequest } = await loadWorker();
  const bucket = createBucket();
  const suffix = await handleRequest(
    new Request("https://media.example/assets/example.mp4", {
      headers: { Range: "bytes=-4" }
    }),
    { R2: bucket }
  );
  assert.equal(suffix.status, 206);
  assert.equal(suffix.headers.get("content-range"), "bytes 12-15/16");
  assert.equal(await suffix.text(), "cdef");

  for (const range of ["bytes=20-30", "bytes=5-2", "bytes=0-1,4-5", "items=0-1"]) {
    const response = await handleRequest(
      new Request("https://media.example/assets/example.mp4", { headers: { Range: range } }),
      { R2: createBucket() }
    );
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get("content-range"), "bytes */16", range);
  }
});

test("unknown objects and unsupported methods use appropriate HTTP statuses", async () => {
  const { handleRequest } = await loadWorker();
  const env = { R2: createBucket() };
  assert.equal((await handleRequest(new Request("https://media.example/missing"), env)).status, 404);
  assert.equal((await handleRequest(new Request("https://media.example/assets/example.webp", {
    method: "POST"
  }), env)).status, 405);
});
