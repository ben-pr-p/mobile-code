import React from 'react'
import { View, Text } from 'react-native'
import type { ToolCallProps } from './types'

/** Collapsed view for tools without a specialized renderer. */
export function DefaultToolCollapsed({ description }: ToolCallProps) {
  return (
    <Text
      className="text-[13px] font-medium text-amber-600 dark:text-amber-500"
      style={{ fontFamily: 'JetBrains Mono' }}
      numberOfLines={1}
    >
      {description}
    </Text>
  )
}

/** Expanded view for tools without a specialized renderer. Shows raw input/output. */
export function DefaultToolExpanded({ toolMeta }: ToolCallProps) {
  return (
    <View className="gap-2">
      {toolMeta.input && Object.keys(toolMeta.input).length > 0 && (
        <View className="gap-1">
          <Text className="text-[10px] font-semibold text-stone-400 uppercase" style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1 }}>
            Input
          </Text>
          <Text
            className="text-[12px] text-stone-600 dark:text-stone-400"
            style={{ fontFamily: 'JetBrains Mono' }}
          >
            {JSON.stringify(toolMeta.input, null, 2)}
          </Text>
        </View>
      )}
      {toolMeta.output && (
        <View className="gap-1">
          <Text className="text-[10px] font-semibold text-stone-400 uppercase" style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1 }}>
            Output
          </Text>
          <Text
            className="text-[12px] text-stone-600 dark:text-stone-400"
            style={{ fontFamily: 'JetBrains Mono' }}
            numberOfLines={20}
          >
            {toolMeta.output}
          </Text>
        </View>
      )}
      {toolMeta.error && (
        <View className="gap-1">
          <Text className="text-[10px] font-semibold text-red-400 uppercase" style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1 }}>
            Error
          </Text>
          <Text
            className="text-[12px] text-red-500"
            style={{ fontFamily: 'JetBrains Mono' }}
          >
            {toolMeta.error}
          </Text>
        </View>
      )}
    </View>
  )
}
