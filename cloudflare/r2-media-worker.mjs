const DEFAULT_CACHE_CONTROL = "public, max-age=31536000, immutable";

function findR2Bucket(env) {
  const buckets = Object.entries(env || {}).filter(([, binding]) => (
    binding
    && typeof binding.get === "function"
    && typeof binding.head === "function"
    && typeof binding.createMultipartUpload === "function"
  ));

  if (buckets.length !== 1) {
    throw new Error(
      `Expected exactly one R2 bucket binding, found ${buckets.length}.`
    );
  }

  return buckets[0][1];
}

function parseRange(rangeHeader, size) {
  if (!/^bytes=/i.test(rangeHeader)) return null;

  const value = rangeHeader.replace(/^bytes=/i, "").trim();
  if (!value || value.includes(",")) return null;

  const match = value.match(/^(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0 || size === 0) return null;
    const length = Math.min(suffixLength, size);
    return { start: size - length, end: size - 1, length };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(requestedEnd)
    || start >= size
    || requestedEnd < start
  ) {
    return null;
  }

  const end = Math.min(requestedEnd, size - 1);
  return { start, end, length: end - start + 1 };
}

function createHeaders(object) {
  const headers = new Headers();
  if (object && typeof object.writeHttpMetadata === "function") {
    object.writeHttpMetadata(headers);
  }

  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", DEFAULT_CACHE_CONTROL);
  }
  headers.set("Accept-Ranges", "bytes");

  if (object?.httpEtag) {
    headers.set("ETag", object.httpEtag);
  } else if (object?.etag) {
    headers.set("ETag", `"${object.etag}"`);
  }

  if (object?.uploaded && !headers.has("Last-Modified")) {
    headers.set("Last-Modified", object.uploaded.toUTCString());
  }

  return headers;
}

function rangeNotSatisfiable(size) {
  return new Response(null, {
    status: 416,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes */${size}`,
      "Content-Length": "0"
    }
  });
}

async function handleRequest(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" }
    });
  }

  let key;
  try {
    key = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ""));
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (!key) return new Response("Not Found", { status: 404 });

  let bucket;
  try {
    bucket = findR2Bucket(env);
  } catch (error) {
    console.error(error.message);
    return new Response("R2 binding configuration error", { status: 500 });
  }

  if (request.method === "HEAD") {
    const object = await bucket.head(key);
    if (!object) return new Response("Not Found", { status: 404 });

    const headers = createHeaders(object);
    headers.set("Content-Length", String(object.size));
    return new Response(null, { status: 200, headers });
  }

  const rangeHeader = request.headers.get("Range");
  if (!rangeHeader) {
    const object = await bucket.get(key);
    if (!object) return new Response("Not Found", { status: 404 });

    const headers = createHeaders(object);
    headers.set("Content-Length", String(object.size));
    headers.delete("Content-Range");
    return new Response(object.body, { status: 200, headers });
  }

  const metadata = await bucket.head(key);
  if (!metadata) return new Response("Not Found", { status: 404 });

  const range = parseRange(rangeHeader, metadata.size);
  if (!range) return rangeNotSatisfiable(metadata.size);

  const object = await bucket.get(key, {
    range: { offset: range.start, length: range.length }
  });
  if (!object) return new Response("Not Found", { status: 404 });

  const headers = createHeaders(metadata);
  headers.set("Content-Length", String(range.length));
  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${metadata.size}`);
  return new Response(object.body, { status: 206, headers });
}

export { createHeaders, findR2Bucket, handleRequest, parseRange };

export default {
  fetch: handleRequest
};
