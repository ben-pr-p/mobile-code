import React, { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import type { ToolCallStatus } from '../../server/src/types'
import type { ToolMeta } from '../lib/stream-db'
import { getToolRenderers } from './tool-calls'

interface ToolCallBlockProps {
  toolName: string
  description: string
  status?: ToolCallStatus
  toolMeta?: ToolMeta | null
  onPress?: () => void
}

/** Status indicator dot color based on tool call lifecycle state. */
function StatusDot({ status }: { status?: ToolCallStatus }) {
  switch (status) {
    case 'error':
      return <View className="w-3.5 h-3.5 rounded-sm bg-red-500" />
    case 'running':
      return <View className="w-3.5 h-3.5 rounded-sm bg-amber-500 opacity-75" />
    case 'completed':
      return <View className="w-3.5 h-3.5 rounded-sm bg-green-600 dark:bg-green-500" />
    case 'pending':
    default:
      return <View className="w-3.5 h-3.5 rounded-sm bg-stone-400 dark:bg-stone-600" />
  }
}

/**
 * Inline display for a single tool call in the chat thread.
 * Collapsed by default — tap to expand and see tool-specific details.
 */
export function ToolCallBlock({ toolName, description, status, toolMeta, onPress }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const isError = status === 'error'

  const { Collapsed, Expanded } = getToolRenderers(toolName)

  const toolCallProps = {
    toolName,
    description,
    toolMeta: toolMeta ?? { status: status ?? 'pending' },
  }

  const handlePress = () => {
    setExpanded((prev) => !prev)
    onPress?.()
  }

  const displayName = toolName === 'bash' ? '> Shell' : toolName

  return (
    <View className="gap-1">
      {/* Tool name label */}
      <View className="flex-row items-center gap-1.5">
        <StatusDot status={status} />
        <Text
          className="text-[11px] font-semibold text-stone-500"
          style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1.5 }}
        >
          {displayName}
        </Text>
      </View>

      {/* Collapsed view — always visible, tap to toggle */}
      <Pressable
        onPress={handlePress}
        className="bg-white dark:bg-stone-900 rounded-lg p-3"
      >
        <Collapsed {...toolCallProps} />
      </Pressable>

      {/* Expanded view — shown below collapsed when toggled open */}
      {expanded && toolMeta && (
        <View className="bg-white dark:bg-stone-900 rounded-lg p-3">
          <Expanded {...toolCallProps} />
        </View>
      )}
    </View>
  )
}
