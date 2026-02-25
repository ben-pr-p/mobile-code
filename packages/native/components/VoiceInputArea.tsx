import React from 'react'
import { View, Text, Pressable, TextInput } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

interface VoiceInputAreaProps {
  textValue: string
  onTextChange: (text: string) => void
  onSend: () => void
  isSending?: boolean
  onMicPress: () => void
  onAttachPress: () => void
  onStopPress: () => void
  micHint: string
  modelName: string
  providerName: string
}

export function VoiceInputArea({
  textValue,
  onTextChange,
  onSend,
  isSending,
  onMicPress,
  onAttachPress,
  onStopPress,
  micHint,
  modelName,
  providerName,
}: VoiceInputAreaProps) {
  const insets = useSafeAreaInsets()

  return (
    <View style={{ paddingBottom: insets.bottom + 4 }}>
      {/* Text input row */}
      <View className="flex-row items-center px-4 gap-2 mb-3">
        <View className="flex-1 flex-row items-center bg-oc-bg-surface rounded-xl h-11 px-3 gap-2">
          <TextInput
            value={textValue}
            onChangeText={onTextChange}
            onSubmitEditing={textValue.trim() && !isSending ? onSend : undefined}
            returnKeyType="send"
            editable={!isSending}
            placeholder={isSending ? 'Waiting for response...' : 'Ask anything...'}
            placeholderTextColor="#475569"
            className="flex-1 text-sm text-white"
          />
          {textValue.trim() ? (
            <Pressable
              onPress={onSend}
              disabled={isSending}
              className="w-7 h-7 rounded-full bg-oc-accent items-center justify-center"
              style={{ opacity: isSending ? 0.5 : 1 }}
            >
              <Text className="text-oc-bg-primary text-xs font-bold">↑</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={onAttachPress}
          className="w-9 h-9 rounded-lg bg-oc-bg-surface items-center justify-center"
        >
          <Text className="text-oc-text-secondary text-base">+</Text>
        </Pressable>
        <Pressable
          onPress={onStopPress}
          className="w-9 h-9 rounded-lg bg-oc-bg-surface items-center justify-center"
        >
          <Text className="text-oc-text-secondary text-sm">■</Text>
        </Pressable>
      </View>

      {/* Mic button */}
      <View className="items-center mb-2">
        <Pressable
          onPress={onMicPress}
          className="w-14 h-14 rounded-full bg-oc-accent items-center justify-center"
        >
          <Text className="text-oc-bg-primary text-2xl">🎙</Text>
        </Pressable>
      </View>

      {/* Hint text */}
      <Text className="text-center text-[10px] text-oc-text-muted mb-2">
        {micHint}
      </Text>

      {/* Model selectors */}
      <View className="flex-row items-center justify-between px-6">
        <Text className="text-xs text-oc-text-muted" style={{ fontFamily: 'JetBrains Mono' }}>
          {providerName} ↓
        </Text>
        <Text className="text-xs text-oc-text-muted" style={{ fontFamily: 'JetBrains Mono' }}>
          {modelName} ↓
        </Text>
      </View>
    </View>
  )
}
