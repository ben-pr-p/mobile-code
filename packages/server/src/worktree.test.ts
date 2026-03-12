// Tests for the worktree driver.
// Uses real git repos created in temp directories — no mocks.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { WorktreeDriver, WorktreeError } from "./worktree";
import { $ } from "bun";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Each test gets a fresh git repo in a temp directory.
let repoDir: string;
let tempBase: string;

async function initRepo(): Promise<string> {
  // Use realpath to resolve symlinks (macOS: /var → /private/var)
  // so our paths match what git reports in `worktree list --porcelain`.
  tempBase = await realpath(await mkdtemp(join(tmpdir(), "worktree-test-")));
  const dir = join(tempBase, "repo");
  await $`mkdir -p ${dir}`.quiet();
  await $`git init`.quiet().cwd(dir);
  await $`git config user.email "test@test.com"`.quiet().cwd(dir);
  await $`git config user.name "Test"`.quiet().cwd(dir);
  // Need at least one commit for worktree operations to work
  await $`git commit --allow-empty -m "initial commit"`.quiet().cwd(dir);
  return dir;
}

beforeEach(async () => {
  repoDir = await initRepo();
});

afterEach(async () => {
  // Clean up all worktrees before removing the temp directory,
  // otherwise git locks can prevent deletion
  try {
    const driver = await WorktreeDriver.open(repoDir);
    const entries = await driver.list();
    for (const entry of entries) {
      if (entry.path !== repoDir) {
        await driver.remove(entry.path, { force: true });
      }
    }
  } catch {
    // best-effort cleanup
  }
  await rm(tempBase, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// open / config
// ---------------------------------------------------------------------------

describe("WorktreeDriver.open", () => {
  test("opens a repo without worktree.toml", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    expect(driver.repoRoot).toBe(repoDir);
    expect(driver.config).toEqual({});
  });

  test("reads worktree.toml when present", async () => {
    await Bun.write(
      join(repoDir, "worktree.toml"),
      '[hooks]\npost_checkout = "echo setup done"',
    );
    const driver = await WorktreeDriver.open(repoDir);
    expect(driver.config.hooks?.post_checkout).toBe("echo setup done");
  });

  test("ignores unknown keys in worktree.toml", async () => {
    await Bun.write(
      join(repoDir, "worktree.toml"),
      '[hooks]\npost_checkout = "bun install"\n\n[unknown]\nfoo = "bar"',
    );
    const driver = await WorktreeDriver.open(repoDir);
    expect(driver.config.hooks?.post_checkout).toBe("bun install");
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe("list", () => {
  test("lists the main worktree", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const entries = await driver.list();
    expect(entries.length).toBe(1);
    expect(entries[0].path).toBe(repoDir);
    expect(entries[0].head).toMatch(/^[0-9a-f]{40}$/);
    expect(entries[0].bare).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe("create", () => {
  test("creates a worktree with a new branch", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "feat-branch");
    const entry = await driver.create("feat-branch", { path: wtPath });

    expect(entry.path).toBe(wtPath);
    expect(entry.branch).toBe("refs/heads/feat-branch");

    // Verify the directory exists
    const dirExists = await Bun.file(join(wtPath, ".git")).exists();
    expect(dirExists).toBe(true);

    // Verify it shows up in list
    const entries = await driver.list();
    expect(entries.length).toBe(2);
  });

  test("creates worktree from a specific base", async () => {
    const driver = await WorktreeDriver.open(repoDir);

    // Make a second commit on main
    await $`git commit --allow-empty -m "second commit"`.quiet().cwd(repoDir);
    const headOutput = await $`git rev-parse HEAD`.quiet().cwd(repoDir);
    const headSha = headOutput.text().trim();

    // Get the first commit
    const firstOutput = await $`git rev-parse HEAD~1`.quiet().cwd(repoDir);
    const firstSha = firstOutput.text().trim();

    // Create worktree from first commit
    const wtPath = join(tempBase, "from-first");
    const entry = await driver.create("from-first", {
      path: wtPath,
      base: firstSha,
    });

    expect(entry.head).toBe(firstSha);
    expect(entry.head).not.toBe(headSha);
  });

  test("runs post_checkout hook", async () => {
    const marker = join(tempBase, "hook-ran");
    await Bun.write(
      join(repoDir, "worktree.toml"),
      `[hooks]\npost_checkout = "touch ${marker}"`,
    );
    const driver = await WorktreeDriver.open(repoDir);

    const wtPath = join(tempBase, "with-hook");
    await driver.create("with-hook", { path: wtPath });

    const markerExists = await Bun.file(marker).exists();
    expect(markerExists).toBe(true);
  });

  test("skips hook when skipHooks is true", async () => {
    const marker = join(tempBase, "hook-should-not-run");
    await Bun.write(
      join(repoDir, "worktree.toml"),
      `[hooks]\npost_checkout = "touch ${marker}"`,
    );
    const driver = await WorktreeDriver.open(repoDir);

    const wtPath = join(tempBase, "no-hook");
    await driver.create("no-hook", { path: wtPath, skipHooks: true });

    const markerExists = await Bun.file(marker).exists();
    expect(markerExists).toBe(false);
  });

  test("throws when branch already exists", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath1 = join(tempBase, "dup1");
    await driver.create("dup-branch", { path: wtPath1 });

    const wtPath2 = join(tempBase, "dup2");
    await expect(driver.create("dup-branch", { path: wtPath2 })).rejects.toThrow(WorktreeError);
  });
});

// ---------------------------------------------------------------------------
// merge
// ---------------------------------------------------------------------------

describe("merge", () => {
  test("merges a worktree branch into current branch", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "merge-src");
    await driver.create("merge-src", { path: wtPath });

    // Add a commit in the worktree
    await $`git commit --allow-empty -m "worktree commit"`.quiet().cwd(wtPath);

    // Merge back into main
    await driver.merge("merge-src");

    // Verify the commit is now on main
    const log = await $`git log --oneline`.quiet().cwd(repoDir);
    expect(log.text()).toContain("worktree commit");
  });

  test("squash merges a worktree branch", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "squash-src");
    await driver.create("squash-src", { path: wtPath });

    // Add multiple commits with actual file changes in the worktree
    await $`bash -c 'echo "a" > a.txt && git add a.txt && git commit -m "commit A"'`
      .quiet()
      .cwd(wtPath);
    await $`bash -c 'echo "b" > b.txt && git add b.txt && git commit -m "commit B"'`
      .quiet()
      .cwd(wtPath);

    await driver.merge("squash-src", { squash: true });

    // The individual messages shouldn't appear as separate commits on main
    const log = await $`git log --oneline`.quiet().cwd(repoDir);
    const lines = log.text().trim().split("\n");
    // Should have: initial commit + the squash merge commit = 2
    // (not 4: initial + A + B + merge)
    expect(lines.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe("remove", () => {
  test("removes a worktree by branch name", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "to-remove");
    await driver.create("to-remove", { path: wtPath });

    await driver.remove("to-remove");

    const entries = await driver.list();
    expect(entries.length).toBe(1);
  });

  test("removes a worktree by path", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "remove-by-path");
    await driver.create("remove-by-path", { path: wtPath });

    await driver.remove(wtPath);

    const entries = await driver.list();
    expect(entries.length).toBe(1);
  });

  test("deletes the branch when deleteBranch is true", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "delete-branch");
    await driver.create("delete-branch", { path: wtPath });

    await driver.remove("delete-branch", { deleteBranch: true });

    // Branch should be gone
    const result = await $`git branch --list delete-branch`.quiet().cwd(repoDir);
    expect(result.text().trim()).toBe("");
  });

  test("throws when worktree not found", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    await expect(driver.remove("nonexistent")).rejects.toThrow("No worktree found");
  });
});

// ---------------------------------------------------------------------------
// porcelain parsing (exercised indirectly through list, but test edge cases)
// ---------------------------------------------------------------------------

describe("porcelain parsing edge cases", () => {
  test("handles detached HEAD worktree", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const headOutput = await $`git rev-parse HEAD`.quiet().cwd(repoDir);
    const sha = headOutput.text().trim();

    // Create a worktree in detached HEAD state (no -b flag)
    const wtPath = join(tempBase, "detached");
    await $`git worktree add --detach ${wtPath} ${sha}`.quiet().cwd(repoDir);

    const entries = await driver.list();
    const detached = entries.find((e) => e.path === wtPath);
    expect(detached).toBeDefined();
    expect(detached!.branch).toBeNull();
  });
});
