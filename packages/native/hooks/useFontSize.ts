import { useAtomValue } from 'jotai';
import { useMemo } from 'react';
import {
  codeFontSizeAtom,
  conversationFontSizeAtom,
  menuFontSizeAtom,
  type FontSizeStep,
} from '../state/settings';

/**
 * Apply a step offset to a base pixel size.
 * Each step adds/subtracts 2px from the base.
 */
function scaled(base: number, step: FontSizeStep): number {
  return Math.max(6, base + step * 2);
}

// ---------------------------------------------------------------------------
// Code font sizes (tool calls, diff viewer)
// ---------------------------------------------------------------------------

/** Resolved pixel sizes for code/tool-call text at a given step. */
export interface CodeFontSizes {
  /** Collapsed tool call summary text (default 13px) */
  collapsed: number;
  /** Expanded tool call body text (default 12px) */
  body: number;
  /** Section label text inside tool calls (default 10px) */
  label: number;
  /** Tool name label in ToolCallBlock (default 11px) */
  toolLabel: number;
}

function computeCodeSizes(step: FontSizeStep): CodeFontSizes {
  return {
    collapsed: scaled(13, step),
    body: scaled(12, step),
    label: scaled(10, step),
    toolLabel: scaled(11, step),
  };
}

// ---------------------------------------------------------------------------
// Conversation font sizes (user + assistant messages)
// ---------------------------------------------------------------------------

/** Resolved pixel sizes for conversation text at a given step. */
export interface ConversationFontSizes {
  /** Message body text (default 14px / text-sm) */
  body: number;
  /** Small metadata text — voice indicator, queued status (default 10px) */
  meta: number;
  /** streamdown-rn spacing.block scale factor */
  spacingScale: number;
}

function computeConversationSizes(step: FontSizeStep): ConversationFontSizes {
  return {
    body: scaled(14, step),
    meta: scaled(10, step),
    spacingScale: 1 + step * 0.1,
  };
}

// ---------------------------------------------------------------------------
// Menu font sizes (sidebars, headers, settings chrome)
// ---------------------------------------------------------------------------

/** Resolved pixel sizes for menu/UI chrome at a given step. */
export interface MenuFontSizes {
  /** Screen titles — "Settings", sidebar headers (default 18px / text-lg) */
  title: number;
  /** Primary labels — session names, settings labels (default 14px / text-sm) */
  primary: number;
  /** Secondary labels — timestamps, branch names (default 12px / text-xs) */
  secondary: number;
  /** Tertiary labels — backend URLs, small status text (default 11px) */
  tertiary: number;
  /** Tiny labels — section headers, form labels (default 10px) */
  tiny: number;
  /** Badge text — agent names, worktree badges (default 9px) */
  badge: number;
  /** Project card name (default 15px) */
  projectName: number;
}

function computeMenuSizes(step: FontSizeStep): MenuFontSizes {
  return {
    title: scaled(18, step),
    primary: scaled(14, step),
    secondary: scaled(12, step),
    tertiary: scaled(11, step),
    tiny: scaled(10, step),
    badge: scaled(9, step),
    projectName: scaled(15, step),
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Read the current code font sizes from settings. */
export function useCodeFontSize(): CodeFontSizes {
  const step = useAtomValue(codeFontSizeAtom);
  return useMemo(() => computeCodeSizes(step), [step]);
}

/** Read the current conversation font sizes from settings. */
export function useConversationFontSize(): ConversationFontSizes {
  const step = useAtomValue(conversationFontSizeAtom);
  return useMemo(() => computeConversationSizes(step), [step]);
}

/** Read the current menu/UI font sizes from settings. */
export function useMenuFontSize(): MenuFontSizes {
  const step = useAtomValue(menuFontSizeAtom);
  return useMemo(() => computeMenuSizes(step), [step]);
}
