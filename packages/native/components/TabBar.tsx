import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { Plus } from 'lucide-react-native'
import { useColorScheme } from 'nativewind'

interface TabBarProps {
  activeTab: 'session' | 'changes'
  onTabChange: (tab: 'session' | 'changes') => void
  /** Optional callback to create a new session; renders a button when provided */
  onNewSession?: () => void
}

export function TabBar({ activeTab, onTabChange, onNewSession }: TabBarProps) {
  const { colorScheme } = useColorScheme()
  const mutedColor = colorScheme === 'dark' ? '#78716C' : '#A8A29E'

  return (
    <View className="flex-row items-center px-4 border-b border-stone-200 dark:border-stone-800">
      <View className="flex-row gap-4 flex-1">
        <Pressable
          onPress={() => onTabChange('session')}
          className={`pb-2.5 ${activeTab === 'session' ? 'border-b-2 border-amber-600 dark:border-amber-500' : ''}`}
        >
          <Text
            className={`text-sm font-medium ${activeTab === 'session' ? 'text-amber-600 dark:text-amber-500' : 'text-stone-400 dark:text-stone-600'}`}
            style={{ fontFamily: 'JetBrains Mono' }}
          >
            Session
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onTabChange('changes')}
          className={`pb-2.5 ${activeTab === 'changes' ? 'border-b-2 border-amber-600 dark:border-amber-500' : ''}`}
        >
          <Text
            className={`text-sm font-medium ${activeTab === 'changes' ? 'text-amber-600 dark:text-amber-500' : 'text-stone-400 dark:text-stone-600'}`}
            style={{ fontFamily: 'JetBrains Mono' }}
          >
            Changes
          </Text>
        </Pressable>
      </View>

      {onNewSession && (
        <Pressable
          onPress={onNewSession}
          className="flex-row items-center gap-1.5 mb-1 px-2.5 py-1 rounded-md border border-stone-300 dark:border-stone-700"
        >
          <Plus size={14} color={mutedColor} />
          <Text
            className="text-xs text-stone-500 dark:text-stone-500"
            style={{ fontFamily: 'JetBrains Mono' }}
          >
            New Session
          </Text>
        </Pressable>
      )}
    </View>
  )
}
