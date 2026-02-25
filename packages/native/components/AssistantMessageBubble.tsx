import React, { useMemo } from 'react'
import { View } from 'react-native'
import { useColorScheme } from 'nativewind'
import { StreamdownRN } from 'streamdown-rn'
import { darkTheme, lightTheme } from 'streamdown-rn/dist/themes'
import type { ThemeConfig } from 'streamdown-rn/dist/core/types'

interface AssistantMessageBubbleProps {
  content: string
}

export function AssistantMessageBubble({ content }: AssistantMessageBubbleProps) {
  const { colorScheme } = useColorScheme()

  const theme = useMemo((): ThemeConfig => {
    const base = colorScheme === 'dark' ? darkTheme : lightTheme
    return {
      ...base,
      fonts: {
        ...base.fonts,
        regular: 'JetBrains Mono',
        bold: 'JetBrainsMono-Bold',
        mono: 'JetBrains Mono',
      },
    }
  }, [colorScheme])

  return (
    <View className="items-start">
      <View className="max-w-[85%]">
        <StreamdownRN theme={theme} isComplete style={{ flex: undefined }}>
          {content}
        </StreamdownRN>
      </View>
    </View>
  )
}
