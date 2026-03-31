import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import type { ToolCallProps } from './types';
import { useCodeFontSize } from '../../hooks/useFontSize';

interface TaskInput {
  description: string;
  prompt: string;
  subagent_type: string;
}

const AGENT_TYPE_LABELS: Record<string, string> = {
  general: 'General',
  explore: 'Explore',
  'code-reviewer': 'Code Review',
};

function TaskToolCollapsed({ description, toolMeta }: ToolCallProps) {
  const fs = useCodeFontSize();
  const input = toolMeta.input as TaskInput | undefined;
  const displayText = input?.description || description || 'Sub-agent task';
  return (
    <Text
      className="font-medium text-amber-600 dark:text-amber-500"
      style={{ fontFamily: 'JetBrains Mono', fontSize: fs.collapsed }}
      numberOfLines={1}>
      {displayText}
    </Text>
  );
}

function TaskToolExpanded({ toolMeta }: ToolCallProps) {
  const input = toolMeta.input as TaskInput | undefined;
  const output = toolMeta.output || '';
  const error = toolMeta.error;
  const agentType = input?.subagent_type || 'general';
  const agentLabel = AGENT_TYPE_LABELS[agentType] || agentType;
  const fs = useCodeFontSize();

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <View className="rounded-md bg-blue-100 px-2 py-1 dark:bg-blue-900/30">
          <Text
            className="text-blue-700 dark:text-blue-400"
            style={{ fontFamily: 'JetBrains Mono', fontSize: fs.label }}>
            {agentLabel}
          </Text>
        </View>
      </View>

      {input?.description && (
        <View className="gap-1">
          <Text
            className="font-semibold uppercase text-stone-400"
            style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
            Description
          </Text>
          <Text
            className="text-stone-700 dark:text-stone-300"
            style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
            {input.description}
          </Text>
        </View>
      )}

      {input?.prompt && (
        <View className="gap-1">
          <Text
            className="font-semibold uppercase text-stone-400"
            style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
            Prompt
          </Text>
          <ScrollView style={{ maxHeight: 120 }} nestedScrollEnabled>
            <Text
              className="text-stone-600 dark:text-stone-400"
              style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
              {input.prompt}
            </Text>
          </ScrollView>
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
            Response
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

export { TaskToolCollapsed, TaskToolExpanded };
