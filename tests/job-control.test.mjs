import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import { createTempWorkspace, cleanupDir } from "./helpers.mjs";
import { generateJobId, upsertJob } from "../plugins/copilot/scripts/lib/state.mjs";
import {
  appendLogLine,
  createJobLogFile,
  createJobRecord,
  SESSION_ID_ENV
} from "../plugins/copilot/scripts/lib/tracked-jobs.mjs";
import {
  enrichJob,
  readJobProgressPreview,
  sortJobsNewestFirst,
  resolveResultJob,
  resolveCancelableJob
} from "../plugins/copilot/scripts/lib/job-control.mjs";

describe("tracked-jobs", () => {
  let tempDir;
  let origEnv;

  before(() => {
    tempDir = createTempWorkspace();
    execSync("git init", { cwd: tempDir });
    execSync("git config user.email test@test.com", { cwd: tempDir });
    execSync("git config user.name Test", { cwd: tempDir });
    fs.writeFileSync(path.join(tempDir, "f.txt"), "x");
    execSync("git add . && git commit -m init", { cwd: tempDir });
    origEnv = process.env.CLAUDE_PLUGIN_DATA;
    process.env.CLAUDE_PLUGIN_DATA = path.join(tempDir, ".plugin-data");
  });

  after(() => {
    if (origEnv === undefined) delete process.env.CLAUDE_PLUGIN_DATA;
    else process.env.CLAUDE_PLUGIN_DATA = origEnv;
    cleanupDir(tempDir);
  });

  it("SESSION_ID_ENV is COPILOT_COMPANION_SESSION_ID", () => {
    assert.equal(SESSION_ID_ENV, "COPILOT_COMPANION_SESSION_ID");
  });

  it("createJobRecord sets sessionId from env", () => {
    const record = createJobRecord({ id: "test" }, {
      env: { COPILOT_COMPANION_SESSION_ID: "sess-123" }
    });
    assert.equal(record.sessionId, "sess-123");
  });

  it("createJobLogFile creates log and appends title", () => {
    const logFile = createJobLogFile(tempDir, "log-test", "Test Title");
    assert.ok(fs.existsSync(logFile));
    const content = fs.readFileSync(logFile, "utf8");
    assert.match(content, /Starting Test Title/);
  });

  it("appendLogLine writes timestamped lines", () => {
    const logFile = createJobLogFile(tempDir, "append-test", null);
    appendLogLine(logFile, "Hello");
    const content = fs.readFileSync(logFile, "utf8");
    assert.match(content, /\[.*\] Hello/);
  });
});

describe("job-control", () => {
  let tempDir;
  let origEnv;

  before(() => {
    tempDir = createTempWorkspace();
    execSync("git init", { cwd: tempDir });
    execSync("git config user.email test@test.com", { cwd: tempDir });
    execSync("git config user.name Test", { cwd: tempDir });
    fs.writeFileSync(path.join(tempDir, "f.txt"), "x");
    execSync("git add . && git commit -m init", { cwd: tempDir });
    origEnv = process.env.CLAUDE_PLUGIN_DATA;
    process.env.CLAUDE_PLUGIN_DATA = path.join(tempDir, ".plugin-data");
  });

  after(() => {
    if (origEnv === undefined) delete process.env.CLAUDE_PLUGIN_DATA;
    else process.env.CLAUDE_PLUGIN_DATA = origEnv;
    cleanupDir(tempDir);
  });

  it("sortJobsNewestFirst sorts by updatedAt descending", () => {
    const jobs = [
      { id: "a", updatedAt: "2026-01-01T00:00:00Z" },
      { id: "b", updatedAt: "2026-01-02T00:00:00Z" }
    ];
    const sorted = sortJobsNewestFirst(jobs);
    assert.equal(sorted[0].id, "b");
  });

  it("enrichJob adds kindLabel and timing", () => {
    const enriched = enrichJob({
      id: "j1",
      status: "completed",
      jobClass: "task",
      createdAt: new Date(Date.now() - 60000).toISOString(),
      completedAt: new Date().toISOString()
    });
    assert.equal(enriched.kindLabel, "rescue");
    assert.ok(enriched.duration);
  });

  it("resolveResultJob throws when no jobs exist", () => {
    assert.throws(() => resolveResultJob(tempDir, ""), /No finished/);
  });

  it("resolveCancelableJob throws when no active jobs", () => {
    assert.throws(() => resolveCancelableJob(tempDir, ""), /No active/);
  });
});
