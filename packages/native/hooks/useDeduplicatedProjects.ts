/**
 * Queries backendProjects from the global DB and deduplicates by projectId.
 *
 * The same project can appear on multiple backends — each backend produces its
 * own `BackendProjectValue` row with a composite key. This hook merges them
 * into a single entry per project, tracking which backends have it.
 */
import { useMemo } from 'react';
import { useLiveQuery } from '@tanstack/react-db';
import { collections } from '../lib/collections';
import type { BackendProjectValue } from '../lib/stream-db';

/**
 * A project deduplicated across backends. `backendUrls` lists every backend
 * that reported this project.
 */
export type DeduplicatedProject = {
  /** Stable key — the original project ID (shared across backends) */
  id: string;
  /** Same as `id` — the original project ID */
  projectId: string;
  /** Primary backendUrl (from the most recently created entry) */
  backendUrl: string;
  /** All backend URLs that have this project */
  backendUrls: string[];
  worktree: string;
  vcsDir?: string;
  vcs?: 'git';
  time: { created: number; initialized?: number };
};

function deduplicateProjects(backendProjects: BackendProjectValue[]): DeduplicatedProject[] {
  const byProjectId = new Map<string, DeduplicatedProject>();

  for (const bp of backendProjects) {
    const existing = byProjectId.get(bp.projectId);
    if (existing) {
      if (!existing.backendUrls.includes(bp.backendUrl)) {
        existing.backendUrls.push(bp.backendUrl);
      }
      // Keep the most recent data
      if (bp.time.created > existing.time.created) {
        existing.backendUrl = bp.backendUrl;
        existing.worktree = bp.worktree;
        existing.vcsDir = bp.vcsDir;
        existing.vcs = bp.vcs;
        existing.time = bp.time;
      }
    } else {
      byProjectId.set(bp.projectId, {
        id: bp.projectId,
        projectId: bp.projectId,
        backendUrl: bp.backendUrl,
        backendUrls: [bp.backendUrl],
        worktree: bp.worktree,
        vcsDir: bp.vcsDir,
        vcs: bp.vcs,
        time: bp.time,
      });
    }
  }

  return Array.from(byProjectId.values());
}

/**
 * Returns deduplicated projects from the global DB, sorted by most recently
 * created first.
 */
export function useDeduplicatedProjects(): {
  projects: DeduplicatedProject[];
  isLoading: boolean;
} {
  const { data: rawProjects, isLoading } = useLiveQuery(
    (q) => q.from({ backendProjects: collections.backendProjects }),
    []
  );

  const projects = useMemo(() => {
    if (!rawProjects) return [];
    return deduplicateProjects(rawProjects as BackendProjectValue[]).sort(
      (a, b) => b.time.created - a.time.created
    );
  }, [rawProjects]);

  return { projects, isLoading };
}
