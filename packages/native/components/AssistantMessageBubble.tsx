import React, { useMemo } from 'react'
import { View } from 'react-native'
import { useColorScheme } from 'nativewind'
import { StreamdownRN } from 'streamdown-rn'
import { darkTheme, lightTheme } from 'streamdown-rn/dist/themes'
import type { ThemeConfig } from 'streamdown-rn/dist/core/types'
import { useConversationFontSize } from '../hooks/useFontSize'

interface AssistantMessageBubbleProps {
  content: string
  isComplete: boolean
}

export function AssistantMessageBubble({ content, isComplete }: AssistantMessageBubbleProps) {
  const { colorScheme } = useColorScheme()
  const fontSize = useConversationFontSize()

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
      spacing: {
        ...base.spacing,
        block: Math.round(base.spacing.block * fontSize.spacingScale),
        inline: Math.round(base.spacing.inline * fontSize.spacingScale),
      },
    }
  }, [colorScheme, fontSize.spacingScale])

  // Scale the entire markdown renderer proportionally via transform.
  // streamdown-rn controls its own internal font sizes, so we use
  // a scale transform to respect the user's conversation size preference.
  const scale = fontSize.body / 14 // 14px is the default body size

  return (
    <View style={scale !== 1 ? { transform: [{ scale }], transformOrigin: 'top left', width: `${100 / scale}%` } : undefined}>
      <StreamdownRN theme={theme} isComplete={isComplete} style={{ flex: undefined }}>
        {content}
      </StreamdownRN>
    </View>
  )
}
