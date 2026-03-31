import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import type { ToolCallProps } from './types';
import { useCodeFontSize } from '../../hooks/useFontSize';

interface GrepInput {
  pattern: string;
  path?: string;
  include?: string;
}

interface GlobInput {
  pattern: string;
  path?: string;
}

interface ListInput {
  path: string;
}

function SearchToolCollapsed({ description, toolName, toolMeta }: ToolCallProps) {
  const fs = useCodeFontSize();
  const grepInput = toolMeta.input as GrepInput | undefined;
  const globInput = toolMeta.input as GlobInput | undefined;
  const listInput = toolMeta.input as ListInput | undefined;

  let displayText = description;
  if (toolName === 'grep' && grepInput?.pattern) {
    displayText = grepInput.pattern;
    if (grepInput.include) {
      displayText += ` in ${grepInput.include}`;
    }
  } else if (toolName === 'glob' && globInput?.pattern) {
    displayText = globInput.pattern;
  } else if (toolName === 'list' && listInput?.path) {
    displayText = listInput.path;
  }

  return (
    <Text
      className="font-medium text-amber-600 dark:text-amber-500"
      style={{ fontFamily: 'JetBrains Mono', fontSize: fs.collapsed }}
      numberOfLines={1}>
      {displayText}
    </Text>
  );
}

function SearchToolExpanded({ toolName, toolMeta }: ToolCallProps) {
  const grepInput = toolMeta.input as GrepInput | undefined;
  const globInput = toolMeta.input as GlobInput | undefined;
  const listInput = toolMeta.input as ListInput | undefined;
  const output = toolMeta.output || '';
  const error = toolMeta.error;

  const results = output.split('\n').filter((line) => line.trim().length > 0);
  const hasResults =
    results.length > 0 && output !== 'No files found' && !output.startsWith('No matches');
  const fs = useCodeFontSize();

  return (
    <View className="gap-3">
      {toolName === 'grep' && (
        <>
          <View className="gap-1">
            <Text
              className="font-semibold uppercase text-stone-400"
              style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
              Pattern
            </Text>
            <Text
              className="text-stone-700 dark:text-stone-300"
              style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
              {grepInput?.pattern || 'Unknown'}
            </Text>
          </View>

          {grepInput?.path && (
            <View className="gap-1">
              <Text
                className="font-semibold uppercase text-stone-400"
                style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
                Path
              </Text>
              <Text
                className="text-stone-500 dark:text-stone-400"
                style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
                {grepInput.path}
              </Text>
            </View>
          )}

          {grepInput?.include && (
            <View className="gap-1">
              <Text
                className="font-semibold uppercase text-stone-400"
                style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
                Include
              </Text>
              <Text
                className="text-stone-500 dark:text-stone-400"
                style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
                {grepInput.include}
              </Text>
            </View>
          )}
        </>
      )}

      {toolName === 'glob' && (
        <>
          <View className="gap-1">
            <Text
              className="font-semibold uppercase text-stone-400"
              style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
              Pattern
            </Text>
            <Text
              className="text-stone-700 dark:text-stone-300"
              style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
              {globInput?.pattern || 'Unknown'}
            </Text>
          </View>

          {globInput?.path && (
            <View className="gap-1">
              <Text
                className="font-semibold uppercase text-stone-400"
                style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
                Path
              </Text>
              <Text
                className="text-stone-500 dark:text-stone-400"
                style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
                {globInput.path}
              </Text>
            </View>
          )}
        </>
      )}

      {toolName === 'list' && (
        <View className="gap-1">
          <Text
            className="font-semibold uppercase text-stone-400"
            style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
            Path
          </Text>
          <Text
            className="text-stone-700 dark:text-stone-300"
            style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
            {listInput?.path || 'Unknown'}
          </Text>
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
          <View className="flex-row items-center justify-between">
            <Text
              className="font-semibold uppercase text-stone-400"
              style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
              Results
            </Text>
            {hasResults && (
              <Text className="text-stone-400" style={{ fontFamily: 'JetBrains Mono', fontSize: fs.label }}>
                {results.length} {results.length === 1 ? 'match' : 'matches'}
              </Text>
            )}
          </View>
          <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled>
            {hasResults ? (
              results.map((line, idx) => (
                <Text
                  key={idx}
                  className="text-stone-600 dark:text-stone-400"
                  style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
                  {line}
                </Text>
              ))
            ) : (
              <Text
                className="italic text-stone-400"
                style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
                {output || 'No results'}
              </Text>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

export { SearchToolCollapsed, SearchToolExpanded };
