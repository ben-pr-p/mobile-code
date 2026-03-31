/**
 * NewSessionOptions — the "empty state" content shown in place of the chat
 * thread when creating a new session.
 *
 * Renders:
 * - A prompt ("Send a message to start a new session")
 * - A "Run in worktree" toggle
 * - A backend server selector (only when multiple backends host the project)
 * - The BackendSelectorSheet (portal-style, rendered inside this component)
 *
 * Used by both SessionScreen (phone/portrait) and SplitLayout (iPad landscape)
 * so the new-session experience is identical across form factors.
 */
import React, { useState, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Server, ChevronDown } from 'lucide-react-native';
import { BackendSelectorSheet, type BackendOption } from './BackendSelectorSheet';
import type { BackendUrl } from '../state/backends';

interface NewSessionOptionsProps {
  /** Whether "Run in worktree" is currently toggled on. */
  useWorktree: boolean;
  /** Called when the user toggles the worktree checkbox. */
  onWorktreeChange: (value: boolean) => void;
  /** Available backend servers that host this project. */
  backendOptions: BackendOption[];
  /** The currently selected backend URL. */
  selectedBackendUrl: BackendUrl;
  /** Called when the user picks a different backend. */
  onSelectBackend: (url: BackendUrl) => void;
}

/** New-session prompt with worktree toggle and optional backend selector. */
export function NewSessionOptions({
  useWorktree,
  onWorktreeChange,
  backendOptions,
  selectedBackendUrl,
  onSelectBackend,
}: NewSessionOptionsProps) {
  const [backendSelectorVisible, setBackendSelectorVisible] = useState(false);

  const showServerSelector = backendOptions.length > 1;

  const selectedBackendName = useMemo(() => {
    const opt = backendOptions.find((o) => o.config.url === selectedBackendUrl);
    return opt?.config.name || 'Server';
  }, [backendOptions, selectedBackendUrl]);

  return (
    <>
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center text-sm text-stone-400 dark:text-stone-600">
          Send a message to start a new session
        </Text>

        {/* Worktree toggle */}
        <Pressable
          onPress={() => onWorktreeChange(!useWorktree)}
          className="mt-4 flex-row items-center gap-2 rounded-lg bg-stone-100 px-4 py-2 dark:bg-stone-900">
          <View
            className={`h-4 w-4 rounded border ${
              useWorktree
                ? 'border-blue-500 bg-blue-500'
                : 'border-stone-400 dark:border-stone-600'
            }`}
          />
          <Text className="text-sm text-stone-500 dark:text-stone-400">Run in worktree</Text>
        </Pressable>

        {/* Server selector — only when multiple backends host this project */}
        {showServerSelector && (
          <Pressable
            onPress={() => setBackendSelectorVisible(true)}
            className="mt-2 flex-row items-center gap-2 rounded-lg bg-stone-100 px-4 py-2 dark:bg-stone-900">
            <Server size={14} color="#A8A29E" />
            <Text className="text-sm text-stone-500 dark:text-stone-400">
              {selectedBackendName}
            </Text>
            <ChevronDown size={12} color="#A8A29E" />
          </Pressable>
        )}
      </View>

      {showServerSelector && (
        <BackendSelectorSheet
          visible={backendSelectorVisible}
          onClose={() => setBackendSelectorVisible(false)}
          options={backendOptions}
          selectedUrl={selectedBackendUrl}
          onSelect={onSelectBackend}
        />
      )}
    </>
  );
}
