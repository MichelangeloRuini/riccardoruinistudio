"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  DEFAULT_MULTIPART_CONCURRENCY,
  DEFAULT_OPERATION_MAX_ATTEMPTS,
  DEFAULT_PART_SIZE,
  collectAssetFiles,
  contentTypeFor,
  createR2Client,
  isTransientError,
  loadLocalEnvFile,
  loadConfig,
  mapConcurrent,
  normalizeRequestedKey,
  parseArgs,
  processFile,
  runMigration,
  safeError,
  selectAssetFiles,
  shouldExclude,
  withRetry
} = require("../tools/upload-assets-r2");

const TEST_CONFIG = Object.freeze({
  accountId: "0123456789abcdef0123456789abcdef",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  bucket: "rrs-media"
});

async function tempAssets(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rrs-r2-test-"));
  const assets = path.join(root, "assets");
  await fs.mkdir(path.join(assets, "campaigns", "example"), { recursive: true });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return assets;
}

function headClient(responses) {
  const calls = [];
  return {
    calls,
    async send(command) {
      calls.push(command.input);
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response;
    }
  };
}

function missingError() {
  const error = new Error("missing");
  error.name = "NotFound";
  error.$metadata = { httpStatusCode: 404 };
  return error;
}

test("CLI defaults to dry-run and requires an explicit apply flag", () => {
  assert.equal(parseArgs([]).dryRun, true);
  assert.equal(parseArgs(["--dry-run"]).dryRun, true);
  assert.equal(parseArgs(["--apply"]).dryRun, false);
  assert.equal(parseArgs(["--concurrency", "1"]).concurrency, 1);
  assert.equal(
    parseArgs(["--file", "assets/campaigns/example/video.mp4"]).file,
    "assets/campaigns/example/video.mp4"
  );
  assert.throws(() => parseArgs(["--apply", "--dry-run"]), /Choose only one/);
  assert.throws(() => parseArgs(["--part-size-mib", "4"]), /at least 5/);
  assert.throws(() => parseArgs(["--file"]), /requires an assets\/ path/);
  assert.throws(
    () => parseArgs(["--file", "assets/example.jpg", "--file", "assets/other.jpg"]),
    /only once/
  );
});

test("the single-file option accepts only canonical keys below assets", () => {
  assert.equal(
    normalizeRequestedKey("assets/campaigns/example/video.mp4"),
    "assets/campaigns/example/video.mp4"
  );
  for (const invalid of [
    "/assets/example.mp4",
    "campaigns/example.mp4",
    "assets/../secret",
    "assets//example.mp4",
    "assets\\example.mp4",
    "assets/example/"
  ]) {
    assert.throws(() => normalizeRequestedKey(invalid), /--file/);
  }
});

test("the R2 client disables optional automatic checksums and uses bounded standard retries", async t => {
  const client = createR2Client(TEST_CONFIG);
  t.after(() => client.destroy());
  assert.equal(await client.config.requestChecksumCalculation(), "WHEN_REQUIRED");
  assert.equal(await client.config.maxAttempts(), 3);
  assert.equal(client.config.retryMode, "standard");
});

test("R2 configuration accepts only environment variables for the expected bucket", () => {
  const env = {
    R2_ACCOUNT_ID: TEST_CONFIG.accountId,
    R2_ACCESS_KEY_ID: TEST_CONFIG.accessKeyId,
    R2_SECRET_ACCESS_KEY: TEST_CONFIG.secretAccessKey,
    R2_BUCKET: TEST_CONFIG.bucket
  };
  assert.deepEqual(loadConfig(env), TEST_CONFIG);
  assert.throws(() => loadConfig({ ...env, R2_BUCKET: "another-bucket" }), /rrs-media/);
  assert.throws(() => loadConfig({}), /Missing required environment variables/);
});

