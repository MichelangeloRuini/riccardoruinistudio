"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const {
  CONTENT_TYPES,
  createR2Client,
  loadConfig,
  loadLocalEnvFile,
  runMigration
} = require("../tools/upload-assets-r2");

const execFileAsync = promisify(execFile);
const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, "..");
const MANAGED_MEDIA_PREFIXES = Object.freeze([
  "assets/campaigns/",
  "assets/identities/",
  "assets/books/"
]);

function parseGitStatus(output) {
  const records = String(output || "").split("\0").filter(Boolean);
  const branchRecord = records[0]?.startsWith("## ") ? records.shift() : "";
  const aheadMatch = branchRecord.match(/\bahead (\d+)/);
  const entries = records.map(record => ({
    status: record.slice(0, 2),
    path: record.slice(3)
  })).filter(entry => entry.path);

  return {
    ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
    branch: branchRecord.slice(3),
    entries
  };
}

function isManagedMediaPath(relativePath) {
  const normalized = String(relativePath || "").split(path.sep).join("/");
  const extension = path.posix.extname(normalized).toLowerCase();

  return MANAGED_MEDIA_PREFIXES.some(prefix => normalized.startsWith(prefix))
    && Object.prototype.hasOwnProperty.call(CONTENT_TYPES, extension);
}

function collectChangedMediaKeys(gitState, projectRoot = DEFAULT_PROJECT_ROOT) {
  return Array.from(new Set(gitState.entries
    .filter(entry => !entry.status.includes("D"))
    .map(entry => entry.path)
    .filter(isManagedMediaPath)
    .filter(relativePath => {
      const absolutePath = path.resolve(projectRoot, relativePath);
      return absolutePath.startsWith(`${path.resolve(projectRoot, "assets")}${path.sep}`)
        && fs.existsSync(absolutePath)
        && fs.statSync(absolutePath).isFile();
    })
    .map(relativePath => relativePath.split(path.sep).join("/"))))
    .sort((left, right) => left.localeCompare(right));
}

async function runGit(args, { projectRoot = DEFAULT_PROJECT_ROOT } = {}) {
  const result = await execFileAsync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

async function readGitState(runGitCommand, projectRoot) {
  const result = await runGitCommand([
    "status",
    "--porcelain=v1",
    "-z",
    "--branch",
    "--untracked-files=all",
    "--no-renames"
  ], { projectRoot });
  return parseGitStatus(result.stdout);
}

function emptyMediaSummary() {
  return {
    total: 0,
    uploaded: 0,
    verified: 0,
    conflicts: 0,
    verificationFailed: 0,
    errors: 0,
    bytes: 0
  };
}

function assertSuccessfulMediaSync(report) {
  const summary = report?.summary || emptyMediaSummary();
  const failed = Number(summary.pending || 0)
    + Number(summary.conflicts || 0)
    + Number(summary.verificationFailed || 0)
    + Number(summary.errors || 0);
  if (!failed) return report;

  const firstFailure = report.files.find(file => (
    file.status === "conflict"
    || file.status === "verification-failed"
    || file.status === "error"
  ));
  const detail = firstFailure?.error?.message
    || (firstFailure ? `${firstFailure.key}: ${firstFailure.status}` : "unknown R2 error");
  throw new Error(`R2 media synchronization failed: ${detail}`);
}

async function syncMediaToR2(mediaKeys, {
  projectRoot = DEFAULT_PROJECT_ROOT,
  env = process.env
} = {}) {
  if (mediaKeys.length === 0) {
    return { summary: emptyMediaSummary(), files: [] };
  }

  loadLocalEnvFile(path.join(projectRoot, ".env.r2.local"));
  const config = loadConfig(env);
  const client = createR2Client(config);

  try {
    const report = await runMigration({
      assetsRoot: path.join(projectRoot, "assets"),
      client,
      config,
      dryRun: false,
      fileKeys: mediaKeys,
      overwriteExisting: true
    });
    return assertSuccessfulMediaSync(report);
  } finally {
    client.destroy();
  }
}

function normalizeCommitMessage(message) {
  const normalized = typeof message === "string" ? message.trim() : "";
  return normalized.slice(0, 200) || "CMS publish update";
}

function createPublishService({
  projectRoot = DEFAULT_PROJECT_ROOT,
  runGitCommand = runGit,
  syncMedia = syncMediaToR2
} = {}) {
  async function publish({ message } = {}) {
    const gitState = await readGitState(runGitCommand, projectRoot);
    const hasChanges = gitState.entries.length > 0;

    if (!hasChanges && gitState.ahead === 0) {
      return {
        success: true,
        nothingToPublish: true,
        media: emptyMediaSummary()
      };
    }

    const mediaKeys = collectChangedMediaKeys(gitState, projectRoot);
    let mediaReport = { summary: emptyMediaSummary(), files: [] };

    if (mediaKeys.length > 0) {
      try {
        mediaReport = assertSuccessfulMediaSync(await syncMedia(mediaKeys, { projectRoot }));
      } catch (error) {
        throw new Error(
          `Cloudflare R2 sync failed. Git commit and push were not started. ${error.message}`
        );
      }
    }

    const output = [];
    if (hasChanges) {
      output.push((await runGitCommand(["add", "--all"], { projectRoot })).stdout);
      output.push((await runGitCommand([
        "commit",
        "-m",
        normalizeCommitMessage(message)
      ], { projectRoot })).stdout);
    }

    output.push((await runGitCommand(["push"], { projectRoot })).stdout);
    return {
      success: true,
      media: mediaReport.summary,
      output: output.filter(Boolean).join("\n")
    };
  }

  return { publish };
}

module.exports = {
  MANAGED_MEDIA_PREFIXES,
  assertSuccessfulMediaSync,
  collectChangedMediaKeys,
  createPublishService,
  emptyMediaSummary,
  isManagedMediaPath,
  normalizeCommitMessage,
  parseGitStatus,
  readGitState,
  runGit,
  syncMediaToR2
};
