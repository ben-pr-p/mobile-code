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
  test("throws when no post_checkout hook is configured", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "no-config");
    await expect(driver.create("no-config", { path: wtPath })).rejects.toThrow(
      "No post_checkout hook configured",
    );
  });

  test("creates a worktree with a new branch", async () => {
    await Bun.write(
      join(repoDir, "worktree.toml"),
      '[hooks]\npost_checkout = "echo setup"',
    );
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
    await Bun.write(
      join(repoDir, "worktree.toml"),
      '[hooks]\npost_checkout = "echo setup"',
    );
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

  test("allows creation without config when skipHooks is true", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "skip-hooks-no-config");
    const entry = await driver.create("skip-hooks-no-config", {
      path: wtPath,
      skipHooks: true,
    });

    expect(entry.path).toBe(wtPath);
    expect(entry.branch).toBe("refs/heads/skip-hooks-no-config");
  });

  test("throws when branch already exists", async () => {
    await Bun.write(
      join(repoDir, "worktree.toml"),
      '[hooks]\npost_checkout = "echo setup"',
    );
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
  beforeEach(async () => {
    await Bun.write(
      join(repoDir, "worktree.toml"),
      '[hooks]\npost_checkout = "echo setup"',
    );
    await $`git add worktree.toml && git commit -m "add worktree config"`.quiet().cwd(repoDir);
  });

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
    // Should have: initial commit + worktree config + the squash merge commit = 3
    // (not 5: initial + config + A + B + merge)
    expect(lines.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// branchForPath
// ---------------------------------------------------------------------------

describe("branchForPath", () => {
  beforeEach(async () => {
    await Bun.write(
      join(repoDir, "worktree.toml"),
      '[hooks]\npost_checkout = "echo setup"',
    );
    await $`git add worktree.toml && git commit -m "add worktree config"`.quiet().cwd(repoDir);
  });

  test("resolves the branch name for a worktree path", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "branch-lookup");
    await driver.create("feat/branch-lookup", { path: wtPath });

    const branch = await driver.branchForPath(wtPath);
    expect(branch).toBe("feat/branch-lookup");
  });

  test("returns null for an unknown path", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const branch = await driver.branchForPath("/nonexistent/path");
    expect(branch).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isMerged / hasUnmergedCommits
// ---------------------------------------------------------------------------

describe("isMerged", () => {
  beforeEach(async () => {
    await Bun.write(
      join(repoDir, "worktree.toml"),
      '[hooks]\npost_checkout = "echo setup"',
    );
    await $`git add worktree.toml && git commit -m "add worktree config"`.quiet().cwd(repoDir);
  });

  test("returns false before merge", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "unmerged");
    await driver.create("unmerged-branch", { path: wtPath });
    await $`git commit --allow-empty -m "unmerged work"`.quiet().cwd(wtPath);

    expect(await driver.isMerged("unmerged-branch", "main")).toBe(false);
  });

  test("returns true after --no-ff merge", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "merged-noff");
    await driver.create("merged-noff-branch", { path: wtPath });
    await $`git commit --allow-empty -m "to merge"`.quiet().cwd(wtPath);

    await driver.merge("merged-noff-branch", { into: "main" });

    expect(await driver.isMerged("merged-noff-branch", "main")).toBe(true);
  });
});

