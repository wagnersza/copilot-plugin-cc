import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import { createTempWorkspace, cleanupDir } from "./helpers.mjs";
import {
  ensureGitRepository,
  getRepoRoot,
  detectDefaultBranch,
  getCurrentBranch,
  getWorkingTreeState,
  resolveReviewTarget,
  collectReviewContext
} from "../plugins/copilot/scripts/lib/git.mjs";

describe("git", () => {
  let tempDir;

  before(() => {
    tempDir = createTempWorkspace();
    execSync("git init", { cwd: tempDir });
    execSync("git config user.email test@test.com", { cwd: tempDir });
    execSync("git config user.name Test", { cwd: tempDir });
    fs.writeFileSync(path.join(tempDir, "file.txt"), "hello");
    execSync("git add . && git commit -m init", { cwd: tempDir });
  });

  after(() => cleanupDir(tempDir));

  it("ensureGitRepository returns repo root", () => {
    const root = ensureGitRepository(tempDir);
    assert.ok(root);
  });

  it("ensureGitRepository throws outside repo", () => {
    const nonRepo = createTempWorkspace();
    assert.throws(() => ensureGitRepository(nonRepo), /Git repository/);
    cleanupDir(nonRepo);
  });

  it("getRepoRoot returns root", () => {
    const root = getRepoRoot(tempDir);
    assert.ok(root);
  });

  it("getCurrentBranch returns branch name", () => {
    const branch = getCurrentBranch(tempDir);
    assert.ok(branch);
  });

  it("getWorkingTreeState returns clean state", () => {
    const state = getWorkingTreeState(tempDir);
    assert.equal(state.isDirty, false);
  });

  it("getWorkingTreeState detects dirty state", () => {
    fs.writeFileSync(path.join(tempDir, "dirty.txt"), "dirty");
    const state = getWorkingTreeState(tempDir);
    assert.equal(state.isDirty, true);
    fs.unlinkSync(path.join(tempDir, "dirty.txt"));
  });

  it("resolveReviewTarget auto-detects working tree when dirty", () => {
    fs.writeFileSync(path.join(tempDir, "new.txt"), "new");
    const target = resolveReviewTarget(tempDir);
    assert.equal(target.mode, "working-tree");
    fs.unlinkSync(path.join(tempDir, "new.txt"));
  });

  it("resolveReviewTarget respects explicit scope", () => {
    const target = resolveReviewTarget(tempDir, { scope: "working-tree" });
    assert.equal(target.mode, "working-tree");
    assert.equal(target.explicit, true);
  });

  it("resolveReviewTarget respects explicit base", () => {
    const target = resolveReviewTarget(tempDir, { base: "HEAD" });
    assert.equal(target.mode, "branch");
    assert.equal(target.baseRef, "HEAD");
  });

  it("collectReviewContext returns context for working-tree", () => {
    fs.writeFileSync(path.join(tempDir, "review.txt"), "review me");
    const target = resolveReviewTarget(tempDir, { scope: "working-tree" });
    const context = collectReviewContext(tempDir, target);
    assert.equal(context.mode, "working-tree");
    assert.ok(context.content);
    fs.unlinkSync(path.join(tempDir, "review.txt"));
  });
});
