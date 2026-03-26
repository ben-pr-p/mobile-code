/**
 * Backend types — re-exported from the canonical definitions in stream-db.ts.
 *
 * The old branded `BackendUrl` type is replaced with plain `string`.
 * Backend configs and connections now live in globalDb collections
 * instead of Jotai atoms.
 */
import type { BackendConfigValue, BackendConnectionValue } from '../lib/stream-db';

/** @deprecated Use plain `string` instead */
export type BackendUrl = string;

/** An absolute path to a git worktree on a specific backend machine. */
export type WorktreePath = string;

/** Backend type — affects UI hints and icons. */
export type BackendType = BackendConfigValue['type'];

/** Configuration for a single backend server. */
export type BackendConfig = BackendConfigValue;

/** Connection status for a single backend. */
export type BackendStatus = BackendConnectionValue['status'];

/** Live connection state for a single backend. */
export type BackendConnection = BackendConnectionValue;
