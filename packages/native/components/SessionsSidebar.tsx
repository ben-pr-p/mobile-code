import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
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
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#A8A29E' : '#44403C';
  const mutedIconColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';
  const micIconColor = colorScheme === 'dark' ? '#0C0A09' : '#FFFFFF';

  return (
    <View className="flex-1 bg-stone-50 dark:bg-stone-950" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="h-14 flex-row items-center justify-between px-5">
        <Pressable
          onPress={onClose}
          className="h-10 w-10 items-center justify-center rounded-lg bg-white dark:bg-stone-900">
          <Menu size={20} color={iconColor} />
        </Pressable>

        <Text className="text-lg font-semibold text-stone-900 dark:text-stone-50" style={{ fontFamily: 'JetBrains Mono' }}>Sessions</Text>

        <Pressable
          onPress={onNewSession}
          className="h-10 w-10 items-center justify-center rounded-lg bg-white dark:bg-stone-900">
          <Plus size={20} color={iconColor} />
        </Pressable>
      </View>

      {/* Divider */}
      <View className="h-px bg-stone-200 dark:bg-stone-800" />

      {worktree ? (
        <SessionListContent
          worktree={worktree}
          selectedSessionId={selectedSessionId}
          onSelectSession={onSelectSession}
          onOverflowSession={onOverflowSession}
        />
      ) : (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-sm font-medium text-stone-700 dark:text-stone-400">
            Select a project to view sessions
          </Text>
        </View>
      )}

      {/* Bottom bar */}
      <View
        className="flex-row items-center justify-between px-5 pt-3 border-t border-stone-200 dark:border-stone-800"
        style={{
          paddingBottom: Math.max(insets.bottom, 28),
        }}>
        <Pressable testID="settings-icon" onPress={onSettingsPress} hitSlop={8}>
          <Settings size={22} color={mutedIconColor} />
        </Pressable>

        <Pressable
          onPress={onMicPress}
          className="h-12 w-12 items-center justify-center rounded-xl bg-amber-600 dark:bg-amber-500">
          <Mic size={22} color={micIconColor} />
        </Pressable>

        <Pressable onPress={onHelpPress} hitSlop={8}>
          <HelpCircle size={22} color={mutedIconColor} />
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
  const { colorScheme } = useColorScheme();
  const overflowColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';

  return (
    <Pressable
      onPress={() => onPress(session.id, session.worktree)}
      className={`flex-row items-center gap-3 rounded-lg px-3.5 py-3 ${
        isSelected ? 'bg-white dark:bg-stone-900' : ''
      }`}>
      <View className={`h-2 w-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-stone-400 dark:bg-stone-600'}`} />
      <View className="flex-1 gap-0.5">
        <Text
          className={`text-sm font-medium ${
            isActive ? 'text-stone-900 dark:text-stone-50' : 'text-stone-700 dark:text-stone-400'
          }`}
          style={{ fontFamily: 'JetBrains Mono' }}>
          {session.name}
        </Text>
        <Text className="text-[11px] text-stone-400 dark:text-stone-600" style={{ fontFamily: 'JetBrains Mono' }}>
          {session.projectName} · {session.relativeTime}
        </Text>
      </View>
      {isSelected && onOverflow && (
        <Pressable onPress={() => onOverflow(session.id)} hitSlop={8}>
          <Ellipsis size={16} color={overflowColor} />
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
  const { colorScheme } = useColorScheme();
  const searchIconColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';
  const placeholderColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';

  return (
    <>
      {/* Search */}
      <View className="px-5 pb-3 pt-1">
        <View className="h-11 flex-row items-center gap-2.5 rounded-lg bg-white dark:bg-stone-900 px-3.5">
          <Search size={16} color={searchIconColor} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="search --sessions"
            placeholderTextColor={placeholderColor}
            className="flex-1 text-xs text-stone-900 dark:text-stone-50"
            style={{ fontFamily: 'JetBrains Mono' }}
          />
        </View>
      </View>

      {/* Divider */}
      <View className="h-px bg-stone-200 dark:bg-stone-800" />

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
                className="text-[10px] font-semibold text-stone-400 dark:text-stone-600"
                style={{ letterSpacing: 2, fontFamily: 'JetBrains Mono' }}>
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
