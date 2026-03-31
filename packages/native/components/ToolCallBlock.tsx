import React, { useState } from 'react'
import { View, Text, Pressable, useWindowDimensions } from 'react-native'
import type { ToolCallStatus } from '../../server/src/types'
import type { ToolMeta } from '../lib/stream-db'
import { getToolRenderers } from './tool-calls'
import { StatusDot, TOOL_LABELS } from './tool-calls/shared'
import { ToolCallModal } from './ToolCallModal'
import { useCodeFontSize } from '../hooks/useFontSize'

interface ToolCallBlockProps {
  toolName: string
  description: string
  status?: ToolCallStatus
  toolMeta?: ToolMeta | null
  onPress?: () => void
}

/**
 * Inline display for a single tool call in the chat thread.
 * Collapsed by default — tap to expand and see tool-specific details.
 * On iPhone, shows a modal. On iPad, populates the left panel.
 */
export function ToolCallBlock({ toolName, description, status, toolMeta, onPress }: ToolCallBlockProps) {
  const [modalVisible, setModalVisible] = useState(false)
  const { width } = useWindowDimensions()
  const isTablet = width >= 768
  const fs = useCodeFontSize()

  const { Collapsed } = getToolRenderers(toolName)

  const toolCallProps = {
    toolName,
    description,
    toolMeta: toolMeta ?? { status: status ?? 'pending' },
  }

  const handlePress = () => {
    if (isTablet) {
      onPress?.()
    } else {
      setModalVisible(true)
    }
  }

  const toolLabel = TOOL_LABELS[toolName] || toolName

  return (
    <>
      <View className="gap-1">
        <View className="flex-row items-center gap-1.5">
          <StatusDot status={status} />
          <Text
            className="font-semibold text-stone-500"
            style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1.5, fontSize: fs.toolLabel }}
          >
            {toolLabel}
          </Text>
        </View>

        <Pressable
          onPress={handlePress}
          className="bg-white dark:bg-stone-900 rounded-lg p-3"
        >
          <Collapsed {...toolCallProps} />
        </Pressable>
      </View>

      {!isTablet && (
        <ToolCallModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          toolName={toolName}
          description={description}
          toolMeta={toolMeta ?? { status: status ?? 'pending' }}
        />
      )}
    </>
  )
}
