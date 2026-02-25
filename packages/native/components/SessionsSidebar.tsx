import React, { useState } from 'react'
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Menu, Plus, Search, Ellipsis, Settings, Mic, HelpCircle } from 'lucide-react-native'
import { useSidebarSessions, type SidebarSession } from '../hooks/useSidebarSessions'

interface SessionRowProps {
  session: SidebarSession
  isSelected: boolean
  onPress: (sessionId: string, projectId: string) => void
  onOverflow?: (id: string) => void
}

function SessionRow({ session, isSelected, onPress, onOverflow }: SessionRowProps) {
  const isActive = session.status === 'active'

  return (
    <Pressable
      onPress={() => onPress(session.id, session.projectId)}
      className={`flex-row items-center gap-3 rounded-[10px] px-3.5 py-3 ${
        isSelected ? 'bg-oc-bg-surface' : ''
      }`}
    >
      <View
        className={`w-2 h-2 rounded-full ${isActive ? 'bg-oc-green' : 'bg-oc-text-muted'}`}
      />
      <View className="flex-1 gap-0.5">
        <Text
          className={`text-sm font-medium ${
            isActive ? 'text-oc-text-primary' : 'text-oc-text-secondary'
          }`}
        >
          {session.name}
        </Text>
        <Text
          className="text-[11px] text-oc-text-muted"
          style={{ fontFamily: 'JetBrains Mono' }}
        >
          {session.projectName} · {session.relativeTime}
        </Text>
      </View>
      {isSelected && onOverflow && (
        <Pressable onPress={() => onOverflow(session.id)} hitSlop={8}>
          <Ellipsis size={16} color="#475569" />
        </Pressable>
      )}
    </Pressable>
  )
}

interface SessionsSidebarProps {
  projectId: string | undefined
  selectedSessionId: string | null
  onClose: () => void
  onNewSession: () => void
  onSelectSession: (sessionId: string, projectId: string) => void
  onOverflowSession?: (id: string) => void
  onSettingsPress: () => void
  onMicPress: () => void
  onHelpPress: () => void
}

export function SessionsSidebar({
  projectId,
  selectedSessionId,
  onClose,
  onNewSession,
  onSelectSession,
  onOverflowSession,
  onSettingsPress,
  onMicPress,
  onHelpPress,
}: SessionsSidebarProps) {
  const insets = useSafeAreaInsets()
  const [searchQuery, setSearchQuery] = useState('')
  const { data: sessions } = useSidebarSessions(projectId, searchQuery)

  return (
    <View className="flex-1 bg-oc-bg-primary" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="h-14 flex-row items-center justify-between px-5">
        <Pressable
          onPress={onClose}
          className="w-10 h-10 rounded-lg bg-oc-bg-surface items-center justify-center"
        >
          <Menu size={20} color="#94A3B8" />
        </Pressable>

        <Text className="text-lg font-semibold text-white">Sessions</Text>

        <Pressable
          onPress={onNewSession}
          className="w-10 h-10 rounded-lg bg-oc-bg-surface items-center justify-center"
        >
          <Plus size={20} color="#94A3B8" />
        </Pressable>
      </View>

      {/* Search */}
      <View className="px-5 pt-1 pb-3">
        <View className="bg-oc-bg-surface rounded-lg h-11 flex-row items-center px-3.5 gap-2.5">
          <Search size={16} color="#475569" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="search --sessions"
            placeholderTextColor="#475569"
            className="flex-1 text-xs text-white"
            style={{ fontFamily: 'JetBrains Mono' }}
          />
        </View>
      </View>

      {/* Divider */}
      <View className="h-px bg-oc-divider" />

      {/* Sessions list */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 12, gap: 2 }}
        showsVerticalScrollIndicator={false}
      >
        {sessions.recent.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            isSelected={session.id === selectedSessionId}
            onPress={onSelectSession}
            onOverflow={onOverflowSession}
          />
        ))}

        {sessions.earlier.length > 0 && (
          <>
            <View className="px-3.5 pt-4 pb-1">
              <Text
                className="text-[10px] font-semibold text-oc-text-muted"
                style={{ letterSpacing: 2 }}
              >
                EARLIER
              </Text>
            </View>
            {sessions.earlier.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                isSelected={session.id === selectedSessionId}
                onPress={onSelectSession}
                onOverflow={onOverflowSession}
              />
            ))}
          </>
        )}
      </ScrollView>

      {/* Bottom bar */}
      <View
        className="flex-row items-center justify-between px-5 pt-3"
        style={{
          borderTopWidth: 1,
          borderTopColor: '#0F172A',
          paddingBottom: Math.max(insets.bottom, 28),
        }}
      >
        <Pressable testID="settings-icon" onPress={onSettingsPress} hitSlop={8}>
          <Settings size={22} color="#475569" />
        </Pressable>

        <Pressable
          onPress={onMicPress}
          className="w-12 h-12 rounded-full bg-oc-accent items-center justify-center"
        >
          <Mic size={22} color="#0A0F1C" />
        </Pressable>

        <Pressable onPress={onHelpPress} hitSlop={8}>
          <HelpCircle size={22} color="#475569" />
        </Pressable>
      </View>
    </View>
  )
}
