import React from 'react'
import { View, Text, Pressable } from 'react-native'

interface TabBarProps {
  activeTab: 'session' | 'changes'
  onTabChange: (tab: 'session' | 'changes') => void
}

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <View className="flex-row px-4 gap-4 border-b border-oc-divider">
      <Pressable
        onPress={() => onTabChange('session')}
        className={`pb-2.5 ${activeTab === 'session' ? 'border-b-2 border-oc-accent' : ''}`}
      >
        <Text
          className={`text-sm font-medium ${activeTab === 'session' ? 'text-oc-accent' : 'text-oc-text-muted'}`}
        >
          Session
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onTabChange('changes')}
        className={`pb-2.5 ${activeTab === 'changes' ? 'border-b-2 border-oc-accent' : ''}`}
      >
        <Text
          className={`text-sm font-medium ${activeTab === 'changes' ? 'text-oc-accent' : 'text-oc-text-muted'}`}
        >
          Changes
        </Text>
      </Pressable>
    </View>
  )
}
