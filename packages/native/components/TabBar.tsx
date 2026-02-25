import React from 'react'
import { View, Text, Pressable } from 'react-native'

interface TabBarProps {
  activeTab: 'session' | 'changes'
  onTabChange: (tab: 'session' | 'changes') => void
}

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <View className="flex-row px-4 gap-4 border-b border-stone-200 dark:border-stone-800">
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
  )
}