test("the local R2 environment file is loaded without overriding exported values", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rrs-r2-env-test-"));
  const envFile = path.join(root, ".env.r2.local");
  const variableNames = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET"
  ];
  const previous = Object.fromEntries(variableNames.map(name => [name, process.env[name]]));
  t.after(async () => {
    for (const name of variableNames) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    await fs.rm(root, { recursive: true, force: true });
  });

  for (const name of variableNames) delete process.env[name];
  process.env.R2_ACCESS_KEY_ID = "already-exported-access-key";
  await fs.writeFile(envFile, [
    `R2_ACCOUNT_ID=${TEST_CONFIG.accountId}`,
    "R2_ACCESS_KEY_ID=file-access-key",
    `R2_SECRET_ACCESS_KEY=${TEST_CONFIG.secretAccessKey}`,
    `R2_BUCKET=${TEST_CONFIG.bucket}`,
    ""
  ].join("\n"));

  assert.equal(loadLocalEnvFile(envFile), true);
  assert.deepEqual(loadConfig(process.env), {
    ...TEST_CONFIG,
    accessKeyId: "already-exported-access-key"
  });
  assert.equal(loadLocalEnvFile(path.join(root, "missing.env")), false);
});

test("missing credentials are reported by name without exposing supplied values", () => {
  const visibleSecret = "must-not-appear-in-validation-errors";
  assert.throws(
    () => loadConfig({
      R2_ACCOUNT_ID: TEST_CONFIG.accountId,
      R2_ACCESS_KEY_ID: visibleSecret,
      R2_SECRET_ACCESS_KEY: "",
      R2_BUCKET: TEST_CONFIG.bucket
    }),
    error => error.message.includes("R2_SECRET_ACCESS_KEY") && !error.message.includes(visibleSecret)
  );
});

test("asset collection preserves the assets prefix and excludes only metadata/system files", async t => {
  const assets = await tempAssets(t);
  const directory = path.join(assets, "campaigns", "example");
  await Promise.all([
    fs.writeFile(path.join(directory, "01.JPG"), "jpeg"),
    fs.writeFile(path.join(directory, "01-thumb.webp"), "webp"),
    fs.writeFile(path.join(directory, "video.mp4"), "video"),
    fs.writeFile(path.join(directory, "data.json"), "{}"),
    fs.writeFile(path.join(directory, ".DS_Store"), "system")
  ]);

  const inventory = await collectAssetFiles(assets);
  assert.deepEqual(inventory.files.map(file => file.key), [
    "assets/campaigns/example/01-thumb.webp",
    "assets/campaigns/example/01.JPG",
    "assets/campaigns/example/video.mp4"
  ]);
  assert.deepEqual(inventory.excluded.map(file => file.key), [
    "assets/campaigns/example/.DS_Store",
    "assets/campaigns/example/data.json"
  ]);
  assert.equal(shouldExclude("campaigns/example/not-data.json"), false);
});

test("single-file selection matches exactly one publishable asset", () => {
  const first = { key: "assets/campaigns/example/01.jpg" };
  const second = { key: "assets/campaigns/example/video.mp4" };
  const inventory = {
    files: [first, second],
    excluded: [{ key: "assets/campaigns/example/data.json" }]
  };

  assert.deepEqual(
    selectAssetFiles(inventory, second.key),
    { files: [second], excluded: [] }
  );
  assert.throws(
    () => selectAssetFiles(inventory, "assets/campaigns/example/missing.mp4"),
    /did not match exactly one/
  );
  assert.throws(
    () => selectAssetFiles(inventory, "assets/campaigns/example/data.json"),
    /did not match exactly one/
  );
});

