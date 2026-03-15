import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  Animated,
  ScrollView,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { Check, Search } from 'lucide-react-native';
import type { AgentInfo, CommandInfo, PendingCommand } from '../state/settings';

interface AgentCommandSheetProps {
  visible: boolean;
  onClose: () => void;
  agents: AgentInfo[] | null;
  commands: CommandInfo[] | null;
  currentAgent: string;
  onSelectAgent: (agentName: string) => void;
  onSelectCommand: (command: PendingCommand) => void;
}

/**
 * Bottom sheet that lets users pick an agent or queue a command.
 * Mirrors the visual style and animation pattern of ModelSelectorSheet.
 */
export function AgentCommandSheet({
  visible,
  onClose,
  agents,
  commands,
  currentAgent,
  onSelectAgent,
  onSelectCommand,
}: AgentCommandSheetProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const slideAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [searchQuery, setSearchQuery] = useState('');

  // Reset search when sheet opens/closes
  useEffect(() => {
    if (!visible) setSearchQuery('');
  }, [visible]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      slideAnim.setValue(0);
      backdropAnim.setValue(0);
    }
  }, [visible, slideAnim, backdropAnim]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  const handleSelectAgent = (agentName: string) => {
    onSelectAgent(agentName);
    handleClose();
  };

  const handleSelectCommand = (cmd: CommandInfo) => {
    onSelectCommand({ name: cmd.name, description: cmd.description });
    handleClose();
  };

  const query = searchQuery.trim().toLowerCase();

  // Filter commands by search query
  const filteredCommands = useMemo(() => {
    if (!commands) return null;
    if (!query) return commands;
    return commands.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        (c.description?.toLowerCase().includes(query) ?? false),
    );
  }, [commands, query]);

  // Filter agents: only show primary agents, filtered by search query
  const filteredAgents = useMemo(() => {
    if (!agents) return null;
    const primary = agents.filter((a) => a.mode === 'primary' || a.mode === 'all');
    if (!query) return primary;
    return primary.filter(
      (a) =>
        a.name.toLowerCase().includes(query) ||
        (a.description?.toLowerCase().includes(query) ?? false),
    );
  }, [agents, query]);

  const screenHeight = Dimensions.get('window').height;
  const sheetMaxHeight = screenHeight * 0.7;

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetMaxHeight, 0],
  });

  const placeholderColor = isDark ? '#57534E' : '#A8A29E';
  const searchIconColor = isDark ? '#57534E' : '#A8A29E';

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleClose}>
      {/* Backdrop */}
      <Animated.View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          opacity: backdropAnim,
          justifyContent: 'flex-end',
        }}>
        <Pressable style={{ flex: 1 }} onPress={handleClose} />

        {/* Sheet */}
        <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0}>
          <Animated.View
            style={{
              transform: [{ translateY }],
              maxHeight: sheetMaxHeight,
              backgroundColor: isDark ? '#1C1917' : '#FAFAF9',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              paddingBottom: insets.bottom + 8,
            }}>
            {/* Handle bar */}
            <View className="items-center pt-3 pb-2">
              <View
                className="w-9 h-1 rounded-full"
                style={{ backgroundColor: isDark ? '#44403C' : '#D6D3D1' }}
              />
            </View>

            {/* Header */}
            <View className="px-5 pb-3">
              <Text
                className="text-base font-semibold text-stone-900 dark:text-stone-50"
                style={{ fontFamily: 'JetBrains Mono' }}>
                Select Agent or Command
              </Text>
            </View>

            <ScrollView
              className="px-5"
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled">
              {/* Commands section */}
              {filteredCommands && filteredCommands.length > 0 && (
                <>
                  <SectionLabel text="COMMANDS" />
                  {filteredCommands.map((cmd) => (
                    <CommandRow
                      key={cmd.name}
                      name={cmd.name}
                      description={cmd.description}
                      onPress={() => handleSelectCommand(cmd)}
                      isDark={isDark}
                    />
                  ))}
                  <View className="h-px bg-stone-200 dark:bg-stone-800 my-2" />
                </>
              )}

              {/* Agents section */}
              {filteredAgents && filteredAgents.length > 0 && (
                <>
                  <SectionLabel text="AGENTS" />
                  {filteredAgents.map((agent) => (
                    <AgentRow
                      key={agent.name}
                      name={agent.name}
                      description={agent.description}
                      isSelected={agent.name === currentAgent}
                      onPress={() => handleSelectAgent(agent.name)}
                      isDark={isDark}
                    />
                  ))}
                </>
              )}

              {/* Empty state */}
              {(!agents || agents.length === 0) && (!commands || commands.length === 0) && (
                <View className="py-8 items-center">
                  <Text className="text-sm text-stone-400 dark:text-stone-600 text-center">
                    {agents === null ? 'Loading...' : 'No agents or commands available'}
                  </Text>
                </View>
              )}

              {/* No search results */}
              {query &&
                (filteredCommands?.length ?? 0) === 0 &&
                (filteredAgents?.length ?? 0) === 0 && (
                  <View className="py-6 items-center">
                    <Text
                      className="text-sm text-stone-400 dark:text-stone-600 text-center"
                      style={{ fontFamily: 'JetBrains Mono' }}>
                      No results matching "{searchQuery.trim()}"
                    </Text>
                  </View>
                )}
            </ScrollView>

            {/* Search bar — pinned at bottom */}
            <View className="px-5 pt-3">
              <View className="flex-row items-center bg-stone-100 dark:bg-stone-900 rounded-lg px-3 h-10 gap-2">
                <Search size={14} color={searchIconColor} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search..."
                  placeholderTextColor={placeholderColor}
                  className="flex-1 text-xs text-stone-900 dark:text-stone-50 py-0"
                  style={{ fontFamily: 'JetBrains Mono' }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionLabel({ text }: { text: string }) {
  return (
    <Text
      className="text-[10px] font-semibold text-stone-400 dark:text-stone-600 mb-2 px-1"
      style={{ letterSpacing: 2, fontFamily: 'JetBrains Mono' }}>
      {text}
    </Text>
  );
}

function CommandRow({
  name,
  description,
  onPress,
  isDark,
}: {
  name: string;
  description?: string;
  onPress: () => void;
  isDark: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between py-2.5 px-3 rounded-lg mb-0.5 active:opacity-70"
      style={{ backgroundColor: 'transparent' }}>
      <View className="flex-1 mr-3">
        <Text
          className="text-sm text-stone-900 dark:text-stone-50"
          style={{ fontFamily: 'JetBrains Mono' }}>
          /{name}
        </Text>
        {description && (
          <Text
            className="text-[10px] text-stone-500 dark:text-stone-500 mt-0.5"
            style={{ fontFamily: 'JetBrains Mono' }}>
            {description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function AgentRow({
  name,
  description,
  isSelected,
  onPress,
  isDark,
}: {
  name: string;
  description?: string;
  isSelected: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between py-2.5 px-3 rounded-lg mb-0.5"
      style={{
        backgroundColor: isSelected ? (isDark ? '#292524' : '#F5F5F4') : 'transparent',
      }}>
      <View className="flex-1 mr-3">
        <Text
          className="text-sm text-stone-900 dark:text-stone-50"
          style={{ fontFamily: 'JetBrains Mono' }}>
          {name}
        </Text>
        {description && (
          <Text
            className="text-[10px] text-stone-500 dark:text-stone-500 mt-0.5"
            style={{ fontFamily: 'JetBrains Mono' }}>
            {description}
          </Text>
        )}
      </View>
      {isSelected && <Check size={16} color={isDark ? '#F59E0B' : '#D97706'} />}
    </Pressable>
  );
}
