# Sprite Sync — Design Plan

## Overview

A `sync` command that ensures a single shared Fly Sprite mirrors all local OpenCode projects. Each project is git-cloned on the Sprite at a path that preserves the local directory hierarchy (relative to `$HOME`), and any files referenced in a per-project `.sprite-keep` file are uploaded to the Sprite.

## Assumptions

- The Sprite already exists and is configured via environment variables (`SPRITE_NAME`, `SPRITES_TOKEN`).
- The Sprite has the GitHub CLI (`gh`) installed and authenticated — git clone auth is handled.
- OpenCode project IDs are derived from the git root commit hash, so they are stable across local and Sprite environments.
- The `@fly/sprites` npm package is used for all Sprite interaction (exec, filesystem read/write).

## Path Mapping

Local paths are mapped to Sprite paths by stripping the local `$HOME` prefix and re-rooting under the Sprite's `$HOME`.

```
Local:   /Users/ben/job1/project1    →  Sprite: /home/sprite/job1/project1
Local:   /Users/ben/job1/project2    →  Sprite: /home/sprite/job1/project2
Local:   /Users/ben/personal/cool-app → Sprite: /home/sprite/personal/cool-app
```

This preserves sibling grouping and avoids collisions without any special heuristics.

### Implementation

```ts
function localPathToSpritePath(localPath: string, localHome: string, spriteHome: string): string {
  // localPath:  /Users/ben/job1/project1
  // localHome:  /Users/ben
  // spriteHome: /home/sprite
  const relative = path.relative(localHome, localPath)  // "job1/project1"
  return path.join(spriteHome, relative)                 // "/home/sprite/job1/project1"
}
```

To discover the Sprite's home directory, the sync runs `echo $HOME` on the Sprite once at the start.

## Sync Scope

Every project returned by OpenCode's `client.project.list()` is in scope. For each project, sync performs two operations:

1. **Ensure the repo is cloned** (if not already present)
2. **Upload `.sprite-keep` files** (if the file exists)

## Sync Algorithm

```
sync():
  1. List all OpenCode projects (via SDK)
  2. Discover Sprite home dir: exec `echo $HOME` on Sprite
  3. Discover local home dir: os.homedir()
  4. For each project:
     a. Compute spritePath = localPathToSpritePath(project.worktree, localHome, spriteHome)
     b. Check if spritePath exists on Sprite (exec `test -d <spritePath>`)
     c. If not exists:
        - Ensure parent directory exists (exec `mkdir -p <parentDir>`)
        - Get the git remote URL locally (exec `git -C <localPath> remote get-url origin`)
        - Clone on Sprite (exec `git clone <remoteUrl> <spritePath>`)
     d. If exists:
        - Check the remote URL matches (exec `git -C <spritePath> remote get-url origin` on Sprite)
        - If mismatch: warn and skip (the user may have moved/renamed things)
     e. Sync .sprite-keep files (see below)
  5. Detect orphaned projects on the Sprite (projects that exist on Sprite but not locally)
     - Log warnings but do NOT auto-delete — user may have Sprite-only work
  6. Return a summary of what was created, what was already up-to-date, and any warnings
```

### Handling directory renames/moves

The source of truth is the local machine. If a user moves a project from `~/job1/proj` to `~/job2/proj`:

- The old Sprite path (`/home/sprite/job1/proj`) becomes orphaned
- The new Sprite path (`/home/sprite/job2/proj`) doesn't exist yet
- Sync will clone fresh at the new path and warn about the orphan

We match by git remote URL: if we see the same remote URL at a different Sprite path, we log a suggestion to remove the old one. We do NOT auto-move, because the Sprite may have uncommitted work.

## `.sprite-keep` File

A file named `.sprite-keep` in the project root. Simple newline-separated list of file paths or glob patterns, relative to the project root. Blank lines and `#` comments are ignored.

### Example

```
# Environment variables
.env
.env.local

# Large data files for development
data/fixtures/seed.sql
data/models/*.bin

# Local config
config/local.yaml
```

### Sync behavior

For each entry in `.sprite-keep`:

