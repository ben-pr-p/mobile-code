/**
 * Validated environment variables for the server.
 *
 * Import `env` from this module instead of reading `process.env` directly.
 * Validation runs once on first import — missing required variables cause an
 * immediate, descriptive error.
 */

import { cleanEnv, str, port, url } from "envalid"

export const env = cleanEnv(process.env, {
  // --- Server ---
  /** Port for the Hono HTTP server. */
  PORT: port({ default: 3000 }),
  /** URL of the OpenCode server to bridge. Empty string means "spawn one automatically". */
  OPENCODE_URL: str({ default: "" }),

  // --- Auth ---
  /** Bearer token for authenticating mobile clients. Optional when running locally. */
  FLOCK_AUTH_TOKEN: str({ default: "" }),

  // --- Gemini (transcription) ---
  /** Google / Gemini API key for audio transcription. Read by @tanstack/ai-gemini. */
  GEMINI_API_KEY: str({ default: "" }),
  /** Gemini model for audio transcription. Either "gemini-3-flash-preview" or "gemini-3.1-flash-lite-preview". */
  TRANSCRIPTION_MODEL: str({ default: "gemini-3.1-flash-lite-preview" }),

  // --- Fly Sprites ---
  /** Name of the Fly Sprite to sync projects to. Required for `sync` command. */
  SPRITE_NAME: str({ default: "" }),
  /** Sprites API authentication token. Required for `sync` command. */
  SPRITES_TOKEN: str({ default: "" }),
  /** Sprites API base URL override. */
  SPRITES_API_URL: url({ default: "https://api.sprites.dev" }),
})
