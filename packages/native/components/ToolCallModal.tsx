import React from 'react'
import { View, Text, Modal, Pressable, ScrollView, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { useColorScheme } from 'nativewind'
import { getToolRenderers, type ToolCallProps } from './tool-calls'
import { StatusDot, TOOL_LABELS, formatDuration } from './tool-calls/shared'
import type { ToolMeta } from '../lib/stream-db'
import { useCodeFontSize } from '../hooks/useFontSize'

interface ToolCallModalProps {
  visible: boolean
  onClose: () => void
  toolName: string
  description: string
  toolMeta: ToolMeta
}

/**
 * Modal for displaying tool call details on iPhone.
 * Slides up from the bottom and shows the expanded tool view.
 */
export function ToolCallModal({
  visible,
  onClose,
  toolName,
  description,
  toolMeta,
}: ToolCallModalProps) {
  const insets = useSafeAreaInsets()
  const { colorScheme } = useColorScheme()
  const { height: screenHeight } = useWindowDimensions()
  const modalHeight = screenHeight * 0.7

  const { Expanded } = getToolRenderers(toolName)
  const toolLabel = TOOL_LABELS[toolName] || toolName
  const iconColor = colorScheme === 'dark' ? '#A8A29E' : '#44403C'
  const duration = toolMeta.time ? formatDuration(toolMeta.time.start, toolMeta.time.end) : null
  const fs = useCodeFontSize()

  const toolCallProps: ToolCallProps = {
    toolName,
    description,
    toolMeta,
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/50" onPress={onClose} />

        <View
          className="bg-stone-50 dark:bg-stone-950 rounded-t-2xl"
          style={{
            height: modalHeight,
            paddingBottom: insets.bottom + 16,
          }}
        >
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-800">
            <View className="flex-row items-center gap-2">
              <StatusDot status={toolMeta.status} />
              <Text
                className="font-semibold text-stone-900 dark:text-stone-50"
                style={{ fontFamily: 'JetBrains Mono', fontSize: fs.collapsed }}
              >
                {toolLabel}
              </Text>
              {duration && (
                <Text
                  className="text-stone-400"
                  style={{ fontFamily: 'JetBrains Mono', fontSize: fs.toolLabel }}
                >
                  {duration}
                </Text>
              )}
            </View>
            <Pressable
              onPress={onClose}
              className="w-8 h-8 items-center justify-center"
              hitSlop={8}
            >
              <X size={20} color={iconColor} />
            </Pressable>
          </View>

          <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
            <Expanded {...toolCallProps} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}
