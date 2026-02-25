import React from 'react'
import { View, Text, Pressable, TextInput } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useColorScheme } from 'nativewind'
import { Mic, Plus, ChevronDown } from 'lucide-react-native'

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
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'
  const placeholderColor = isDark ? '#57534E' : '#A8A29E'
  const inputIconColor = isDark ? '#57534E' : '#A8A29E'
  const micIconColor = isDark ? '#0C0A09' : '#FAFAF9'
  const selectorColor = isDark ? '#57534E' : '#A8A29E'

  return (
    <View style={{ paddingBottom: insets.bottom + 4 }}>
      {/* Text input row — plus and stop buttons inside */}
      <View className="px-4 mb-3">
        <View className="flex-row items-center bg-stone-100 dark:bg-stone-900 rounded-xl h-11 pl-3.5 pr-1.5 gap-2">
          <TextInput
            value={textValue}
            onChangeText={onTextChange}
            onSubmitEditing={textValue.trim() && !isSending ? onSend : undefined}
            returnKeyType="send"
            editable={!isSending}
            placeholder={isSending ? 'Waiting for response...' : 'Ask anything...'}
            placeholderTextColor={placeholderColor}
            className="flex-1 text-sm text-stone-900 dark:text-stone-50"
            style={{ fontFamily: 'JetBrains Mono' }}
          />
          <Pressable
            onPress={onAttachPress}
            className="w-[30px] h-[30px] rounded-lg bg-stone-50 dark:bg-stone-950 items-center justify-center"
          >
            <Plus size={16} color={inputIconColor} />
          </Pressable>
          <Pressable
            onPress={isSending ? onStopPress : onSend}
            className="w-[34px] h-[34px] rounded-lg bg-stone-900 dark:bg-stone-50 items-center justify-center"
            style={{ opacity: !textValue.trim() && !isSending ? 0.5 : 1 }}
          >
            {isSending ? (
              <View className="w-3 h-3 rounded-sm bg-stone-50 dark:bg-stone-950" />
            ) : (
              <Text className="text-stone-50 dark:text-stone-900 text-xs font-bold">↑</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* Voice control row */}
      <View className="flex-row items-center justify-between px-4 mb-2">
        <Pressable className="flex-row items-center gap-1">
          <Text className="text-[11px] font-medium" style={{ fontFamily: 'JetBrains Mono', color: selectorColor }}>
            {providerName}
          </Text>
          <ChevronDown size={12} color={selectorColor} />
        </Pressable>

        {/* Mic button */}
        <Pressable
          onPress={onMicPress}
          className="w-[52px] h-[52px] rounded-full bg-amber-500 dark:bg-amber-500 items-center justify-center"
        >
          <Mic size={22} color={micIconColor} />
        </Pressable>

        <Pressable className="flex-row items-center gap-1">
          <Text className="text-[11px] font-medium" style={{ fontFamily: 'JetBrains Mono', color: selectorColor }}>
            {modelName}
          </Text>
          <ChevronDown size={12} color={selectorColor} />
        </Pressable>
      </View>
    </View>
  )
}
