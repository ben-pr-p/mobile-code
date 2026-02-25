import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Menu, Plus, Search, Ellipsis, Settings, Mic, HelpCircle } from 'lucide-react-native';
import { useSidebarSessions, type SidebarSession } from '../hooks/useSidebarSessions';

interface SessionsSidebarProps {
  worktree: string | undefined;
  selectedSessionId: string | null;
  onClose: () => void;
  onNewSession: () => void;
  onSelectSession: (sessionId: string, worktree: string) => void;
  onOverflowSession?: (id: string) => void;
  onSettingsPress: () => void;
  onMicPress: () => void;
  onHelpPress: () => void;
}

export function SessionsSidebar({
  worktree,
  selectedSessionId,
  onClose,
  onNewSession,
  onSelectSession,
  onOverflowSession,
  onSettingsPress,
  onMicPress,
  onHelpPress,
}: SessionsSidebarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-oc-bg-primary" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="h-14 flex-row items-center justify-between px-5">
        <Pressable
          onPress={onClose}
          className="h-10 w-10 items-center justify-center rounded-lg bg-oc-bg-surface">
          <Menu size={20} color="#94A3B8" />
        </Pressable>

        <Text className="text-lg font-semibold text-white">Sessions</Text>

        <Pressable
          onPress={onNewSession}
          className="h-10 w-10 items-center justify-center rounded-lg bg-oc-bg-surface">
          <Plus size={20} color="#94A3B8" />
        </Pressable>
      </View>

      {/* Divider */}
      <View className="h-px bg-oc-divider" />

      {worktree ? (
        <SessionListContent
          worktree={worktree}
          selectedSessionId={selectedSessionId}
          onSelectSession={onSelectSession}
          onOverflowSession={onOverflowSession}
        />
      ) : (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-sm font-medium text-oc-text-secondary">
            Select a project to view sessions
          </Text>
        </View>
      )}

      {/* Bottom bar */}
      <View
        className="flex-row items-center justify-between px-5 pt-3"
        style={{
          borderTopWidth: 1,
          borderTopColor: '#0F172A',
          paddingBottom: Math.max(insets.bottom, 28),
        }}>
        <Pressable testID="settings-icon" onPress={onSettingsPress} hitSlop={8}>
          <Settings size={22} color="#475569" />
        </Pressable>

        <Pressable
          onPress={onMicPress}
          className="h-12 w-12 items-center justify-center rounded-full bg-oc-accent">
          <Mic size={22} color="#0A0F1C" />
        </Pressable>

        <Pressable onPress={onHelpPress} hitSlop={8}>
          <HelpCircle size={22} color="#475569" />
        </Pressable>
      </View>
    </View>
  );
}

interface SessionRowProps {
  session: SidebarSession;
  isSelected: boolean;
  onPress: (sessionId: string, worktree: string) => void;
  onOverflow?: (id: string) => void;
}

function SessionRow({ session, isSelected, onPress, onOverflow }: SessionRowProps) {
  const isActive = session.status === 'active';

  return (
    <Pressable
      onPress={() => onPress(session.id, session.worktree)}
      className={`flex-row items-center gap-3 rounded-[10px] px-3.5 py-3 ${
        isSelected ? 'bg-oc-bg-surface' : ''
      }`}>
      <View className={`h-2 w-2 rounded-full ${isActive ? 'bg-oc-green' : 'bg-oc-text-muted'}`} />
      <View className="flex-1 gap-0.5">
        <Text
          className={`text-sm font-medium ${
            isActive ? 'text-oc-text-primary' : 'text-oc-text-secondary'
          }`}>
          {session.name}
        </Text>
        <Text className="text-[11px] text-oc-text-muted" style={{ fontFamily: 'JetBrains Mono' }}>
          {session.projectName} · {session.relativeTime}
        </Text>
      </View>
      {isSelected && onOverflow && (
        <Pressable onPress={() => onOverflow(session.id)} hitSlop={8}>
          <Ellipsis size={16} color="#475569" />
        </Pressable>
      )}
    </Pressable>
  );
}

function SessionListContent({
  worktree,
  selectedSessionId,
  onSelectSession,
  onOverflowSession,
}: {
  worktree: string;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string, worktree: string) => void;
  onOverflowSession?: (id: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: sessions } = useSidebarSessions(worktree, searchQuery);

  return (
    <>
      {/* Search */}
      <View className="px-5 pb-3 pt-1">
        <View className="h-11 flex-row items-center gap-2.5 rounded-lg bg-oc-bg-surface px-3.5">
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
        showsVerticalScrollIndicator={false}>
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
            <View className="px-3.5 pb-1 pt-4">
              <Text
                className="text-[10px] font-semibold text-oc-text-muted"
                style={{ letterSpacing: 2 }}>
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
    </>
  );
}
