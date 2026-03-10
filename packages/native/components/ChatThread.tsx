import React, { useRef, useEffect, useCallback } from 'react'
import {
  View,
  ScrollView,
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { ToolCallBlock } from './ToolCallBlock'
import { ToolOutputBlock } from './ToolOutputBlock'
import { AgentStatusIndicator } from './AgentStatusIndicator'
import { UserMessageBubble } from './UserMessageBubble'
import { AssistantMessageBubble } from './AssistantMessageBubble'
import type { UIMessage as Message } from '../lib/stream-db'

interface ChatThreadProps {
  messages: Message[]
  onToolCallPress?: (messageId: string) => void
}

const NEAR_BOTTOM_THRESHOLD = 150 // pixels from bottom to count as "near bottom"

export function ChatThread({ messages, onToolCallPress }: ChatThreadProps) {
  const scrollRef = useRef<ScrollView>(null)
  const prevCountRef = useRef(0)
  const isNearBottomRef = useRef(true)

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent
      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y
      isNearBottomRef.current = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD
    },
    []
  )

  useEffect(() => {
    if (messages.length > 0) {
      const animated = prevCountRef.current > 0
      const isFirstLoad = prevCountRef.current === 0
      prevCountRef.current = messages.length
      // Only auto-scroll if user is near the bottom (or on first load)
      if (isFirstLoad || isNearBottomRef.current) {
        setTimeout(() => {
          scrollRef.current?.scrollToEnd({ animated })
        }, 100)
      }
    }
  }, [messages.length])

  // Auto-scroll to end when keyboard appears (only if near bottom)
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      if (isNearBottomRef.current) {
        setTimeout(() => {
          scrollRef.current?.scrollToEnd({ animated: true })
        }, 100)
      }
    })
    return () => sub.remove()
  }, [])

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1"
      contentContainerStyle={{ padding: 16, gap: 12 }}
      showsVerticalScrollIndicator={false}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      {messages.map((message) => {
        switch (message.type) {
          case 'tool_call':
            return (
              <ToolCallBlock
                key={message.id}
                toolName={message.toolName!}
                description={message.content}
                onPress={() => onToolCallPress?.(message.id)}
              />
            )
          case 'tool_output':
            return (
              <ToolOutputBlock
                key={message.id}
                content={message.content}
              />
            )
          case 'status':
            return (
              <AgentStatusIndicator
                key={message.id}
                status={message.content}
              />
            )
          case 'text':
          case 'voice':
            if (message.role === 'user') {
              return (
                <UserMessageBubble
                  key={message.id}
                  content={message.content}
                  isVoice={message.type === 'voice'}
                  syncStatus={message.syncStatus}
                />
              )
            }
            return (
              <AssistantMessageBubble
                key={message.id}
                content={message.content}
                isComplete={message.isComplete}
              />
            )
          default:
            return null
        }
      })}
    </ScrollView>
  )
}
