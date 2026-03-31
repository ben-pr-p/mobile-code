import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import type { ToolCallProps } from './types';
import { useCodeFontSize } from '../../hooks/useFontSize';

interface ReadInput {
  filePath: string;
  offset?: number;
  limit?: number;
}

function ReadToolCollapsed({ description, toolMeta }: ToolCallProps) {
  const fs = useCodeFontSize();
  const input = toolMeta.input as ReadInput | undefined;
  const filePath = input?.filePath || description || 'Read file';
  return (
    <Text
      className="font-medium text-amber-600 dark:text-amber-500"
      style={{ fontFamily: 'JetBrains Mono', fontSize: fs.collapsed }}
      numberOfLines={1}>
      {filePath}
    </Text>
  );
}

function ReadToolExpanded({ toolMeta }: ToolCallProps) {
  const input = toolMeta.input as ReadInput | undefined;
  const filePath = input?.filePath || 'Unknown file';
  const offset = input?.offset;
  const limit = input?.limit;
  const output = toolMeta.output || '';
  const error = toolMeta.error;
  const fs = useCodeFontSize();

  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text
          className="font-semibold uppercase text-stone-400"
          style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
          File Path
        </Text>
        <Text
          className="text-stone-700 dark:text-stone-300"
          style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
          {filePath}
        </Text>
      </View>

      {(offset || limit) && (
        <View className="flex-row gap-4">
          {offset && (
            <View className="gap-1">
              <Text
                className="font-semibold uppercase text-stone-400"
                style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
                Offset
              </Text>
              <Text
                className="text-stone-500 dark:text-stone-400"
                style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
                {offset}
              </Text>
            </View>
          )}
          {limit && (
            <View className="gap-1">
              <Text
                className="font-semibold uppercase text-stone-400"
                style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
                Limit
              </Text>
              <Text
                className="text-stone-500 dark:text-stone-400"
                style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
                {limit}
              </Text>
            </View>
          )}
        </View>
      )}

      {error && (
        <View className="gap-1">
          <Text
            className="font-semibold uppercase text-red-400"
            style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
            Error
          </Text>
          <View className="rounded-md bg-red-50 p-2 dark:bg-red-900/20">
            <Text
              className="text-red-600 dark:text-red-400"
              style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
              {error}
            </Text>
          </View>
        </View>
      )}

      {output && !error && (
        <View className="gap-1">
          <Text
            className="font-semibold uppercase text-stone-400"
            style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
            Contents
          </Text>
          <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
            <Text
              className="text-stone-600 dark:text-stone-400"
              style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
              {output}
            </Text>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

export { ReadToolCollapsed, ReadToolExpanded };
