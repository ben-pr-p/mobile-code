// Typed wrapper around git-worktree operations, driven by a worktree.toml config file.
// Handles creating, listing, merging, and removing worktrees with automatic
// post-checkout hook execution (e.g. dependency installation).

import { $ } from "bun";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Schema for the `worktree.toml` configuration file. */
export interface WorktreeConfig {
  hooks?: {
    /** Command executed after a new worktree is checked out (e.g. `"bun install"`). */
    post_checkout?: string;
  };
}

/** A single worktree as reported by `git worktree list --porcelain`. */
export interface WorktreeEntry {
  /** Absolute path to the worktree directory. */
  path: string;
  /** HEAD commit hash. */
  head: string;
  /** Branch ref (e.g. `refs/heads/main`), or `null` for detached HEAD. */
  branch: string | null;
  /** Whether this is the bare/main worktree. */
  bare: boolean;
  /** Whether the worktree directory is missing from disk. */
  prunable: boolean;
}

/** Options for {@link WorktreeDriver.create}. */
export interface CreateOptions {
  /** Base branch / commit to create the worktree from. Defaults to HEAD. */
  base?: string;
  /**
   * Explicit filesystem path for the new worktree.
   * Defaults to `../<branch>` relative to the repo root.
   */
  path?: string;
  /** Skip running the post_checkout hook. */
  skipHooks?: boolean;
}

/** Options for {@link WorktreeDriver.merge}. */
export interface MergeOptions {
  /** Branch to merge *into*. Defaults to the repo's current branch. */
  into?: string;
  /** Use `--squash` to collapse all commits into a single merge commit. */
  squash?: boolean;
  /** Use `--no-ff` to force a merge commit even for fast-forward merges. */
  noFf?: boolean;
}

/** Options for {@link WorktreeDriver.remove}. */
export interface RemoveOptions {
  /** Force removal even if the worktree contains modifications. */
  force?: boolean;
  /** Also delete the branch after removing the worktree. */
  deleteBranch?: boolean;
}

/** Structured error thrown when a git command fails. */
export class WorktreeError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly exitCode: number,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "WorktreeError";
  }
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

/**
 * Manages git worktrees for a repository, driven by an optional `worktree.toml`
 * config file that can specify lifecycle hooks (e.g. post-checkout commands).
 *
 * ```ts
 * const driver = await WorktreeDriver.open("/path/to/repo");
 * await driver.create("feat/cool-thing");
 * const trees = await driver.list();
 * await driver.merge("feat/cool-thing", { squash: true });
 * await driver.remove("feat/cool-thing", { deleteBranch: true });
 * ```
 */
export class WorktreeDriver {
  #repoRoot: string;
  #config: WorktreeConfig;

  private constructor(repoRoot: string, config: WorktreeConfig) {
    this.#repoRoot = repoRoot;
    this.#config = config;
  }

  /** The absolute path to the repository root. */
  get repoRoot(): string {
    return this.#repoRoot;
  }

  /** The parsed worktree.toml configuration (empty object if none found). */
  get config(): Readonly<WorktreeConfig> {
    return this.#config;
  }

  /**
   * Open a repository directory, reading `worktree.toml` if present.
   * @param repoRoot Absolute path to the git repository root.
   */
  static async open(repoRoot: string): Promise<WorktreeDriver> {
    const config = await readConfig(repoRoot);
    return new WorktreeDriver(repoRoot, config);
  }

  /**
   * Create a new worktree (and its corresponding branch).
   *
   * Runs `git worktree add -b <branch> <path> [base]`, then executes the
   * `post_checkout` hook from `worktree.toml` inside the new worktree directory.
   */
  async create(branch: string, options: CreateOptions = {}): Promise<WorktreeEntry> {
    const { base, skipHooks = false } = options;
    const worktreePath = options.path ?? this.#defaultPath(branch);

    // Build the git command
    const args = ["git", "worktree", "add", "-b", branch, worktreePath];
    if (base) args.push(base);

    await this.#exec(args);

    // Run post-checkout hook if configured
    if (!skipHooks) {
      await this.#runHook("post_checkout", worktreePath);
    }

    // Return the newly created entry
    const entries = await this.list();
    const entry = entries.find((e) => e.path === worktreePath);
    if (!entry) {
      throw new Error(`Worktree created but not found in list: ${worktreePath}`);
    }
    return entry;
  }

  /**
   * List all worktrees for this repository.
   *
   * Parses the stable `--porcelain` output format from `git worktree list`.
   */
  async list(): Promise<WorktreeEntry[]> {
    const output = await this.#execText(["git", "worktree", "list", "--porcelain"]);
    return parsePorcelain(output);
  }

  /**
   * Merge a worktree's branch into another branch.
   *
   * This does NOT operate inside the worktree itself — it runs from the main
   * repo root and merges `branch` into the target (default: current branch).
   */
  async merge(branch: string, options: MergeOptions = {}): Promise<void> {
    const { into, squash = false, noFf = false } = options;

    // If merging into a specific branch, check it out first in the main worktree
    if (into) {
      await this.#exec(["git", "checkout", into]);
    }

    const args = ["git", "merge"];
    if (squash) args.push("--squash");
    if (noFf) args.push("--no-ff");
    args.push(branch);

    await this.#exec(args);

    // If we squashed, we need to commit (git merge --squash doesn't auto-commit)
    if (squash) {
      await this.#exec(["git", "commit", "--no-edit"]);
    }
  }

