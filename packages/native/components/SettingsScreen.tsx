import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Switch, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { useLiveQuery } from '@tanstack/react-db';
import { ArrowLeft, ChevronDown, Monitor, Cloud, Plus, Pencil, Trash2 } from 'lucide-react-native';
import { collections } from '../lib/collections';
import type { ConnectionInfo, NotificationSound } from '../__fixtures__/settings';
import type { BackendConfig, BackendType, BackendConnection } from '../state/backends';

interface SettingsScreenProps {
  connection: ConnectionInfo;
  notificationSound: NotificationSound;
  onNotificationSoundChange: (value: NotificationSound) => void;
  notificationSoundOptions: { label: string; value: NotificationSound }[];
  appVersion: string;
  onBack: () => void;
}

export function SettingsScreen({
  connection,
  notificationSound,
  onNotificationSoundChange,
  notificationSoundOptions,
  appVersion,
  onBack,
}: SettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme, setColorScheme } = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#A8A29E' : '#44403C';
  const mutedIconColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';
  const [editingUrl, setEditingUrl] = useState<string | null>(null);

  // Read backends and connections from collections
  const { data: backendRows } = useLiveQuery((q) => q.from({ backends: collections.backends }), []);
  const backends = (backendRows as BackendConfig[] | null) ?? [];

  const { data: connectionRows } = useLiveQuery(
    (q) => q.from({ bc: collections.backendConnections }),
    []
  );
  const connectionMap: Record<string, BackendConnection> = {};
  for (const c of (connectionRows as BackendConnection[] | null) ?? []) {
    connectionMap[c.url] = c;
  }

  const handleAddBackend = useCallback(() => {
    const tempUrl = `new-${Date.now()}`;
    collections.backends.insert({
      url: tempUrl,
      name: '',
      type: 'sprite',
      enabled: true,
    });
    setEditingUrl(tempUrl);
  }, []);

  const handleDeleteBackend = useCallback(
    (url: string, name: string) => {
      Alert.alert('Delete Server', `Remove "${name || url}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            collections.backends.delete(url);
            if (editingUrl === url) setEditingUrl(null);
          },
        },
      ]);
    },
    [editingUrl]
  );

  return (
    <View className="flex-1 bg-stone-50 dark:bg-stone-950" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="h-14 flex-row items-center gap-4 px-5">
        <Pressable
          testID="settings-back"
          onPress={onBack}
          className="h-10 w-10 items-center justify-center rounded-lg bg-white dark:bg-stone-900">
          <ArrowLeft size={20} color={iconColor} />
        </Pressable>
        <Text
          className="text-lg font-semibold text-stone-900 dark:text-stone-50"
          style={{ fontFamily: 'JetBrains Mono' }}>
          Settings
        </Text>
      </View>

      {/* Divider */}
      <View className="h-px bg-stone-200 dark:bg-stone-800" />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 28) }}>
        {/* SERVERS section */}
        <SectionHeader title="SERVERS" />

        <View className="gap-3 px-5">
          {backends.map((backend) => (
            <BackendEntry
              key={backend.url}
              backend={backend}
              connection={connectionMap[backend.url]}
              isEditing={editingUrl === backend.url}
              onEdit={() => setEditingUrl(editingUrl === backend.url ? null : backend.url)}
              onDelete={() => handleDeleteBackend(backend.url, backend.name)}
            />
          ))}

          <Pressable
            onPress={handleAddBackend}
            className="h-10 flex-row items-center justify-center gap-2 rounded-lg bg-white dark:bg-stone-900">
            <Plus size={16} color={iconColor} />
            <Text
              className="text-xs font-medium text-stone-700 dark:text-stone-400"
              style={{ fontFamily: 'JetBrains Mono' }}>
              Add Server
            </Text>
          </Pressable>
        </View>

        {/* Divider */}
        <View className="mx-5 mt-4 h-px bg-stone-200 dark:bg-stone-800" />

        {/* APPEARANCE section */}
        <SectionHeader title="APPEARANCE" />

        <View className="px-5 pb-1">
          <Text
            className="mb-3 text-sm font-medium text-stone-900 dark:text-stone-50"
            style={{ fontFamily: 'JetBrains Mono' }}>
            Theme
          </Text>
          <View className="flex-row gap-2">
            {(['light', 'dark', 'system'] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => setColorScheme(mode)}
                className={`h-10 flex-1 items-center justify-center rounded-lg ${
                  (mode === 'system' && colorScheme === undefined) ||
                  (mode === 'light' && colorScheme === 'light') ||
                  (mode === 'dark' && colorScheme === 'dark')
                    ? 'bg-amber-500'
                    : 'bg-white dark:bg-stone-900'
                }`}>
                <Text
                  className={`text-xs font-medium ${
                    (mode === 'system' && colorScheme === undefined) ||
                    (mode === 'light' && colorScheme === 'light') ||
                    (mode === 'dark' && colorScheme === 'dark')
                      ? 'text-stone-950'
                      : 'text-stone-700 dark:text-stone-400'
                  }`}
                  style={{ fontFamily: 'JetBrains Mono' }}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Divider */}
        <View className="mx-5 mt-4 h-px bg-stone-200 dark:bg-stone-800" />

        {/* VOICE MODE section */}
        <SectionHeader title="VOICE MODE" />

        <SettingsRow label="Notification sound">
          <DropdownPicker
            value={notificationSound}
            options={notificationSoundOptions}
            onValueChange={onNotificationSoundChange}
          />
        </SettingsRow>

        {/* Divider */}
        <View className="mx-5 mt-2 h-px bg-stone-200 dark:bg-stone-800" />

        {/* ABOUT section */}
        <SectionHeader title="ABOUT" />

        <View className="px-5 py-3.5">
          <View className="flex-row items-center justify-between">
            <Text
              className="text-sm font-medium text-stone-900 dark:text-stone-50"
              style={{ fontFamily: 'JetBrains Mono' }}>
              Version
            </Text>
            <Text
              className="text-xs text-stone-700 dark:text-stone-400"
              style={{ fontFamily: 'JetBrains Mono' }}>
              {appVersion}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// --- Backend Entry ---

interface BackendEntryProps {
  backend: BackendConfig;
  connection: BackendConnection | undefined;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function BackendEntry({ backend, connection, isEditing, onEdit, onDelete }: BackendEntryProps) {
  const onUpdate = useCallback(
    (updates: Partial<BackendConfig>) => {
      collections.backends.update(backend.url, (draft: any) => {
        Object.assign(draft, updates);
      });
    },
    [backend.url]
  );
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#A8A29E' : '#44403C';
  const mutedIconColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';
  const placeholderColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';
  const TypeIcon = backend.type === 'local' ? Monitor : Cloud;

  const statusDot =
    connection?.status === 'connected'
      ? 'bg-green-500'
      : connection?.status === 'reconnecting'
        ? 'bg-amber-500'
        : connection?.status === 'error'
          ? 'bg-red-500'
          : 'bg-stone-400 dark:bg-stone-600';

  const statusLabel =
    connection?.status === 'connected'
      ? `Connected · ${connection.latencyMs}ms`
      : connection?.status === 'reconnecting'
        ? 'Connecting...'
        : connection?.status === 'error'
          ? (connection.error ?? 'Connection failed')
          : 'Offline';

  return (
    <View className="overflow-hidden rounded-lg bg-white dark:bg-stone-900">
      {/* Summary row */}
      <View className="flex-row items-center gap-3 px-3.5 py-3">
        <TypeIcon size={18} color={iconColor} />
        <View className="flex-1 gap-0.5">
          <Text
            className="text-sm font-medium text-stone-900 dark:text-stone-50"
            style={{ fontFamily: 'JetBrains Mono' }}
            numberOfLines={1}>
            {backend.name || 'Unnamed'}
          </Text>
          <Text
            className="text-[11px] text-stone-400 dark:text-stone-600"
            style={{ fontFamily: 'JetBrains Mono' }}
            numberOfLines={1}>
            {backend.url || 'No URL set'}
          </Text>
          <View className="mt-0.5 flex-row items-center gap-1.5">
            <View className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
            <Text
              className="text-[10px] text-stone-500 dark:text-stone-500"
              style={{ fontFamily: 'JetBrains Mono' }}>
              {statusLabel}
            </Text>
          </View>
        </View>
        <Pressable onPress={onEdit} hitSlop={8}>
          <Pencil size={16} color={mutedIconColor} />
        </Pressable>
      </View>

      {/* Edit form (shown when editing) */}
      {isEditing && (
        <View className="gap-2.5 border-t border-stone-100 px-3.5 pb-3 pt-2.5 dark:border-stone-800">
          <View>
            <Text
              className="mb-1 text-[10px] text-stone-400 dark:text-stone-600"
              style={{ fontFamily: 'JetBrains Mono' }}>
              Name
            </Text>
            <TextInput
              value={backend.name}
              onChangeText={(name) => onUpdate({ name })}
              placeholder="My MacBook"
              placeholderTextColor={placeholderColor}
              className="h-9 rounded bg-stone-50 px-2.5 text-xs text-stone-900 dark:bg-stone-950 dark:text-stone-50"
              style={{ fontFamily: 'JetBrains Mono' }}
            />
          </View>
          <View>
            <Text
              className="mb-1 text-[10px] text-stone-400 dark:text-stone-600"
              style={{ fontFamily: 'JetBrains Mono' }}>
              URL
            </Text>
            <TextInput
              value={backend.url}
              onChangeText={(url) => onUpdate({ url })}
              placeholder="http://localhost:3000"
              placeholderTextColor={placeholderColor}
              className="h-9 rounded bg-stone-50 px-2.5 text-xs text-stone-900 dark:bg-stone-950 dark:text-stone-50"
              style={{ fontFamily: 'JetBrains Mono' }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
          <View>
            <Text
              className="mb-1 text-[10px] text-stone-400 dark:text-stone-600"
              style={{ fontFamily: 'JetBrains Mono' }}>
              Type
            </Text>
            <View className="flex-row gap-2">
              {(['local', 'sprite'] as BackendType[]).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => onUpdate({ type: t })}
                  className={`h-8 flex-1 items-center justify-center rounded ${
                    backend.type === t ? 'bg-amber-500' : 'bg-stone-50 dark:bg-stone-950'
                  }`}>
                  <Text
                    className={`text-[11px] font-medium ${
                      backend.type === t ? 'text-stone-950' : 'text-stone-600 dark:text-stone-500'
                    }`}
                    style={{ fontFamily: 'JetBrains Mono' }}>
                    {t === 'local' ? 'Local' : 'Sprite'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          {backend.type === 'sprite' && (
            <View>
              <Text
                className="mb-1 text-[10px] text-stone-400 dark:text-stone-600"
                style={{ fontFamily: 'JetBrains Mono' }}>
                Auth Token
              </Text>
              <TextInput
                value={backend.authToken ?? ''}
                onChangeText={(authToken) => onUpdate({ authToken: authToken || undefined })}
                placeholder="Bearer token (optional)"
                placeholderTextColor={placeholderColor}
                className="h-9 rounded bg-stone-50 px-2.5 text-xs text-stone-900 dark:bg-stone-950 dark:text-stone-50"
                style={{ fontFamily: 'JetBrains Mono' }}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
            </View>
          )}
          <View className="flex-row items-center justify-between pt-1">
            <View className="flex-row items-center gap-2">
              <Text
                className="text-[11px] text-stone-500 dark:text-stone-500"
                style={{ fontFamily: 'JetBrains Mono' }}>
                Enabled
              </Text>
              <Switch
                value={backend.enabled}
                onValueChange={(enabled) => onUpdate({ enabled })}
                trackColor={{
                  false: colorScheme === 'dark' ? '#292524' : '#E7E5E4',
                  true: '#F59E0B',
                }}
                thumbColor="#FFFFFF"
                style={{ transform: [{ scale: 0.8 }] }}
              />
            </View>
            <Pressable onPress={onDelete} className="flex-row items-center gap-1" hitSlop={8}>
              <Trash2 size={14} color="#ef4444" />
              <Text className="text-[11px] text-red-500" style={{ fontFamily: 'JetBrains Mono' }}>
                Delete
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// --- Sub-components ---

function SectionHeader({ title }: { title: string }) {
  return (
    <View className="px-5 pb-2 pt-6">
      <Text
        className="text-[10px] font-semibold text-stone-400 dark:text-stone-600"
        style={{ letterSpacing: 2, fontFamily: 'JetBrains Mono' }}>
        {title}
      </Text>
    </View>
  );
}

interface SettingsRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

function SettingsRow({ label, description, children }: SettingsRowProps) {
  return (
    <View className="px-5 py-3.5">
      <View className="flex-row items-center justify-between">
        <View className="mr-3 flex-1">
          <Text
            className="text-sm font-medium text-stone-900 dark:text-stone-50"
            style={{ fontFamily: 'JetBrains Mono' }}>
            {label}
          </Text>
          {description && (
            <Text className="mt-0.5 text-xs text-stone-400 dark:text-stone-600">{description}</Text>
          )}
        </View>
        {children}
      </View>
    </View>
  );
}

interface DropdownPickerProps<T extends string | number> {
  value: T;
  options: { label: string; value: T }[];
  onValueChange: (value: T) => void;
}

function DropdownPicker<T extends string | number>({
  value,
  options,
  onValueChange,
}: DropdownPickerProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const { colorScheme } = useColorScheme();
  const chevronColor = colorScheme === 'dark' ? '#78716C' : '#78716C';
  const selectedLabel = options.find((o) => o.value === value)?.label ?? '';

  return (
    <View>
      <Pressable
        onPress={() => setIsOpen(!isOpen)}
        className="flex-row items-center gap-1.5 rounded-lg bg-white px-3 py-2 dark:bg-stone-900">
        <Text className="text-xs text-stone-700 dark:text-stone-400">{selectedLabel}</Text>
        <ChevronDown size={14} color={chevronColor} />
      </Pressable>

      {isOpen && (
        <View
          className="absolute right-0 top-11 z-10 min-w-[160px] overflow-hidden rounded-lg bg-white dark:bg-stone-900"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}>
          {options.map((option) => (
            <Pressable
              key={String(option.value)}
              onPress={() => {
                onValueChange(option.value);
                setIsOpen(false);
              }}
              className={`px-3.5 py-2.5 ${
                option.value === value ? 'bg-stone-100 dark:bg-stone-950' : ''
              }`}>
              <Text
                className={`text-xs ${
                  option.value === value
                    ? 'text-amber-600 dark:text-amber-500'
                    : 'text-stone-700 dark:text-stone-400'
                }`}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
