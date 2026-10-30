#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { Transform } = require("node:stream");

const { HeadObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_ASSETS_ROOT = path.join(PROJECT_ROOT, "assets");
const DEFAULT_ENV_FILE = path.join(PROJECT_ROOT, ".env.r2.local");
const EXPECTED_BUCKET = "rrs-media";
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_PART_SIZE = 16 * 1024 * 1024;
const DEFAULT_MULTIPART_CONCURRENCY = 2;
const DEFAULT_OPERATION_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 4000;
const MIN_PART_SIZE = 5 * 1024 * 1024;
const TRANSIENT_ERROR_CODES = new Set([
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "EADDRNOTAVAIL"
]);

const CONTENT_TYPES = Object.freeze({
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4"
});

function usage() {
  return [
    "Usage: node tools/upload-assets-r2.js [options]",
    "",
    "The default mode is dry-run: it reads R2 metadata but never writes objects.",
    "",
    "Options:",
    "  --dry-run                 Explicitly select read-only mode (default)",
    "  --apply                   Upload objects that do not exist; never overwrite conflicts",
    "  --file <assets/path>      Process exactly one asset key",
    "  --report <path>           Write the final JSON report to a local file",
    `  --concurrency <n>         Files processed concurrently (default: ${DEFAULT_CONCURRENCY})`,
    `  --part-size-mib <n>       Multipart part size/threshold (default: ${DEFAULT_PART_SIZE / 1024 / 1024}, min: 5)`,
    "  --help                    Show this help",
    "",
    "Required environment variables:",
    "  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET",
    "  Loaded automatically from .env.r2.local; exported values take precedence.",
    "",
    `R2_BUCKET must be ${EXPECTED_BUCKET}. Credentials are never printed or stored.`
  ].join("\n");
}

function parsePositiveInteger(value, flag) {
  if (!/^\d+$/.test(value || "") || Number(value) < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return Number(value);
}

function parseArgs(argv) {
  const options = {
    dryRun: true,
    reportPath: null,
    file: null,
    concurrency: DEFAULT_CONCURRENCY,
    partSize: DEFAULT_PART_SIZE,
    help: false
  };
  let modeFlag = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--dry-run" || argument === "--apply") {
      if (modeFlag && modeFlag !== argument) {
        throw new Error("Choose only one of --dry-run or --apply");
      }
      modeFlag = argument;
      options.dryRun = argument !== "--apply";
    } else if (argument === "--report") {
      options.reportPath = argv[++index];
      if (!options.reportPath) throw new Error("--report requires a path");
    } else if (argument === "--file") {
      if (options.file !== null) throw new Error("--file may be specified only once");
      options.file = normalizeRequestedKey(argv[++index]);
    } else if (argument === "--concurrency") {
      options.concurrency = parsePositiveInteger(argv[++index], "--concurrency");
    } else if (argument === "--part-size-mib") {
      const mebibytes = parsePositiveInteger(argv[++index], "--part-size-mib");
      options.partSize = mebibytes * 1024 * 1024;
      if (options.partSize < MIN_PART_SIZE) {
        throw new Error("--part-size-mib must be at least 5");
      }
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function normalizeRequestedKey(value) {
  if (!value) throw new Error("--file requires an assets/ path");
  if (value.includes("\\") || value.includes("\0") || path.posix.isAbsolute(value)) {
    throw new Error("--file must be a relative POSIX path below assets/");
  }

  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    !normalized.startsWith("assets/") ||
    normalized === "assets/" ||
    normalized.endsWith("/")
  ) {
    throw new Error("--file must be a canonical path below assets/");
  }
  return normalized;
}

function loadLocalEnvFile(envFilePath = DEFAULT_ENV_FILE) {
  if (!fs.existsSync(envFilePath)) return false;
  if (typeof process.loadEnvFile !== "function") {
    throw new Error("Loading .env.r2.local requires Node.js 20.12 or newer");
  }

  try {
    process.loadEnvFile(envFilePath);
  } catch {
    throw new Error(
      `Could not load ${path.basename(envFilePath)}. Check that every line uses NAME=value format.`
    );
  }
  return true;
}

function loadConfig(env = process.env) {
  const required = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET"
  ];
  const missing = required.filter(name => !env[name] || !env[name].trim());
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  if (env.R2_BUCKET !== EXPECTED_BUCKET) {
    throw new Error(`R2_BUCKET must be ${EXPECTED_BUCKET}`);
  }
  if (!/^[a-zA-Z0-9]+$/.test(env.R2_ACCOUNT_ID)) {
    throw new Error("R2_ACCOUNT_ID has an invalid format");
  }

  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET
  };
}

