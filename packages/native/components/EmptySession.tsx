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
    <View className="flex-1 bg-stone-50 dark:bg-stone-950" style={{ paddingTop: insets.top }}>
      <SessionHeader
        projectName=""
        branchName=""
        relativeTime=""
        onMenuPress={onMenuPress}
        onProjectsPress={onProjectsPress}
      />
      <TabBar activeTab="session" onTabChange={() => {}} />
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-stone-400 dark:text-stone-600 text-sm text-center">
          Select a project and session to get started
        </Text>
      </View>
      <VoiceInputArea
        textValue={textValue}
        onTextChange={setTextValue}
        onSend={() => {}}
        onMicPressIn={() => {}}
        onMicPressOut={() => {}}
        onSendRecording={() => {}}
        onAttachPress={() => {}}
        onStopPress={() => {}}
        recordingState="idle"
        chunks={[]}
        totalDurationMs={0}
        onSendChunks={() => {}}
        onDiscardChunk={() => {}}
        onDiscardAllChunks={() => {}}
        modelName="..."
      />
    </View>
  )
}
