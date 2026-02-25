import React, { useState } from 'react'
import { View, Text, Pressable, ScrollView, TextInput, Switch } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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

  return (
    <View className="flex-1 bg-oc-bg-primary" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="h-14 flex-row items-center px-5 gap-4">
        <Pressable
          testID="settings-back"
          onPress={onBack}
          className="w-10 h-10 rounded-lg bg-oc-bg-surface items-center justify-center"
        >
          <ArrowLeft size={20} color="#94A3B8" />
        </Pressable>
        <Text className="text-lg font-semibold text-white">Settings</Text>
      </View>

      {/* Divider */}
      <View className="h-px bg-oc-divider" />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 28) }}
      >
        {/* SERVER section */}
        <SectionHeader title="SERVER" />

        <View className="px-5 pb-1">
          <Text className="text-sm font-medium text-oc-text-primary mb-2">Server URL</Text>
          <TextInput
            testID="server-url-input"
            value={serverUrl}
            onChangeText={onServerUrlChange}
            placeholder="https://api.opencode.dev"
            placeholderTextColor="#475569"
            className="bg-oc-bg-surface rounded-lg h-11 px-3.5 text-xs text-white"
            style={{ fontFamily: 'JetBrains Mono' }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <ConnectionStatusBadge connection={connection} />
        </View>

        {/* Divider */}
        <View className="h-px bg-oc-divider mx-5 mt-4" />

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
            trackColor={{ false: '#1E293B', true: '#22D3EE' }}
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
        <View className="h-px bg-oc-divider mx-5 mt-2" />

        {/* ABOUT section */}
        <SectionHeader title="ABOUT" />

        <View className="px-5 py-3.5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-sm font-medium text-oc-text-primary">Version</Text>
            <Text
              className="text-xs text-oc-text-secondary"
              style={{ fontFamily: 'JetBrains Mono' }}
            >
              {appVersion}
            </Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-medium text-oc-text-primary">Default model</Text>
            <Text
              className="text-xs text-oc-text-secondary"
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
        className="text-[10px] font-semibold text-oc-text-muted"
        style={{ letterSpacing: 2 }}
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
  const isConnected = connection.status === 'connected'
  const isReconnecting = connection.status === 'reconnecting'

  const dotColor = isConnected
    ? 'bg-oc-green'
    : isReconnecting
      ? 'bg-oc-amber'
      : 'bg-oc-red'

  const label = isConnected
    ? `Connected · ${connection.latencyMs}ms latency`
    : isReconnecting
      ? 'Reconnecting...'
      : 'Disconnected'

  return (
    <View className="flex-row items-center gap-2 mt-2">
      <View className={`w-2 h-2 rounded-full ${dotColor}`} />
      <Text
        className="text-xs text-oc-text-secondary"
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
          <Text className="text-sm font-medium text-oc-text-primary">{label}</Text>
          {description && (
            <Text className="text-xs text-oc-text-muted mt-0.5">{description}</Text>
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
  const selectedLabel = options.find((o) => o.value === value)?.label ?? ''

  return (
    <View>
      <Pressable
        onPress={() => setIsOpen(!isOpen)}
        className="flex-row items-center gap-1.5 bg-oc-bg-surface rounded-lg px-3 py-2"
      >
        <Text className="text-xs text-oc-text-secondary">{selectedLabel}</Text>
        <ChevronDown size={14} color="#64748B" />
      </Pressable>

      {isOpen && (
        <View className="absolute top-11 right-0 bg-oc-bg-surface rounded-lg overflow-hidden z-10 min-w-[160px]"
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
                option.value === value ? 'bg-oc-bg-inset' : ''
              }`}
            >
              <Text
                className={`text-xs ${
                  option.value === value ? 'text-oc-accent' : 'text-oc-text-secondary'
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
      <View className="bg-oc-bg-surface rounded-lg px-3.5 py-3 gap-2">
        <BehaviorItem text="Pauses music when agent finishes responding" />
        <BehaviorItem text="Plays a beep to notify you" />
        <BehaviorItem text="Automatically starts recording your response" />
      </View>
    </View>
  )
}

function BehaviorItem({ text }: { text: string }) {
  return (
    <View className="flex-row items-start gap-2">
      <Text className="text-xs text-oc-text-muted mt-0.5">•</Text>
      <Text className="text-xs text-oc-text-secondary flex-1">{text}</Text>
    </View>
  )
}