test("multi-file selection returns only the requested incremental asset set", () => {
  const first = { key: "assets/campaigns/example/01.jpg" };
  const second = { key: "assets/campaigns/example/video.mp4" };
  const unrelated = { key: "assets/books/book-01/video.mp4" };
  const inventory = { files: [first, second, unrelated], excluded: [] };

  assert.deepEqual(
    selectAssetFiles(inventory, [first.key, second.key]),
    { files: [first, second], excluded: [] }
  );
  assert.throws(
    () => selectAssetFiles(inventory, [first.key, "assets/books/missing.mp4"]),
    /missing\.mp4/
  );
  assert.throws(
    () => selectAssetFiles(inventory, [first.key, first.key]),
    /unique list/
  );
});

test("content types cover all required media formats", () => {
  assert.equal(contentTypeFor("photo.jpg"), "image/jpeg");
  assert.equal(contentTypeFor("photo.JPEG"), "image/jpeg");
  assert.equal(contentTypeFor("photo.webp"), "image/webp");
  assert.equal(contentTypeFor("photo.png"), "image/png");
  assert.equal(contentTypeFor("logo.svg"), "image/svg+xml");
  assert.equal(contentTypeFor("film.mp4"), "video/mp4");
  assert.equal(contentTypeFor("unknown.bin"), "application/octet-stream");
});

test("dry-run performs HEAD verification but never creates an upload", async t => {
  const assets = await tempAssets(t);
  const filePath = path.join(assets, "campaigns", "example", "01.jpg");
  await fs.writeFile(filePath, "content");
  const client = headClient([missingError()]);
  let uploadCalls = 0;

  const report = await runMigration({
    assetsRoot: assets,
    client,
    config: TEST_CONFIG,
    dryRun: true,
    uploadFactory() {
      uploadCalls += 1;
      throw new Error("must not upload in dry-run");
    }
  });

  assert.equal(report.mode, "dry-run");
  assert.equal(report.summary.pending, 1);
  assert.equal(report.summary.uploaded, 0);
  assert.equal(uploadCalls, 0);
  assert.equal(client.calls.length, 1);
  const serializedReport = JSON.stringify(report);
  assert.doesNotMatch(serializedReport, new RegExp(TEST_CONFIG.accountId));
  assert.doesNotMatch(serializedReport, new RegExp(TEST_CONFIG.accessKeyId));
  assert.doesNotMatch(serializedReport, new RegExp(TEST_CONFIG.secretAccessKey));
});

test("single-file dry-run performs exactly one HEAD and reports only the exact key", async t => {
  const assets = await tempAssets(t);
  const directory = path.join(assets, "campaigns", "example");
  await Promise.all([
    fs.writeFile(path.join(directory, "01.jpg"), "image"),
    fs.writeFile(path.join(directory, "video.mp4"), "video")
  ]);
  const selectedFile = "assets/campaigns/example/video.mp4";
  const client = headClient([missingError()]);

  const report = await runMigration({
    assetsRoot: assets,
    client,
    config: TEST_CONFIG,
    dryRun: true,
    fileKey: selectedFile,
    uploadFactory() {
      throw new Error("must not upload in dry-run");
    }
  });

  assert.equal(report.selectedFile, selectedFile);
  assert.equal(report.summary.total, 1);
  assert.equal(report.summary.pending, 1);
  assert.equal(report.summary.bytes, 5);
  assert.equal(report.files[0].key, selectedFile);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].Key, selectedFile);
});

test("a missing --file key fails before any remote request", async t => {
  const assets = await tempAssets(t);
  await fs.writeFile(path.join(assets, "campaigns", "example", "01.jpg"), "image");
  const client = headClient([]);

  await assert.rejects(
    runMigration({
      assetsRoot: assets,
      client,
      config: TEST_CONFIG,
      fileKey: "assets/campaigns/example/missing.mp4"
    }),
    /did not match exactly one/
  );
  assert.equal(client.calls.length, 0);
});

