import React, { useState } from 'react'
import { View, Text, Pressable, ScrollView, TextInput, Switch } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useColorScheme } from 'nativewind'
import { ArrowLeft, ChevronDown } from 'lucide-react-native'
import type { ConnectionInfo, NotificationSound } from '../__fixtures__/settings'

interface SettingsScreenProps {
  // Server
  serverUrl: string
  onServerUrlChange: (url: string) => void
  connection: ConnectionInfo

  // Voice mode
  handsFreeAutoRecord: boolean
  onHandsFreeAutoRecordChange: (value: boolean) => void
  notificationSound: NotificationSound
  onNotificationSoundChange: (value: NotificationSound) => void
  notificationSoundOptions: { label: string; value: NotificationSound }[]
  // About
  appVersion: string
  defaultModel: string

  // Navigation
  onBack: () => void
}

export function SettingsScreen({
  serverUrl,
  onServerUrlChange,
  connection,
  handsFreeAutoRecord,
  onHandsFreeAutoRecordChange,
  notificationSound,
  onNotificationSoundChange,
  notificationSoundOptions,
  appVersion,
  defaultModel,
  onBack,
}: SettingsScreenProps) {
  const insets = useSafeAreaInsets()
  const { colorScheme, setColorScheme } = useColorScheme()
  const placeholderColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E'
  const iconColor = colorScheme === 'dark' ? '#A8A29E' : '#44403C'
  const mutedIconColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E'

  return (
    <View className="flex-1 bg-stone-50 dark:bg-stone-950" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="h-14 flex-row items-center px-5 gap-4">
        <Pressable
          testID="settings-back"
          onPress={onBack}
          className="w-10 h-10 rounded-lg bg-white dark:bg-stone-900 items-center justify-center"
        >
          <ArrowLeft size={20} color={iconColor} />
        </Pressable>
        <Text className="text-lg font-semibold text-stone-900 dark:text-stone-50" style={{ fontFamily: 'JetBrains Mono' }}>Settings</Text>
      </View>

      {/* Divider */}
      <View className="h-px bg-stone-200 dark:bg-stone-800" />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 28) }}
      >
        {/* SERVER section */}
        <SectionHeader title="SERVER" />

        <View className="px-5 pb-1">
          <Text className="text-sm font-medium text-stone-900 dark:text-stone-50 mb-2" style={{ fontFamily: 'JetBrains Mono' }}>Server URL</Text>
          <TextInput
            testID="server-url-input"
            value={serverUrl}
            onChangeText={onServerUrlChange}
            placeholder="https://api.opencode.dev"
            placeholderTextColor={placeholderColor}
            className="bg-white dark:bg-stone-900 rounded-lg h-11 px-3.5 text-xs text-stone-900 dark:text-stone-50"
            style={{ fontFamily: 'JetBrains Mono' }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <ConnectionStatusBadge connection={connection} />
        </View>

        {/* Divider */}
        <View className="h-px bg-stone-200 dark:bg-stone-800 mx-5 mt-4" />

        {/* APPEARANCE section */}
        <SectionHeader title="APPEARANCE" />

        <View className="px-5 pb-1">
          <Text className="text-sm font-medium text-stone-900 dark:text-stone-50 mb-3" style={{ fontFamily: 'JetBrains Mono' }}>Theme</Text>
          <View className="flex-row gap-2">
            {(['light', 'dark', 'system'] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => setColorScheme(mode)}
                className={`flex-1 h-10 rounded-lg items-center justify-center ${
                  (mode === 'system' && colorScheme === undefined) ||
                  (mode === 'light' && colorScheme === 'light') ||
                  (mode === 'dark' && colorScheme === 'dark')
                    ? 'bg-amber-500'
                    : 'bg-white dark:bg-stone-900'
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    (mode === 'system' && colorScheme === undefined) ||
                    (mode === 'light' && colorScheme === 'light') ||
                    (mode === 'dark' && colorScheme === 'dark')
                      ? 'text-stone-950'
                      : 'text-stone-700 dark:text-stone-400'
                  }`}
                  style={{ fontFamily: 'JetBrains Mono' }}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Divider */}
        <View className="h-px bg-stone-200 dark:bg-stone-800 mx-5 mt-4" />

        {/* VOICE MODE section */}
        <SectionHeader title="VOICE MODE" />

        <SettingsRow
          label="Hands-free auto-record"
          description="Auto-record when agent finishes"
        >
          <Switch
            testID="auto-record-toggle"
            value={handsFreeAutoRecord}
            onValueChange={onHandsFreeAutoRecordChange}
            trackColor={{ false: colorScheme === 'dark' ? '#292524' : '#E7E5E4', true: '#F59E0B' }}
            thumbColor="#FFFFFF"
          />
        </SettingsRow>

        <AutoRecordBehavior />

        <SettingsRow label="Notification sound">
          <DropdownPicker
            value={notificationSound}
            options={notificationSoundOptions}
            onValueChange={onNotificationSoundChange}
          />
        </SettingsRow>

        {/* Divider */}
        <View className="h-px bg-stone-200 dark:bg-stone-800 mx-5 mt-2" />

        {/* ABOUT section */}
        <SectionHeader title="ABOUT" />

        <View className="px-5 py-3.5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-sm font-medium text-stone-900 dark:text-stone-50" style={{ fontFamily: 'JetBrains Mono' }}>Version</Text>
            <Text
              className="text-xs text-stone-700 dark:text-stone-400"
              style={{ fontFamily: 'JetBrains Mono' }}
            >
              {appVersion}
            </Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-medium text-stone-900 dark:text-stone-50" style={{ fontFamily: 'JetBrains Mono' }}>Default model</Text>
            <Text
              className="text-xs text-stone-700 dark:text-stone-400"
              style={{ fontFamily: 'JetBrains Mono' }}
            >
              {defaultModel}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

// --- Sub-components ---

function SectionHeader({ title }: { title: string }) {
  return (
    <View className="px-5 pt-6 pb-2">
      <Text
        className="text-[10px] font-semibold text-stone-400 dark:text-stone-600"
        style={{ letterSpacing: 2, fontFamily: 'JetBrains Mono' }}
      >
        {title}
      </Text>
    </View>
  )
}

interface ConnectionStatusBadgeProps {
  connection: ConnectionInfo
}

function ConnectionStatusBadge({ connection }: ConnectionStatusBadgeProps) {
  const { status } = connection

  const dotColor = status === 'connected'
    ? 'bg-green-500'
    : status === 'reconnecting'
      ? 'bg-amber-500'
      : 'bg-red-500'

  const label = status === 'connected'
    ? `Connected · ${connection.latencyMs}ms`
    : status === 'reconnecting'
      ? 'Connecting...'
      : status === 'error'
        ? connection.error ?? 'Connection failed'
        : 'Disconnected'

  return (
    <View className="flex-row items-center gap-2 mt-2">
      <View className={`w-2 h-2 rounded-full ${dotColor}`} />
      <Text
        className={`text-xs ${status === 'error' ? 'text-red-500' : 'text-stone-700 dark:text-stone-400'}`}
        style={{ fontFamily: 'JetBrains Mono' }}
      >
        {label}
      </Text>
    </View>
  )
}

interface SettingsRowProps {
  label: string
  description?: string
  children: React.ReactNode
}

function SettingsRow({ label, description, children }: SettingsRowProps) {
  return (
    <View className="px-5 py-3.5">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-3">
          <Text className="text-sm font-medium text-stone-900 dark:text-stone-50" style={{ fontFamily: 'JetBrains Mono' }}>{label}</Text>
          {description && (
            <Text className="text-xs text-stone-400 dark:text-stone-600 mt-0.5">{description}</Text>
          )}
        </View>
        {children}
      </View>
    </View>
  )
}

interface DropdownPickerProps<T extends string | number> {
  value: T
  options: { label: string; value: T }[]
  onValueChange: (value: T) => void
}

function DropdownPicker<T extends string | number>({
  value,
  options,
  onValueChange,
}: DropdownPickerProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const { colorScheme } = useColorScheme()
  const chevronColor = colorScheme === 'dark' ? '#78716C' : '#78716C'
  const selectedLabel = options.find((o) => o.value === value)?.label ?? ''

  return (
    <View>
      <Pressable
        onPress={() => setIsOpen(!isOpen)}
        className="flex-row items-center gap-1.5 bg-white dark:bg-stone-900 rounded-lg px-3 py-2"
      >
        <Text className="text-xs text-stone-700 dark:text-stone-400">{selectedLabel}</Text>
        <ChevronDown size={14} color={chevronColor} />
      </Pressable>

      {isOpen && (
        <View className="absolute top-11 right-0 bg-white dark:bg-stone-900 rounded-lg overflow-hidden z-10 min-w-[160px]"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          {options.map((option) => (
            <Pressable
              key={String(option.value)}
              onPress={() => {
                onValueChange(option.value)
                setIsOpen(false)
              }}
              className={`px-3.5 py-2.5 ${
                option.value === value ? 'bg-stone-100 dark:bg-stone-950' : ''
              }`}
            >
              <Text
                className={`text-xs ${
                  option.value === value ? 'text-amber-600 dark:text-amber-500' : 'text-stone-700 dark:text-stone-400'
                }`}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

// --- Auto-record behavior summary ---

function AutoRecordBehavior() {
  return (
    <View className="px-5 pb-2">
      <View className="bg-white dark:bg-stone-900 rounded-lg px-3.5 py-3 gap-2">
        <BehaviorItem text="Pauses system audio when agent finishes responding" />
        <BehaviorItem text="Plays a beep to notify you" />
        <BehaviorItem text="Automatically starts recording your response" />
      </View>
    </View>
  )
}

function BehaviorItem({ text }: { text: string }) {
  return (
    <View className="flex-row items-start gap-2">
      <Text className="text-xs text-stone-400 dark:text-stone-600 mt-0.5">•</Text>
      <Text className="text-xs text-stone-700 dark:text-stone-400 flex-1">{text}</Text>
    </View>
  )
}
