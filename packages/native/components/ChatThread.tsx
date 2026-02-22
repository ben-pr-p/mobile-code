import React from 'react'
import { View, ScrollView } from 'react-native'
import { ToolCallBlock } from './ToolCallBlock'
import { ToolOutputBlock } from './ToolOutputBlock'
import { AgentStatusIndicator } from './AgentStatusIndicator'
import { UserMessageBubble } from './UserMessageBubble'
import { AssistantMessageBubble } from './AssistantMessageBubble'
import type { Message } from '../__fixtures__/messages'

interface ChatThreadProps {
  messages: Message[]
  onToolCallPress?: (messageId: string) => void
}

export function ChatThread({ messages, onToolCallPress }: ChatThreadProps) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, gap: 12 }}
      showsVerticalScrollIndicator={false}
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
              />
            )
          default:
            return null
        }
      })}
    </ScrollView>
  )
}