function createR2Client(config) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    maxAttempts: 3,
    retryMode: "standard",
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function shouldExclude(relativePath) {
  const basename = path.posix.basename(toPosixPath(relativePath));
  return basename === ".DS_Store" || basename === "data.json";
}

function contentTypeFor(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

async function collectAssetFiles(assetsRoot = DEFAULT_ASSETS_ROOT) {
  const files = [];
  const excluded = [];

  async function visit(directory) {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        const relativeWithinAssets = toPosixPath(path.relative(assetsRoot, absolutePath));
        const key = `assets/${relativeWithinAssets}`;
        if (shouldExclude(relativeWithinAssets)) {
          excluded.push({ key, reason: entry.name });
        } else {
          const stats = await fsp.stat(absolutePath);
          files.push({
            absolutePath,
            key,
            size: stats.size,
            contentType: contentTypeFor(absolutePath)
          });
        }
      }
    }
  }

  await visit(assetsRoot);
  files.sort((left, right) => left.key.localeCompare(right.key));
  excluded.sort((left, right) => left.key.localeCompare(right.key));
  return { files, excluded };
}

function selectAssetFiles(inventory, requestedKeys = null) {
  if (requestedKeys === null) return inventory;

  const keys = Array.isArray(requestedKeys) ? requestedKeys : [requestedKeys];
  const uniqueKeys = new Set(keys);
  if (keys.length === 0 || uniqueKeys.size !== keys.length) {
    throw new Error("Requested asset keys must be a non-empty unique list");
  }

  const files = inventory.files.filter(file => uniqueKeys.has(file.key));
  if (files.length !== keys.length) {
    const matched = new Set(files.map(file => file.key));
    const missing = keys.filter(key => !matched.has(key));
    if (!Array.isArray(requestedKeys)) {
      throw new Error(`--file did not match exactly one publishable asset: ${missing[0]}`);
    }
    throw new Error(`Requested asset did not match a publishable file: ${missing.join(", ")}`);
  }
  return { files, excluded: [] };
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  await pipeline(
    fs.createReadStream(filePath),
    new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      }
    }),
    new Transform({
      transform(_chunk, _encoding, callback) {
        callback();
      }
    })
  );
  return hash.digest("hex");
}

function isNotFound(error) {
  return error && (
    error.name === "NotFound" ||
    error.name === "NoSuchKey" ||
    error.Code === "NotFound" ||
    error.Code === "NoSuchKey" ||
    error.$metadata?.httpStatusCode === 404
  );
}

function isPreconditionFailed(error) {
  return error && (
    error.name === "PreconditionFailed" ||
    error.Code === "PreconditionFailed" ||
    error.$metadata?.httpStatusCode === 412
  );
}

function isTransientError(error) {
  const code = error?.Code || error?.code;
  const status = error?.$metadata?.httpStatusCode;
  return TRANSIENT_ERROR_CODES.has(code) || status === 500 || status === 503;
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function withRetry(operation, {
  maxAttempts = DEFAULT_OPERATION_MAX_ATTEMPTS,
  baseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
  sleep = delay
} = {}) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await operation(attempt);
    } catch (error) {
      error.retryAttempts = attempt;
      if (!isTransientError(error) || attempt >= maxAttempts) throw error;
      const backoff = Math.min(baseDelayMs * (2 ** (attempt - 1)), MAX_RETRY_DELAY_MS);
      await sleep(backoff);
    }
  }
  throw new Error("Retry loop ended unexpectedly");
}

function withPhase(error, phase) {
  error.phase = phase;
  return error;
}

function normalizedMetadata(metadata = {}) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key.toLowerCase(), String(value)])
  );
}

