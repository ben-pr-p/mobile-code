import React from 'react';
import { View, Text, ScrollView, Linking, Pressable } from 'react-native';
import type { ToolCallProps } from './types';
import { useCodeFontSize } from '../../hooks/useFontSize';

interface WebFetchInput {
  url: string;
  format?: 'markdown' | 'text' | 'html';
}

interface WebSearchInput {
  query: string;
  numResults?: number;
}

interface CodeSearchInput {
  query: string;
  tokensNum?: number;
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname + parsed.pathname;
  } catch {
    return url;
  }
}

function WebToolCollapsed({ description, toolName, toolMeta }: ToolCallProps) {
  const webfetchInput = toolMeta.input as WebFetchInput | undefined;
  const websearchInput = toolMeta.input as WebSearchInput | undefined;
  const codesearchInput = toolMeta.input as CodeSearchInput | undefined;
  const fs = useCodeFontSize();

  let displayText = description;
  if (toolName === 'webfetch' && webfetchInput?.url) {
    displayText = extractDomain(webfetchInput.url);
  } else if (toolName === 'websearch' && websearchInput?.query) {
    displayText = websearchInput.query;
  } else if (toolName === 'codesearch' && codesearchInput?.query) {
    displayText = codesearchInput.query;
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

function WebToolExpanded({ toolName, toolMeta }: ToolCallProps) {
  const webfetchInput = toolMeta.input as WebFetchInput | undefined;
  const websearchInput = toolMeta.input as WebSearchInput | undefined;
  const codesearchInput = toolMeta.input as CodeSearchInput | undefined;
  const output = toolMeta.output || '';
  const error = toolMeta.error;
  const fs = useCodeFontSize();

  const handleUrlPress = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  if (toolName === 'webfetch') {
    return (
      <View className="gap-3">
        <View className="gap-1">
          <Text
            className="font-semibold uppercase text-stone-400"
            style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
            URL
          </Text>
          <Pressable onPress={() => webfetchInput?.url && handleUrlPress(webfetchInput.url)}>
            <Text
              className="text-blue-600 underline dark:text-blue-400"
              style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
              {webfetchInput?.url || 'Unknown URL'}
            </Text>
          </Pressable>
        </View>

        {webfetchInput?.format && (
          <View className="gap-1">
            <Text
            className="font-semibold uppercase text-stone-400"
            style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
            Format
            </Text>
            <Text
              className="text-stone-500 dark:text-stone-400"
              style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
              {webfetchInput.format}
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
          <Text
            className="font-semibold uppercase text-stone-400"
            style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
            Content
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

  if (toolName === 'websearch' || toolName === 'codesearch') {
    const input = toolName === 'websearch' ? websearchInput : codesearchInput;
    const query = input?.query || '';

    return (
      <View className="gap-3">
        <View className="gap-1">
          <Text
            className="font-semibold uppercase text-stone-400"
            style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
            Query
          </Text>
          <Text
            className="text-stone-700 dark:text-stone-300"
            style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
            {query}
          </Text>
        </View>

        {websearchInput?.numResults && (
          <View className="gap-1">
            <Text
            className="font-semibold uppercase text-stone-400"
            style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
            Max Results
            </Text>
            <Text
              className="text-stone-500 dark:text-stone-400"
              style={{ fontFamily: 'JetBrains Mono', fontSize: fs.body }}>
              {websearchInput.numResults}
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
          <Text
            className="font-semibold uppercase text-stone-400"
            style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1, fontSize: fs.label }}>
            Results
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

  return (
    <View className="gap-3">
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
            Output
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

export { WebToolCollapsed, WebToolExpanded };