test("a matching remote object is verified and skipped", async t => {
  const assets = await tempAssets(t);
  const filePath = path.join(assets, "campaigns", "example", "01.jpg");
  await fs.writeFile(filePath, "content");
  const sha256 = "ed7002b439e9ac845f22357d822bac1444730fbdb6016d3ec9432297b9ec9f73";
  const client = headClient([{
    ContentLength: 7,
    ContentType: "image/jpeg",
    Metadata: { sha256 }
  }]);

  const result = await processFile({
    client,
    config: TEST_CONFIG,
    file: {
      absolutePath: filePath,
      key: "assets/campaigns/example/01.jpg",
      size: 7,
      contentType: "image/jpeg"
    },
    dryRun: false,
    partSize: DEFAULT_PART_SIZE,
    uploadFactory() {
      throw new Error("verified files must not upload");
    }
  });

  assert.equal(result.status, "verified");
  assert.deepEqual(result.checks, { size: true, sha256: true, contentType: true });
});

test("a mismatching object is reported as a conflict and never overwritten", async t => {
  const assets = await tempAssets(t);
  const filePath = path.join(assets, "campaigns", "example", "01.jpg");
  await fs.writeFile(filePath, "content");
  const client = headClient([{
    ContentLength: 99,
    ContentType: "image/jpeg",
    Metadata: { sha256: "different" }
  }]);
  let uploadCalls = 0;

  const result = await processFile({
    client,
    config: TEST_CONFIG,
    file: {
      absolutePath: filePath,
      key: "assets/campaigns/example/01.jpg",
      size: 7,
      contentType: "image/jpeg"
    },
    dryRun: false,
    partSize: DEFAULT_PART_SIZE,
    uploadFactory() {
      uploadCalls += 1;
    }
  });

  assert.equal(result.status, "conflict");
  assert.equal(uploadCalls, 0);
});

test("CMS overwrite mode replaces only an explicitly selected changed object and verifies it", async t => {
  const assets = await tempAssets(t);
  const filePath = path.join(assets, "campaigns", "example", "01.jpg");
  await fs.writeFile(filePath, "content");
  const sha256 = "ed7002b439e9ac845f22357d822bac1444730fbdb6016d3ec9432297b9ec9f73";
  const client = headClient([
    {
      ContentLength: 99,
      ContentType: "image/jpeg",
      Metadata: { sha256: "different" }
    },
    {
      ContentLength: 7,
      ContentType: "image/jpeg",
      Metadata: { sha256, "source-size": "7" }
    }
  ]);
  let capturedParams;

  const result = await processFile({
    client,
    config: TEST_CONFIG,
    file: {
      absolutePath: filePath,
      key: "assets/campaigns/example/01.jpg",
      size: 7,
      contentType: "image/jpeg"
    },
    dryRun: false,
    partSize: DEFAULT_PART_SIZE,
    overwriteExisting: true,
    uploadFactory({ params }) {
      capturedParams = params;
      return { done: async () => ({}) };
    }
  });

  assert.equal(result.status, "uploaded");
  assert.equal(result.replaced, true);
  assert.equal(capturedParams.Key, "assets/campaigns/example/01.jpg");
  assert.equal(capturedParams.IfNoneMatch, undefined);
  assert.equal(capturedParams.Metadata.sha256, sha256);
});

test("apply uploads a missing object with SHA-256 metadata then verifies it", async t => {
  const assets = await tempAssets(t);
  const filePath = path.join(assets, "campaigns", "example", "film.mp4");
  await fs.writeFile(filePath, "video-content");
  const sha256 = "b4367c8908484308c443753ed4d99261251cb04f8707b1d1d189c7a87b556141";
  const client = headClient([
    missingError(),
    {
      ContentLength: 13,
      ContentType: "video/mp4",
      Metadata: { sha256, "source-size": "13" }
    }
  ]);
  let captured;

  const result = await processFile({
    client,
    config: TEST_CONFIG,
    file: {
      absolutePath: filePath,
      key: "assets/campaigns/example/film.mp4",
      size: 13,
      contentType: "video/mp4"
    },
    dryRun: false,
    partSize: DEFAULT_PART_SIZE,
    uploadFactory(options) {
      captured = options;
      return { done: async () => ({ ETag: "test" }) };
    }
  });

  assert.equal(result.status, "uploaded");
  assert.equal(captured.params.ChecksumAlgorithm, "SHA256");
  assert.equal(captured.params.IfNoneMatch, "*");
  assert.equal(captured.params.Metadata.sha256, sha256);
  assert.equal(captured.params.ContentType, "video/mp4");
  assert.equal(captured.partSize, DEFAULT_PART_SIZE);
  assert.equal(captured.queueSize, DEFAULT_MULTIPART_CONCURRENCY);
});