describe("hasUnmergedCommits", () => {
  beforeEach(async () => {
    await Bun.write(
      join(repoDir, "worktree.toml"),
      '[hooks]\npost_checkout = "echo setup"',
    );
    await $`git add worktree.toml && git commit -m "add worktree config"`.quiet().cwd(repoDir);
  });

  test("returns true when branch has commits not in main", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "has-unmerged");
    await driver.create("has-unmerged-branch", { path: wtPath });
    await $`git commit --allow-empty -m "new work"`.quiet().cwd(wtPath);

    expect(await driver.hasUnmergedCommits("has-unmerged-branch", "main")).toBe(true);
  });

  test("returns false after merge with no new commits", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "no-unmerged");
    await driver.create("no-unmerged-branch", { path: wtPath });
    await $`git commit --allow-empty -m "work"`.quiet().cwd(wtPath);

    await driver.merge("no-unmerged-branch", { into: "main" });

    expect(await driver.hasUnmergedCommits("no-unmerged-branch", "main")).toBe(false);
  });

  test("returns true after merge when new commits added", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "post-merge-work");
    await driver.create("post-merge-branch", { path: wtPath });
    await $`git commit --allow-empty -m "first work"`.quiet().cwd(wtPath);

    await driver.merge("post-merge-branch", { into: "main" });
    // Add more work after merge
    await $`git commit --allow-empty -m "more work"`.quiet().cwd(wtPath);

    expect(await driver.hasUnmergedCommits("post-merge-branch", "main")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canMerge
// ---------------------------------------------------------------------------

describe("canMerge", () => {
  beforeEach(async () => {
    await Bun.write(
      join(repoDir, "worktree.toml"),
      '[hooks]\npost_checkout = "echo setup"',
    );
    await $`git add worktree.toml && git commit -m "add worktree config"`.quiet().cwd(repoDir);
  });

  test("returns ok:true for a clean merge", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "clean-merge");
    await driver.create("clean-merge-branch", { path: wtPath });
    await $`bash -c 'echo "hello" > clean.txt && git add clean.txt && git commit -m "clean change"'`
      .quiet()
      .cwd(wtPath);

    const result = await driver.canMerge("clean-merge-branch", "main");
    expect(result.ok).toBe(true);
    expect(result.conflictingFiles).toEqual([]);
  });

  test("returns ok:false with conflicting files", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "conflict-merge");
    await driver.create("conflict-merge-branch", { path: wtPath });

    // Create a conflicting change on both branches
    await $`bash -c 'echo "main content" > conflict.txt && git add conflict.txt && git commit -m "main change"'`
      .quiet()
      .cwd(repoDir);
    await $`bash -c 'echo "worktree content" > conflict.txt && git add conflict.txt && git commit -m "worktree change"'`
      .quiet()
      .cwd(wtPath);

    const result = await driver.canMerge("conflict-merge-branch", "main");
    expect(result.ok).toBe(false);
    expect(result.conflictingFiles).toContain("conflict.txt");
  });

  test("leaves main worktree clean after dry-run", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "clean-after-dryrun");
    await driver.create("dryrun-branch", { path: wtPath });
    await $`bash -c 'echo "change" > dryrun.txt && git add dryrun.txt && git commit -m "dryrun change"'`
      .quiet()
      .cwd(wtPath);

    await driver.canMerge("dryrun-branch", "main");

    // Main worktree should be clean (no uncommitted changes, no merge in progress)
    const status = await $`git status --porcelain`.quiet().cwd(repoDir);
    expect(status.text().trim()).toBe("");
  });
});

// ---------------------------------------------------------------------------
// hasUncommittedChanges
// ---------------------------------------------------------------------------

describe("hasUncommittedChanges", () => {
  beforeEach(async () => {
    await Bun.write(
      join(repoDir, "worktree.toml"),
      '[hooks]\npost_checkout = "echo setup"',
    );
    await $`git add worktree.toml && git commit -m "add worktree config"`.quiet().cwd(repoDir);
  });

  test("returns false for a clean worktree", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "clean-wt");
    await driver.create("clean-wt-branch", { path: wtPath });

    expect(await driver.hasUncommittedChanges(wtPath)).toBe(false);
  });

  test("returns true for staged changes", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "staged-wt");
    await driver.create("staged-wt-branch", { path: wtPath });
    await $`bash -c 'echo "staged" > staged.txt && git add staged.txt'`
      .quiet()
      .cwd(wtPath);

    expect(await driver.hasUncommittedChanges(wtPath)).toBe(true);
  });

  test("returns true for unstaged changes", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "unstaged-wt");
    await driver.create("unstaged-wt-branch", { path: wtPath });
    // Create and commit a file first, then modify it
    await $`bash -c 'echo "original" > unstaged.txt && git add unstaged.txt && git commit -m "add file"'`
      .quiet()
      .cwd(wtPath);
    await $`bash -c 'echo "modified" > unstaged.txt'`
      .quiet()
      .cwd(wtPath);

    expect(await driver.hasUncommittedChanges(wtPath)).toBe(true);
  });

  test("returns false after all changes are committed", async () => {
    const driver = await WorktreeDriver.open(repoDir);
    const wtPath = join(tempBase, "committed-wt");
    await driver.create("committed-wt-branch", { path: wtPath });
    await $`bash -c 'echo "content" > file.txt && git add file.txt && git commit -m "committed"'`
      .quiet()
      .cwd(wtPath);

    expect(await driver.hasUncommittedChanges(wtPath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe("remove", () => {
  beforeEach(async () => {
    await Bun.write(
      join(repoDir, "worktree.toml"),
      '[hooks]\npost_checkout = "echo setup"',
    );
    await $`git add worktree.toml && git commit -m "add worktree config"`.quiet().cwd(repoDir);
  });

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
