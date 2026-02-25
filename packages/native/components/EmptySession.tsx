import React, { useState } from 'react'
import { View, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SessionHeader } from './SessionHeader'
import { TabBar } from './TabBar'
import { VoiceInputArea } from './VoiceInputArea'

interface EmptySessionProps {
  onMenuPress: () => void
  onProjectsPress: () => void
}

export function EmptySession({ onMenuPress, onProjectsPress }: EmptySessionProps) {
  const insets = useSafeAreaInsets()
  const [textValue, setTextValue] = useState('')

  return (
    <View className="flex-1 bg-oc-bg-primary" style={{ paddingTop: insets.top }}>
      <SessionHeader
        projectName=""
        branchName=""
        relativeTime=""
        onMenuPress={onMenuPress}
        onProjectsPress={onProjectsPress}
      />
      <TabBar activeTab="session" onTabChange={() => {}} />
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-oc-text-muted text-sm text-center">
          Select a project and session to get started
        </Text>
      </View>
      <VoiceInputArea
        textValue={textValue}
        onTextChange={setTextValue}
        onSend={() => {}}
        onMicPress={() => {}}
        onAttachPress={() => {}}
        onStopPress={() => {}}
        micHint="hold to record · tap for hands-free"
        modelName="Sonnet"
        providerName="Build"
      />
    </View>
  )
}