test("multipart upload omits unsupported checksum headers while preserving SHA-256 metadata", async t => {
  const assets = await tempAssets(t);
  const filePath = path.join(assets, "campaigns", "example", "film.mp4");
  await fs.writeFile(filePath, "large-enough");
  const sha256 = "63f819e1173634917205edeac13140e62765ebb16ef4e10a517997b69c4834ee";
  const client = headClient([
    missingError(),
    { ContentLength: 12, ContentType: "video/mp4", Metadata: { sha256 } }
  ]);

  let captured;
  const result = await processFile({
    client,
    config: TEST_CONFIG,
    file: {
      absolutePath: filePath,
      key: "assets/campaigns/example/film.mp4",
      size: 12,
      contentType: "video/mp4"
    },
    dryRun: false,
    partSize: 10,
    uploadFactory(options) {
      captured = options;
      return { done: async () => ({}) };
    }
  });

  assert.equal(result.multipart, true);
  assert.equal(Object.hasOwn(captured.params, "ChecksumAlgorithm"), false);
  assert.equal(captured.params.Metadata.sha256, sha256);
  assert.equal(captured.queueSize, 2);
});

test("a transient upload failure retries with a fresh stream and still performs final verification", async t => {
  const assets = await tempAssets(t);
  const filePath = path.join(assets, "campaigns", "example", "01.jpg");
  await fs.writeFile(filePath, "content");
  const sha256 = "ed7002b439e9ac845f22357d822bac1444730fbdb6016d3ec9432297b9ec9f73";
  const client = headClient([
    missingError(),
    { ContentLength: 7, ContentType: "image/jpeg", Metadata: { sha256 } }
  ]);
  const bodies = [];
  let uploadAttempts = 0;

  const result = await processFile({
    client,
    config: TEST_CONFIG,
    file: {
      absolutePath: filePath,
      key: "assets/campaigns/example/01.jpg",
      size: 7,
      contentType: "image/jpeg"
    },
    dryRun: false,
    partSize: DEFAULT_PART_SIZE,
    retryOptions: {
      maxAttempts: 2,
      baseDelayMs: 1,
      sleep: async () => {}
    },
    uploadFactory({ params }) {
      uploadAttempts += 1;
      bodies.push(params.Body);
      return {
        async done() {
          if (uploadAttempts === 1) {
            throw Object.assign(new Error("broken pipe"), { code: "EPIPE" });
          }
          return {};
        }
      };
    }
  });

  assert.equal(result.status, "uploaded");
  assert.equal(uploadAttempts, 2);
  assert.notEqual(bodies[0], bodies[1]);
  assert.equal(client.calls.length, 2);
});

test("transient network and R2 service failures are retried with progressive backoff", async () => {
  for (const code of ["ECONNRESET", "EPIPE", "ETIMEDOUT", "EADDRNOTAVAIL"]) {
    assert.equal(isTransientError(Object.assign(new Error(code), { code })), true);
  }
  assert.equal(isTransientError(Object.assign(new Error("500"), {
    $metadata: { httpStatusCode: 500 }
  })), true);
  assert.equal(isTransientError(Object.assign(new Error("503"), {
    $metadata: { httpStatusCode: 503 }
  })), true);
  assert.equal(isTransientError(Object.assign(new Error("501"), {
    $metadata: { httpStatusCode: 501 }
  })), false);

  let calls = 0;
  const delays = [];
  const result = await withRetry(async () => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error("temporary"), { code: "ECONNRESET" });
    return "ok";
  }, {
    maxAttempts: 3,
    baseDelayMs: 25,
    sleep: async milliseconds => delays.push(milliseconds)
  });

  assert.equal(result, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [25, 50]);
});

