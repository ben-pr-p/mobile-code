import React, { useRef, useEffect, useCallback } from 'react'
import { View, Keyboard } from 'react-native'
import { FlashList, type FlashListRef } from '@shopify/flash-list'
import { ToolCallBlock } from './ToolCallBlock'
import { AgentStatusIndicator } from './AgentStatusIndicator'
import { UserMessageBubble } from './UserMessageBubble'
import { AssistantMessageBubble } from './AssistantMessageBubble'
import type { UIMessage as Message } from '../lib/stream-db'

interface ChatThreadProps {
  messages: Message[]
  onToolCallPress?: (messageId: string) => void
}

const NEAR_BOTTOM_THRESHOLD = 150 // pixels from bottom to count as "near bottom"

/**
 * Virtualized chat message list.
 * Uses an inverted FlashList so the most recent messages are at the bottom
 * and only the visible window is rendered.
 */
export function ChatThread({ messages, onToolCallPress }: ChatThreadProps) {
  const listRef = useRef<FlashListRef<Message>>(null)
  const prevCountRef = useRef(0)
  const isNearBottomRef = useRef(true)

  // Inverted list: data must be reversed so index 0 = newest (bottom of screen)
  const invertedData = React.useMemo(
    () => [...messages].reverse(),
    [messages]
  )

  const handleScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
      // In an inverted list, "near bottom" means near offset 0 (the top of the inverted view)
      const { contentOffset } = event.nativeEvent
      isNearBottomRef.current = contentOffset.y <= NEAR_BOTTOM_THRESHOLD
    },
    []
  )

  useEffect(() => {
    if (messages.length > 0) {
      const isFirstLoad = prevCountRef.current === 0
      prevCountRef.current = messages.length
      // Only auto-scroll if user is near the bottom (or on first load)
      // In an inverted list, scrolling to bottom = scrolling to offset 0
      if (isFirstLoad || isNearBottomRef.current) {
        setTimeout(() => {
          listRef.current?.scrollToOffset({ offset: 0, animated: !isFirstLoad })
        }, 100)
      }
    }
  }, [messages.length])

  // Auto-scroll to end when keyboard appears (only if near bottom)
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      if (isNearBottomRef.current) {
        setTimeout(() => {
          listRef.current?.scrollToOffset({ offset: 0, animated: true })
        }, 100)
      }
    })
    return () => sub.remove()
  }, [])

  const renderItem = useCallback(
    ({ item: message }: { item: Message }) => {
      switch (message.type) {
        case 'tool_call':
          return (
            <ToolCallBlock
              toolName={message.toolName!}
              description={message.content}
              status={message.toolMeta?.status}
              toolMeta={message.toolMeta}
              onPress={() => onToolCallPress?.(message.id)}
            />
          )
        case 'status':
          return <AgentStatusIndicator status={message.content} />
        case 'text':
        case 'voice':
          if (message.role === 'user') {
            return (
              <UserMessageBubble
                content={message.content}
                isVoice={message.type === 'voice'}
                syncStatus={message.syncStatus}
              />
            )
          }
          return (
            <AssistantMessageBubble
              content={message.content}
              isComplete={message.isComplete}
            />
          )
        default:
          return null
      }
    },
    [onToolCallPress]
  )

  const keyExtractor = useCallback((item: Message) => item.id, [])

  const getItemType = useCallback((item: Message) => {
    if (item.type === 'text' || item.type === 'voice') {
      return item.role === 'user' ? 'user_text' : 'assistant_text'
    }
    return item.type
  }, [])

  return (
    <FlashList
      ref={listRef}
      data={invertedData}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      inverted
      contentContainerStyle={{ padding: 16 }}
      ItemSeparatorComponent={ItemSeparator}
      showsVerticalScrollIndicator={false}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      onScroll={handleScroll}
      scrollEventThrottle={16}
    />
  )
}

function ItemSeparator() {
  return <View style={{ height: 12 }} />
}
