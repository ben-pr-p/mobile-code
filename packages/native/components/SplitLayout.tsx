import React, { useState } from 'react'
import { View, Text, Pressable, Modal } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SessionHeader } from './SessionHeader'
import { TabBar } from './TabBar'
import { ChatThread } from './ChatThread'
import { ChangesView } from './ChangesView'
import { VoiceInputArea } from './VoiceInputArea'
import { SettingsScreen } from './SettingsScreen'
import type { Session } from '../hooks/useSession'
import type { Message } from '../hooks/useSessionMessages'
import type { ChangedFile } from '../hooks/useChanges'
import type { ConnectionInfo, NotificationSound } from '../__fixtures__/settings'
import type { LeftPanelContent } from '../state/ui'

interface SplitLayoutProps {
  sessionId: string
  session: Session
  messages: Message[]
  changes: ChangedFile[]
  onMenuPress: () => void
  onProjectsPress: () => void
  onToolCallPress?: (messageId: string) => void
  onSend: (text: string) => void
  isSending?: boolean
  settings: {
    serverUrl: string
    setServerUrl: (url: string) => void
    connection: ConnectionInfo
    handsFreeAutoRecord: boolean
    setHandsFreeAutoRecord: (value: boolean) => void
    notificationSound: NotificationSound
    setNotificationSound: (value: NotificationSound) => void
    notificationSoundOptions: { label: string; value: NotificationSound }[]
    appVersion: string
    defaultModel: string
  }
}

export function SplitLayout({
  sessionId,
  session,
  messages,
  changes,
  onMenuPress,
  onProjectsPress,
  onToolCallPress,
  onSend,
  isSending,
  settings,
}: SplitLayoutProps) {
  const insets = useSafeAreaInsets()
  const [textValue, setTextValue] = useState('')
  const [leftPanel, setLeftPanel] = useState<LeftPanelContent>({ type: 'changes' })
  const [activeTab, setActiveTab] = useState<'session' | 'changes'>('session')
  const [settingsVisible, setSettingsVisible] = useState(false)

  const handleTabChange = (tab: 'session' | 'changes') => {
    setActiveTab(tab)
    if (tab === 'changes') {
      // On iPad, Changes tab navigates the left panel to diff view
      setLeftPanel({ type: 'changes' })
    }
  }

  const handleToolCallPress = (messageId: string) => {
    setLeftPanel({ type: 'tool-detail', messageId })
    onToolCallPress?.(messageId)
  }

  const handleSettingsPress = () => {
    setSettingsVisible(true)
  }

  const handleCloseSettings = () => {
    setSettingsVisible(false)
  }

  const handleCloseLeftPanel = () => {
    setLeftPanel({ type: 'changes' })
  }

  return (
    <View className="flex-1 bg-oc-bg-primary" style={{ paddingTop: insets.top }}>
      {/* Global header spanning full width */}
      <View className="h-12 flex-row items-center justify-between px-4 border-b border-oc-divider">
        <View className="flex-row items-center gap-3">
          <Pressable
            testID="menu-button"
            onPress={onMenuPress}
            className="w-9 h-9 items-center justify-center"
            hitSlop={8}
          >
            <Text className="text-oc-text-secondary text-lg">☰</Text>
          </Pressable>
          <View className="flex-row items-center gap-2">
            <View className="w-2 h-2 rounded-full bg-oc-green" />
            <Text
              className="text-sm font-semibold text-white"
              style={{ fontFamily: 'JetBrains Mono' }}
            >
              {session.name.includes('/') ? session.name : 'opencode-rn'}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <Pressable
            testID="settings-button"
            accessibilityLabel="Settings"
            onPress={handleSettingsPress}
            className="w-9 h-9 items-center justify-center"
            hitSlop={8}
          >
            <Text className="text-oc-text-secondary text-lg">⚙</Text>
          </Pressable>
          <Pressable
            onPress={onProjectsPress}
            className="w-9 h-9 items-center justify-center"
            hitSlop={8}
          >
            <Text className="text-oc-text-secondary text-lg">📁</Text>
          </Pressable>
        </View>
      </View>

      {/* Subheader bar with branch + close button */}
      <View className="h-8 flex-row items-center justify-between px-4 border-b border-oc-divider">
        <View className="flex-row items-center gap-1.5">
          <Text className="text-xs text-oc-text-secondary">
            {session.name}
          </Text>
          <Text className="text-xs text-oc-text-muted">·</Text>
          <Text className="text-xs text-oc-text-muted">
            {formatRelativeTime(session.updatedAt)}
          </Text>
        </View>
        {leftPanel.type !== 'changes' && (
          <Pressable
            onPress={handleCloseLeftPanel}
            className="w-7 h-7 items-center justify-center"
            hitSlop={8}
          >
            <Text className="text-oc-text-muted text-sm">✕</Text>
          </Pressable>
        )}
      </View>

      {/* Split pane content */}
      <View className="flex-1 flex-row">
        {/* Left panel — contextual content (~50%) */}
        <View className="flex-1 border-r border-oc-divider">
          {leftPanel.type === 'tool-detail' ? (
            <View className="flex-1 p-4">
              <Text className="text-sm text-oc-text-muted">
                Tool detail for message: {leftPanel.messageId}
              </Text>
            </View>
          ) : (
            <ChangesView sessionId={sessionId} changes={changes} />
          )}
        </View>

        {/* Right panel — always shows chat (~50%) */}
        <View className="flex-1">
          <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
          <ChatThread messages={messages} onToolCallPress={handleToolCallPress} />
          <VoiceInputArea
            textValue={textValue}
            onTextChange={setTextValue}
            onSend={() => {
              const text = textValue.trim()
              if (!text) return
              setTextValue('')
              onSend(text)
            }}
            isSending={isSending}
            onMicPress={() => {}}
            onAttachPress={() => {}}
            onStopPress={() => {}}
            micHint="hold to record · tap for hands-free"
            modelName="Sonnet"
            providerName="Build"
          />
        </View>
      </View>

      {/* Settings modal — centered overlay on iPad */}
      <Modal
        visible={settingsVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseSettings}
      >
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          {/* Backdrop — dismiss on tap */}
          <Pressable className="absolute inset-0" onPress={handleCloseSettings} />

          {/* Modal card */}
          <View
            className="bg-oc-bg-primary rounded-2xl overflow-hidden"
            style={{
              width: 480,
              height: 560,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.4,
              shadowRadius: 24,
              elevation: 16,
            }}
          >
            <SettingsScreen
              serverUrl={settings.serverUrl}
              onServerUrlChange={settings.setServerUrl}
              connection={settings.connection}
              handsFreeAutoRecord={settings.handsFreeAutoRecord}
              onHandsFreeAutoRecordChange={settings.setHandsFreeAutoRecord}
              notificationSound={settings.notificationSound}
              onNotificationSoundChange={settings.setNotificationSound}
              notificationSoundOptions={settings.notificationSoundOptions}
              appVersion={settings.appVersion}
              defaultModel={settings.defaultModel}
              onBack={handleCloseSettings}
            />
          </View>
        </View>
      </Modal>
    </View>
  )
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
