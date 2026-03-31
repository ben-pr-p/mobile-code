import React from 'react'
import { View, Text } from 'react-native'
import type { ToolCallProps } from './types'
import { useCodeFontSize } from '../../hooks/useFontSize'

/** Collapsed view for tools without a specialized renderer. */
export function DefaultToolCollapsed({ description }: ToolCallProps) {
  const fs = useCodeFontSize()
  return (
    <Text
      className="font-medium text-amber-600 dark:text-amber-500"
      style={{ fontFamily: 'JetBrains Mono', fontSize: fs.collapsed }}
      numberOfLines={1}
    >
      {description}
    </Text>
  )
}

/** Expanded view for tools without a specialized renderer. Shows raw input/output. */
export function DefaultToolExpanded({ toolMeta }: ToolCallProps) {
  const fs = useCodeFontSize()
  return (
    <View className="gap-2">
      {toolMeta.input && Object.keys(toolMeta.input).length > 0 && (
        <View className="gap-1">
          <Text className="font-semibold text-stone-400 uppercase" style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
            Input
          </Text>
          <Text
            className="text-stone-600 dark:text-stone-400"
            style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}
          >
            {JSON.stringify(toolMeta.input, null, 2)}
          </Text>
        </View>
      )}
      {toolMeta.output && (
        <View className="gap-1">
          <Text className="font-semibold text-stone-400 uppercase" style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
            Output
          </Text>
          <Text
            className="text-stone-600 dark:text-stone-400"
            style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}
            numberOfLines={20}
          >
            {toolMeta.output}
          </Text>
        </View>
      )}
      {toolMeta.error && (
        <View className="gap-1">
          <Text className="font-semibold text-red-400 uppercase" style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
            Error
          </Text>
          <Text
            className="text-red-500"
            style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}
          >
            {toolMeta.error}
          </Text>
        </View>
      )}
    </View>
  )
}
