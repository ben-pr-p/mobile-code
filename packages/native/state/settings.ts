import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { NotificationSound } from '../__fixtures__/settings';
import { asyncStorageAdapter } from '../lib/jotai-async-storage';

export const notificationSoundAtom = atom<NotificationSound>('chime');

/** Hands-free mode: determines behavior when headphone button recording completes. */
export type HandsFreeMode = 'washing-dishes' | 'walking';

/**
 * User's preferred hands-free mode. Persisted to AsyncStorage so it
 * survives app restarts. Defaults to 'washing-dishes'.
 */
export const handsFreeModeAtom = atomWithStorage<HandsFreeMode>(
  'settings:handsFreeMode',
  'washing-dishes',
  asyncStorageAdapter<HandsFreeMode>()
);

/** Whether hands-free (headphone button) mode is currently active. */
export const handsFreeActiveAtom = atom(false);

/** Whether a native CallKit recording is in progress (headphone-initiated). */
export const nativeRecordingAtom = atom(false);

/** Model selection. */
export type ModelSelection = { providerID: string; modelID: string };

/**
 * User's preferred model for the next prompt. Persisted to AsyncStorage so it
 * survives app restarts. `null` means "use server default".
 */
export const selectedModelAtom = atomWithStorage<ModelSelection | null>(
  'settings:selectedModel',
  null,
  asyncStorageAdapter<ModelSelection | null>()
);

/** Model info for a single model from the provider catalog */
export type CatalogModel = {
  id: string;
  name: string;
  providerID: string;
  providerName: string;
  status?: string;
};

/** Provider catalog fetched from the server. `null` means not yet loaded. */
export const modelCatalogAtom = atom<CatalogModel[] | null>(null);

/** The server-reported defaults: e.g. { "": "anthropic/claude-sonnet-4-20250514" } */
export const modelDefaultsAtom = atom<Record<string, string>>({});

/** Agent from the OpenCode server. */
export type AgentInfo = {
  name: string;
  description?: string;
  mode: 'subagent' | 'primary' | 'all';
  color?: string;
};

/** Command from the OpenCode server. */
export type CommandInfo = {
  name: string;
  description?: string;
  agent?: string;
  template: string;
};

/** A pending command queued for the next message. */
export type PendingCommand = {
  name: string;
  description?: string;
};

/** Agent catalog fetched from the server. `null` means not yet loaded. */
export const agentCatalogAtom = atom<AgentInfo[] | null>(null);

/** Command catalog fetched from the server. `null` means not yet loaded. */
export const commandCatalogAtom = atom<CommandInfo[] | null>(null);

// ---------------------------------------------------------------------------
// Font Size Settings
// ---------------------------------------------------------------------------

/**
 * Font size scale factor. 0 is the default size, negative values shrink,
 * positive values enlarge. Each step is ~2px at the base sizes.
 */
export type FontSizeStep = -2 | -1 | 0 | 1 | 2 | 3 | 4;

/** User's preferred code font size (tool calls, diff viewer). */
export const codeFontSizeAtom = atomWithStorage<FontSizeStep>(
  'settings:codeFontSize',
  0,
  asyncStorageAdapter<FontSizeStep>()
);

/** User's preferred conversation font size (user + assistant messages). */
export const conversationFontSizeAtom = atomWithStorage<FontSizeStep>(
  'settings:conversationFontSize',
  0,
  asyncStorageAdapter<FontSizeStep>()
);

/** User's preferred menu/UI font size (sidebars, headers, settings). */
export const menuFontSizeAtom = atomWithStorage<FontSizeStep>(
  'settings:menuFontSize',
  0,
  asyncStorageAdapter<FontSizeStep>()
);
