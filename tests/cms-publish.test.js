"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  collectChangedMediaKeys,
  createPublishService,
  parseGitStatus
} = require("../cms/publish");

function createProject(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rrs-publish-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets", "campaigns", "new-campaign"), { recursive: true });
  fs.mkdirSync(path.join(root, "assets", "books", "book-10"), { recursive: true });
  fs.writeFileSync(path.join(root, "assets", "campaigns", "new-campaign", "01.webp"), "image");
  fs.writeFileSync(path.join(root, "assets", "books", "book-10", "video.mp4"), "video");
  return root;
}

function gitRunner(statusOutput) {
  const calls = [];
  const runner = async args => {
    calls.push(args);
    if (args[0] === "status") return { stdout: statusOutput, stderr: "" };
    return { stdout: `${args[0]} ok`, stderr: "" };
  };
  runner.calls = calls;
  return runner;
}

test("changed CMS media are selected incrementally while deletions and disabled roots are skipped", t => {
  const root = createProject(t);
  const state = parseGitStatus([
    "## main...origin/main",
    " M data/campaigns.js",
    "?? assets/campaigns/new-campaign/01.webp",
    "?? assets/books/book-10/video.mp4",
    " D assets/campaigns/removed/video.mp4",
    "?? assets/events/not-managed/video.mp4",
    "?? .env.r2.local",
    ""
  ].join("\0"));

  assert.deepEqual(collectChangedMediaKeys(state, root), [
    "assets/books/book-10/video.mp4",
    "assets/campaigns/new-campaign/01.webp"
  ]);
});

test("successful Publish syncs R2 before Git commit and push", async t => {
  const root = createProject(t);
  const git = gitRunner([
    "## main...origin/main",
    " M data/magazines-books.js",
    "?? assets/books/book-10/video.mp4",
    ""
  ].join("\0"));
  const operations = [];
  const service = createPublishService({
    projectRoot: root,
    runGitCommand: async args => {
      operations.push(`git:${args[0]}`);
      return git(args);
    },
    syncMedia: async keys => {
      operations.push("r2:sync");
      assert.deepEqual(keys, ["assets/books/book-10/video.mp4"]);
      return {
        summary: {
          total: 1,
          uploaded: 1,
          verified: 0,
          conflicts: 0,
          verificationFailed: 0,
          errors: 0,
          bytes: 5
        },
        files: [{ status: "uploaded" }]
      };
    }
  });

  const result = await service.publish({ message: "Portfolio update" });
  assert.equal(result.success, true);
  assert.deepEqual(operations, ["git:status", "r2:sync", "git:add", "git:commit", "git:push"]);
  assert.deepEqual(git.calls[2], ["commit", "-m", "Portfolio update"]);
});

test("an R2 failure blocks every mutating Git command and preserves local changes", async t => {
  const root = createProject(t);
  const git = gitRunner([
    "## main...origin/main",
    " M data/magazines-books.js",
    "?? assets/books/book-10/video.mp4",
    ""
  ].join("\0"));
  const service = createPublishService({
    projectRoot: root,
    runGitCommand: git,
    syncMedia: async () => {
      throw new Error("simulated R2 outage");
    }
  });

  await assert.rejects(
    service.publish({ message: "Portfolio update" }),
    /Git commit and push were not started.*simulated R2 outage/
  );
  assert.deepEqual(git.calls.map(args => args[0]), ["status"]);
  assert.equal(fs.existsSync(path.join(root, "assets", "books", "book-10", "video.mp4")), true);
});

test("a retry accepts already verified media without re-uploading it", async t => {
  const root = createProject(t);
  const git = gitRunner([
    "## main...origin/main",
    " M data/magazines-books.js",
    "?? assets/books/book-10/video.mp4",
    ""
  ].join("\0"));
  const service = createPublishService({
    projectRoot: root,
    runGitCommand: git,
    syncMedia: async () => ({
      summary: {
        total: 1,
        uploaded: 0,
        verified: 1,
        conflicts: 0,
        verificationFailed: 0,
        errors: 0,
        bytes: 5
      },
      files: [{ status: "verified" }]
    })
  });

  const result = await service.publish({ message: "Retry publish" });
  assert.equal(result.media.uploaded, 0);
  assert.equal(result.media.verified, 1);
  assert.deepEqual(git.calls.map(args => args[0]), ["status", "add", "commit", "push"]);
});

test("a second Publish with no changes performs no R2 or Git writes", async () => {
  const git = gitRunner("## main...origin/main\0");
  let syncCalls = 0;
  const service = createPublishService({
    runGitCommand: git,
    syncMedia: async () => {
      syncCalls += 1;
    }
  });

  const result = await service.publish({ message: "Nothing" });
  assert.equal(result.nothingToPublish, true);
  assert.equal(syncCalls, 0);
  assert.deepEqual(git.calls.map(args => args[0]), ["status"]);
});

test("metadata-only publishes skip R2 and preserve the existing Git flow", async () => {
  const git = gitRunner("## main...origin/main\0 M data/magazines-books.js\0");
  let syncCalls = 0;
  const service = createPublishService({
    runGitCommand: git,
    syncMedia: async () => {
      syncCalls += 1;
    }
  });

  await service.publish({ message: "Reorder books" });
  assert.equal(syncCalls, 0);
  assert.deepEqual(git.calls.map(args => args[0]), ["status", "add", "commit", "push"]);
});

test("the existing CMS button reports R2 progress, success counts, and readable errors", () => {
  const clientSource = fs.readFileSync(path.resolve(__dirname, "../admin.js"), "utf8");
  const serverSource = fs.readFileSync(path.resolve(__dirname, "../admin-server.js"), "utf8");

  assert.match(clientSource, /Synchronizing media with Cloudflare R2/);
  assert.match(clientSource, /media\.uploaded[\s\S]*?media\.verified/);
  assert.match(clientSource, /PUBLISH ERROR/);
  assert.match(clientSource, /publishButton\.disabled = true/);
  assert.match(clientSource, /finally[\s\S]*?publishButton\.disabled = false/);
  assert.match(serverSource, /createPublishService/);
  assert.match(serverSource, /publishInProgress/);
});