test("retry attempts stop at the configured maximum", async () => {
  let calls = 0;
  const delays = [];
  await assert.rejects(
    withRetry(async () => {
      calls += 1;
      throw Object.assign(new Error("still unavailable"), {
        $metadata: { httpStatusCode: 503 }
      });
    }, {
      maxAttempts: DEFAULT_OPERATION_MAX_ATTEMPTS,
      baseDelayMs: 10,
      sleep: async milliseconds => delays.push(milliseconds)
    }),
    error => error.retryAttempts === DEFAULT_OPERATION_MAX_ATTEMPTS
  );
  assert.equal(calls, DEFAULT_OPERATION_MAX_ATTEMPTS);
  assert.deepEqual(delays, [10, 20]);
});

test("file concurrency is bounded by the CLI-controlled worker count", async () => {
  let active = 0;
  let maximum = 0;
  const values = await mapConcurrent([1, 2, 3, 4], 1, async value => {
    active += 1;
    maximum = Math.max(maximum, active);
    await Promise.resolve();
    active -= 1;
    return value * 2;
  });
  assert.equal(maximum, 1);
  assert.deepEqual(values, [2, 4, 6, 8]);
});

test("the JSON report records the failing phase and exhausted attempts", async t => {
  const assets = await tempAssets(t);
  await fs.writeFile(path.join(assets, "campaigns", "example", "01.jpg"), "content");
  const networkError = () => Object.assign(new Error("connection reset"), {
    code: "ECONNRESET"
  });
  const client = {
    async send() {
      throw networkError();
    }
  };

  const report = await runMigration({
    assetsRoot: assets,
    client,
    config: TEST_CONFIG,
    dryRun: true,
    retryOptions: {
      maxAttempts: 2,
      baseDelayMs: 1,
      sleep: async () => {}
    }
  });

  assert.equal(report.files[0].status, "error");
  assert.equal(report.files[0].phase, "initial-head");
  assert.equal(report.files[0].attempts, 2);
  assert.equal(report.retryMaxAttempts, 2);
});

test("a conditional-write race is reported as a conflict", async t => {
  const assets = await tempAssets(t);
  const filePath = path.join(assets, "campaigns", "example", "01.jpg");
  await fs.writeFile(filePath, "content");
  const client = headClient([missingError()]);
  const precondition = new Error("object now exists");
  precondition.name = "PreconditionFailed";
  precondition.$metadata = { httpStatusCode: 412 };

  const result = await processFile({
    client,
    config: TEST_CONFIG,
    file: {
      absolutePath: filePath,
      key: "assets/campaigns/example/01.jpg",
      size: 7,
      contentType: "image/jpeg"
    },
    dryRun: false,
    partSize: DEFAULT_PART_SIZE,
    uploadFactory() {
      return { done: async () => { throw precondition; } };
    }
  });

  assert.equal(result.status, "conflict");
  assert.equal(result.reason, "object-created-during-upload");
});

test("error reporting redacts credential values", () => {
  const error = new Error(`request failed for ${TEST_CONFIG.accessKeyId}/${TEST_CONFIG.secretAccessKey}`);
  const reported = safeError(error, [TEST_CONFIG.accessKeyId, TEST_CONFIG.secretAccessKey]);
  assert.doesNotMatch(JSON.stringify(reported), /test-access-key|test-secret-key/);
  assert.match(reported.message, /\[REDACTED\]/);
});
