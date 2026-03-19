# Sprite Setup

One-time setup for the Fly Sprite used by `flockcode sync`.

## Prerequisites

- A [Fly.io](https://fly.io) account with the Sprites CLI installed (`curl https://sprites.dev/install.sh | bash`)
- `sprite login` completed

## 1. Create the Sprite

```sh
sprite create main
sprite use main
```

## 2. Authenticate GitHub

The Sprite needs to be able to clone your repositories. Set up **one or both** depending on whether your repos use HTTPS or SSH remote URLs.

### HTTPS repos (recommended)

Install and authenticate the GitHub CLI, then configure it as a git credential helper:

```sh
sprite exec -- gh auth login
sprite exec -- gh auth setup-git
```

`gh auth setup-git` writes a credential helper entry to `~/.gitconfig` so that `git clone https://...` works automatically. This only needs to be run once.

### SSH repos

If your local repos use SSH URLs (`git@github.com:...`), set up an SSH key on the Sprite:

```sh
sprite exec -- ssh-keygen -t ed25519 -C "sprite"
sprite exec -- cat ~/.ssh/id_ed25519.pub
```

Add the public key as a deploy key or SSH key on GitHub, then add GitHub to known hosts:

```sh
sprite exec -- ssh-keyscan github.com >> ~/.ssh/known_hosts
```

## 3. Environment variables

The `flockcode sync` command requires these environment variables on the machine running the server (your local machine, not the Sprite):

| Variable | Required | Description |
|----------|----------|-------------|
| `SPRITE_NAME` | Yes | Name of the Sprite (e.g. `main`) |
| `SPRITES_TOKEN` | Yes | Sprites API token (get via `sprite token`) |
| `SPRITES_API_URL` | No | API base URL override (default: `https://api.sprites.dev`) |
| `OPENCODE_URL` | No | OpenCode server URL (default: `http://localhost:4096`) |

Example `.env`:

```sh
SPRITE_NAME=main
SPRITES_TOKEN=spr_...
```

## 4. Run sync

With OpenCode running locally:

```sh
# Preview what will happen
bun run src/index.ts sync --dry-run

# Actually sync
bun run src/index.ts sync
```

## What sync does

1. Lists all projects from OpenCode
2. For each project, maps its local path to a Sprite path (strips `$HOME`, re-roots under Sprite's `$HOME`)
3. Clones repos that don't exist on the Sprite yet (using the same remote URL as local)
4. Uploads files listed in each project's `.sprite-keep` file (if present)
5. Warns about orphaned repos on the Sprite that no longer correspond to a local project

## `.sprite-keep` file format

Place a `.sprite-keep` file in any project root to sync non-git files to the Sprite. One file path or glob pattern per line. `#` comments and blank lines are ignored.

```
# Environment variables
.env
.env.local

# Data files
data/fixtures/seed.sql
data/models/*.bin
```