function compareRemote(head, file, sha256) {
  const metadata = normalizedMetadata(head.Metadata);
  const checks = {
    size: Number(head.ContentLength) === file.size,
    sha256: metadata.sha256 === sha256,
    contentType: head.ContentType === file.contentType
  };
  return {
    matches: checks.size && checks.sha256 && checks.contentType,
    checks
  };
}

async function headObject(client, bucket, key) {
  try {
    return await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function safeError(error, secrets = []) {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join("[REDACTED]");
  }
  return {
    name: error?.name || "Error",
    code: error?.Code || error?.code || null,
    httpStatusCode: error?.$metadata?.httpStatusCode || null,
    message
  };
}

function defaultUploadFactory({
  client,
  params,
  partSize,
  queueSize = DEFAULT_MULTIPART_CONCURRENCY
}) {
  return new Upload({
    client,
    params,
    queueSize,
    partSize,
    leavePartsOnError: false
  });
}

async function processFile({
  client,
  config,
  file,
  dryRun,
  partSize,
  multipartConcurrency = DEFAULT_MULTIPART_CONCURRENCY,
  uploadFactory = defaultUploadFactory,
  retryOptions,
  overwriteExisting = false
}) {
  const sha256 = await hashFile(file.absolutePath);
  const baseResult = {
    key: file.key,
    bytes: file.size,
    contentType: file.contentType,
    sha256
  };
  let existing;
  try {
    existing = await withRetry(
      () => headObject(client, config.bucket, file.key),
      retryOptions
    );
  } catch (error) {
    throw withPhase(error, "initial-head");
  }

  let replacingExisting = false;
  if (existing) {
    const comparison = compareRemote(existing, file, sha256);
    if (comparison.matches) {
      return { ...baseResult, status: "verified", checks: comparison.checks };
    }
    if (!overwriteExisting) {
      return { ...baseResult, status: "conflict", checks: comparison.checks };
    }
    replacingExisting = true;
  }

  if (dryRun) return { ...baseResult, status: "pending" };

  const multipart = file.size > partSize;
  const uploadParams = {
    Bucket: config.bucket,
    Key: file.key,
    ContentLength: file.size,
    ContentType: file.contentType,
    ...(!replacingExisting && { IfNoneMatch: "*" }),
    Metadata: {
      sha256,
      "source-size": String(file.size)
    },
    ...(!multipart && { ChecksumAlgorithm: "SHA256" })
  };

  try {
    await withRetry(async () => {
      const body = fs.createReadStream(file.absolutePath);
      const upload = uploadFactory({
        client,
        partSize,
        queueSize: multipartConcurrency,
        params: { ...uploadParams, Body: body }
      });
      try {
        return await upload.done();
      } finally {
        if (!body.destroyed) body.destroy();
      }
    }, retryOptions);
  } catch (error) {
    if (isPreconditionFailed(error)) {
      return { ...baseResult, status: "conflict", reason: "object-created-during-upload" };
    }
    throw withPhase(error, "upload");
  }

  let uploaded;
  try {
    uploaded = await withRetry(
      () => headObject(client, config.bucket, file.key),
      retryOptions
    );
  } catch (error) {
    throw withPhase(error, "post-upload-head");
  }
  if (!uploaded) {
    throw withPhase(new Error("Object is missing after upload"), "post-upload-head");
  }
  const comparison = compareRemote(uploaded, file, sha256);
  if (!comparison.matches) {
    return { ...baseResult, status: "verification-failed", checks: comparison.checks };
  }
  return {
    ...baseResult,
    status: "uploaded",
    checks: comparison.checks,
    multipart,
    replaced: replacingExisting
  };
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.min(concurrency, Math.max(items.length, 1));
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

function summarize(results) {
  const counts = {
    total: results.length,
    uploaded: 0,
    verified: 0,
    pending: 0,
    conflicts: 0,
    verificationFailed: 0,
    errors: 0
  };
  for (const result of results) {
    if (result.status === "uploaded") counts.uploaded += 1;
    else if (result.status === "verified") counts.verified += 1;
    else if (result.status === "pending") counts.pending += 1;
    else if (result.status === "conflict") counts.conflicts += 1;
    else if (result.status === "verification-failed") counts.verificationFailed += 1;
    else if (result.status === "error") counts.errors += 1;
  }
  return counts;
}

async function runMigration({
  assetsRoot = DEFAULT_ASSETS_ROOT,
  client,
  config,
  dryRun = true,
  concurrency = DEFAULT_CONCURRENCY,
  partSize = DEFAULT_PART_SIZE,
  multipartConcurrency = DEFAULT_MULTIPART_CONCURRENCY,
  uploadFactory,
  retryOptions,
  fileKey = null,
  fileKeys = null,
  overwriteExisting = false,
  now = () => new Date()
}) {
  if (fileKey !== null && fileKeys !== null) {
    throw new Error("Choose only one of fileKey or fileKeys");
  }
  const inventory = await collectAssetFiles(assetsRoot);
  const requestedKeys = fileKeys === null ? fileKey : fileKeys;
  const { files, excluded } = selectAssetFiles(inventory, requestedKeys);
  const secrets = [config.accountId, config.accessKeyId, config.secretAccessKey];
  const startedAt = now().toISOString();

  const results = await mapConcurrent(files, concurrency, async file => {
    try {
      return await processFile({
        client,
        config,
        file,
        dryRun,
        partSize,
        multipartConcurrency,
        uploadFactory,
        retryOptions,
        overwriteExisting
      });
    } catch (error) {
      return {
        key: file.key,
        bytes: file.size,
        contentType: file.contentType,
        status: "error",
        phase: error.phase || null,
        attempts: error.retryAttempts || 1,
        error: safeError(error, secrets)
      };
    }
  });

  return {
    mode: dryRun ? "dry-run" : "apply",
    bucket: config.bucket,
    selectedFile: fileKey,
    selectedFiles: fileKeys,
    startedAt,
    finishedAt: now().toISOString(),
    multipartThresholdBytes: partSize,
    multipartConcurrency,
    retryMaxAttempts: retryOptions?.maxAttempts || DEFAULT_OPERATION_MAX_ATTEMPTS,
    excluded,
    summary: {
      ...summarize(results),
      excluded: excluded.length,
      bytes: files.reduce((total, file) => total + file.size, 0)
    },
    files: results
  };
}

function printReport(report, output = console.log) {
  output(`R2 asset migration (${report.mode})`);
  output(`Bucket: ${report.bucket}`);
  if (report.selectedFile) output(`Selected file: ${report.selectedFile}`);
  output(`Files: ${report.summary.total}; bytes: ${report.summary.bytes}`);
  output(
    `Uploaded: ${report.summary.uploaded}; verified: ${report.summary.verified}; ` +
    `pending: ${report.summary.pending}; conflicts: ${report.summary.conflicts}; ` +
    `verification failures: ${report.summary.verificationFailed}; errors: ${report.summary.errors}`
  );
  output(`Excluded metadata/system files: ${report.summary.excluded}`);
}

async function writeReport(reportPath, report) {
  const resolved = path.resolve(PROJECT_ROOT, reportPath);
  await fsp.mkdir(path.dirname(resolved), { recursive: true });
  await fsp.writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  return resolved;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  loadLocalEnvFile();
  const config = loadConfig(env);
  const client = createR2Client(config);
  const report = await runMigration({
    client,
    config,
    dryRun: options.dryRun,
    concurrency: options.concurrency,
    partSize: options.partSize,
    fileKey: options.file
  });
  printReport(report);

  if (options.reportPath) {
    const reportPath = await writeReport(options.reportPath, report);
    console.log(`Local JSON report: ${reportPath}`);
  }

  return report.summary.conflicts || report.summary.verificationFailed || report.summary.errors ? 1 : 0;
}

if (require.main === module) {
  main()
    .then(exitCode => {
      process.exitCode = exitCode;
    })
    .catch(error => {
      console.error(`R2 asset migration failed: ${safeError(error).message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  CONTENT_TYPES,
  DEFAULT_MULTIPART_CONCURRENCY,
  DEFAULT_OPERATION_MAX_ATTEMPTS,
  DEFAULT_PART_SIZE,
  EXPECTED_BUCKET,
  collectAssetFiles,
  compareRemote,
  contentTypeFor,
  createR2Client,
  defaultUploadFactory,
  hashFile,
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
  summarize,
  usage,
  withRetry,
  writeReport
};
