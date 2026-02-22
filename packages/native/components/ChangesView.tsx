import React from 'react'
import { View, Text, ScrollView } from 'react-native'
import type { ChangedFile } from '../__fixtures__/messages'

interface ChangesViewProps {
  changes: ChangedFile[]
}

export function ChangesView({ changes }: ChangesViewProps) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Text className="text-xs text-oc-text-muted" style={{ fontFamily: 'JetBrains Mono' }}>
        {changes.length} file{changes.length !== 1 ? 's' : ''} changed
      </Text>

      {changes.map((file) => (
        <View key={file.path} className="gap-2">
          {/* File path */}
          <Text
            className="text-xs text-oc-accent"
            style={{ fontFamily: 'JetBrains Mono' }}
          >
            {file.path}
          </Text>

          {/* Diff lines */}
          <View className="bg-oc-bg-surface rounded-lg p-3 gap-1">
            {file.additions.map((line, i) => (
              <Text
                key={`add-${i}`}
                className="text-xs text-oc-green"
                style={{ fontFamily: 'JetBrains Mono' }}
              >
                + {line}
              </Text>
            ))}
            {file.deletions.map((line, i) => (
              <Text
                key={`del-${i}`}
                className="text-xs text-oc-red"
                style={{ fontFamily: 'JetBrains Mono' }}
              >
                - {line}
              </Text>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  )
}