1. Resolve the glob against the local project directory
2. For each matched file:
   - Read the local file contents
   - Compute the destination path on the Sprite (spritePath + relative file path)
   - Check if the file already exists on the Sprite and compare checksums (MD5 via `md5sum` on Sprite)
   - If missing or different: upload via the Sprites filesystem write API
   - Ensure parent directories exist before writing

### Edge cases

- **Directories in `.sprite-keep`**: Glob patterns like `data/fixtures/` should recursively include all files underneath.
- **Binary files**: The Sprites filesystem write API accepts raw bytes, so binary files (`.bin`, images, SQLite DBs) work fine.
- **Large files**: Files are uploaded individually. No chunking needed — the Sprites API handles this. If a file is very large (>100MB), log a warning but still attempt the upload.
- **Deleted files**: If a file is in `.sprite-keep` but doesn't exist locally, skip it silently (the user may have removed it intentionally). If a file exists on the Sprite but was removed from `.sprite-keep`, leave it alone — we only ensure listed files are present and current, we don't delete.

## Module Structure

### `src/sprites.ts` — Sprites client wrapper

Thin wrapper around `@fly/sprites` that provides the specific operations sync needs:

```ts
export class SpriteClient {
  constructor(spriteName: string, token: string)

  /** Run a command on the Sprite, return stdout. */
  exec(command: string, options?: { cwd?: string }): Promise<string>

  /** Check if a path exists on the Sprite. */
  exists(remotePath: string): Promise<boolean>

  /** Read a file from the Sprite. */
  readFile(remotePath: string): Promise<Buffer>

  /** Write a file to the Sprite. */
  writeFile(remotePath: string, contents: Buffer): Promise<void>

  /** Get the Sprite's home directory. */
  homeDir(): Promise<string>
}
```

### `src/sprite-sync.ts` — Sync logic

Pure logic module, takes a `SpriteClient` and an OpenCode client:

```ts
export interface SyncResult {
  cloned: { projectId: string; localPath: string; spritePath: string }[]
  alreadyExists: { projectId: string; spritePath: string }[]
  filesUploaded: { projectId: string; file: string }[]
  filesSkipped: { projectId: string; file: string; reason: string }[]
  warnings: string[]
}

export async function sync(
  sprite: SpriteClient,
  opencode: OpencodeClient,
  options?: { dryRun?: boolean }
): Promise<SyncResult>
```

This function is self-contained and can be called from a CLI command or an API endpoint.

### Changes to existing files

- **`package.json`**: Add `@fly/sprites` dependency.
- **`src/index.ts`**: Add `sync` subcommand to the CLI arg parser. When invoked, runs the sync function and prints the result.

No changes to `app.ts` for now — the API endpoint can be added later by calling the same `sync()` function.

## CLI Interface

```sh
# Run sync
flockcode sync

# Dry run — show what would happen without making changes
flockcode sync --dry-run
```

Output:

```
Syncing 3 projects to Sprite "my-dev-sprite"...

  ✓ job1/project1 — cloned
  ✓ job1/project2 — already exists
  ✓ personal/cool-app — cloned

Syncing .sprite-keep files...

  job1/project1:
    ✓ .env — uploaded
    ✓ data/seed.sql — up to date
  job1/project2:
    (no .sprite-keep file)
  personal/cool-app:
    ✓ .env — uploaded
    ✓ .env.local — skipped (not found locally)

Warnings:
  ⚠ /home/sprite/old-location/project1 — orphaned (exists on Sprite but not locally)

Done. 2 cloned, 1 existing, 2 files uploaded.
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@fly/sprites` | Sprites SDK (exec, filesystem, management) |

## Future considerations (out of scope for now)

- **Auto-create Sprite**: Bootstrap a Sprite if one doesn't exist, store the name in XDG data dir.
- **API endpoint**: `POST /api/sprites/sync` wrapping the same function.
- **Incremental sync on file watch**: Watch `.sprite-keep` files locally and push changes in real-time.
- **Sprite health/status endpoint**: Expose Sprite connection status to the mobile app.
- **Branch sync**: Optionally ensure the Sprite checkout is on the same branch as local.
- **Post-clone hooks**: Like `worktree.toml`'s `post_checkout`, run setup commands after cloning (e.g. `bun install`).