  /**
   * Remove a worktree and optionally delete its branch.
   *
   * Runs `git worktree remove` followed by `git branch -d` (or `-D` if forced).
   */
  async remove(branchOrPath: string, options: RemoveOptions = {}): Promise<void> {
    const { force = false, deleteBranch = false } = options;

    // Resolve which worktree to remove — accept either a path or branch name
    const entries = await this.list();
    const entry = this.#findEntry(entries, branchOrPath);

    if (!entry) {
      throw new Error(
        `No worktree found matching "${branchOrPath}". ` +
          `Known worktrees: ${entries.map((e) => e.path).join(", ")}`,
      );
    }

    // Remove the worktree
    const removeArgs = ["git", "worktree", "remove", entry.path];
    if (force) removeArgs.push("--force");
    await this.#exec(removeArgs);

    // Optionally delete the branch
    if (deleteBranch && entry.branch) {
      const branchName = entry.branch.replace(/^refs\/heads\//, "");
      const deleteFlag = force ? "-D" : "-d";
      await this.#exec(["git", "branch", deleteFlag, branchName]);
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Derive a default worktree path from the branch name: `../<branch-slug>` */
  #defaultPath(branch: string): string {
    // Place sibling to the repo root, using the branch name (slashes → dashes)
    const slug = branch.replace(/\//g, "-");
    return `${this.#repoRoot}/../${slug}`;
  }

  /** Find a worktree entry by path or branch name. */
  #findEntry(entries: WorktreeEntry[], branchOrPath: string): WorktreeEntry | undefined {
    return entries.find((e) => {
      if (e.path === branchOrPath) return true;
      if (e.branch === branchOrPath) return true;
      if (e.branch === `refs/heads/${branchOrPath}`) return true;
      // Also match the slug form
      const slug = branchOrPath.replace(/\//g, "-");
      return e.path.endsWith(`/${slug}`);
    });
  }

  /**
   * Execute a git command in the repo root. Throws {@link WorktreeError} on failure.
   * Uses `Bun.spawn` for precise argument passing (no shell interpolation).
   */
  async #exec(args: string[]): Promise<void> {
    const proc = Bun.spawn(args, {
      cwd: this.#repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new WorktreeError(
        `Command failed: ${args.join(" ")}`,
        args.join(" "),
        exitCode,
        stderr,
      );
    }
  }

  /** Execute a git command and return stdout as a string. */
  async #execText(args: string[]): Promise<string> {
    const proc = Bun.spawn(args, {
      cwd: this.#repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    if (exitCode !== 0) {
      throw new WorktreeError(
        `Command failed: ${args.join(" ")}`,
        args.join(" "),
        exitCode,
        stderr,
      );
    }
    return stdout;
  }

  /**
   * Run a hook command from the config inside the given directory.
   * Uses Bun's `$` shell so the hook string is interpreted as a shell command
   * (supports pipes, env vars, etc.).
   */
  async #runHook(hook: keyof NonNullable<WorktreeConfig["hooks"]>, cwd: string): Promise<void> {
    const command = this.#config.hooks?.[hook];
    if (!command) return;

    const result = await $`${{ raw: command }}`.quiet().nothrow().cwd(cwd);
    if (result.exitCode !== 0) {
      throw new WorktreeError(
        `Hook "${hook}" failed: ${command}`,
        command,
        result.exitCode,
        result.stderr.toString(),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Config parsing
// ---------------------------------------------------------------------------

/** Read and parse `worktree.toml` from the repo root. Returns `{}` if absent. */
async function readConfig(repoRoot: string): Promise<WorktreeConfig> {
  const configPath = `${repoRoot}/worktree.toml`;
  const file = Bun.file(configPath);
  const exists = await file.exists();
  if (!exists) return {};

  const text = await file.text();
  const raw = Bun.TOML.parse(text) as Record<string, unknown>;
  return validateConfig(raw);
}

/** Minimal runtime validation of the config shape. */
function validateConfig(raw: Record<string, unknown>): WorktreeConfig {
  const config: WorktreeConfig = {};

  if (raw.hooks != null && typeof raw.hooks === "object") {
    const hooks = raw.hooks as Record<string, unknown>;
    config.hooks = {};
    if (typeof hooks.post_checkout === "string") {
      config.hooks.post_checkout = hooks.post_checkout;
    }
  }

  return config;
}

// ---------------------------------------------------------------------------
// Porcelain output parsing
// ---------------------------------------------------------------------------

/**
 * Parse the output of `git worktree list --porcelain`.
 *
 * The format is a series of blocks separated by blank lines. Each block has:
 * ```
 * worktree /absolute/path
 * HEAD <sha>
 * branch refs/heads/<name>    (or "detached" on its own line)
 * ```
 * Bare worktrees have a `bare` line. Prunable ones have a `prunable` line.
 */
function parsePorcelain(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  // Split into blocks by double-newline (or by single blank lines in the stream)
  const blocks = output.trim().split(/\n\n+/);

  for (const block of blocks) {
    if (!block.trim()) continue;

    const lines = block.trim().split("\n");
    const entry: Partial<WorktreeEntry> = {
      bare: false,
      prunable: false,
      branch: null,
    };

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        entry.path = line.slice("worktree ".length);
      } else if (line.startsWith("HEAD ")) {
        entry.head = line.slice("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        entry.branch = line.slice("branch ".length);
      } else if (line === "detached") {
        entry.branch = null;
      } else if (line === "bare") {
        entry.bare = true;
      } else if (line.startsWith("prunable ")) {
        entry.prunable = true;
      }
    }

    // Only include entries that have the minimum required fields
    if (entry.path && entry.head) {
      entries.push(entry as WorktreeEntry);
    }
  }

  return entries;
}
