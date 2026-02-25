import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import type { ChangedFile } from '../hooks/useChanges';
import { DiffWebView } from './DiffWebView';

interface ChangesViewProps {
  sessionId: string;
  changes: ChangedFile[];
}

const STATUS_LABEL: Record<ChangedFile['status'], string> = {
  added: 'A',
  deleted: 'D',
  modified: 'M',
};

const STATUS_COLOR: Record<ChangedFile['status'], string> = {
  added: 'text-oc-green',
  deleted: 'text-oc-red',
  modified: 'text-oc-accent',
};

function FileRow({
  file,
  isExpanded,
  onPress,
}: {
  file: ChangedFile;
  isExpanded: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3">
      <Text
        className="text-xs text-oc-text-muted"
        style={{ fontFamily: 'JetBrains Mono', width: 10 }}>
        {isExpanded ? '\u25BC' : '\u25B6'}
      </Text>
      <Text
        className={`text-xs font-bold ${STATUS_COLOR[file.status]}`}
        style={{ fontFamily: 'JetBrains Mono', width: 14 }}>
        {STATUS_LABEL[file.status]}
      </Text>
      <Text
        className="flex-1 text-xs text-oc-text-primary"
        style={{ fontFamily: 'JetBrains Mono' }}
        numberOfLines={1}>
        {file.path}
      </Text>
      <View className="flex-row items-center gap-2">
        {file.added > 0 && (
          <Text className="text-xs text-oc-green" style={{ fontFamily: 'JetBrains Mono' }}>
            +{file.added}
          </Text>
        )}
        {file.removed > 0 && (
          <Text className="text-xs text-oc-red" style={{ fontFamily: 'JetBrains Mono' }}>
            -{file.removed}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export function ChangesView({ sessionId, changes }: ChangesViewProps) {
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  const toggleFile = (path: string) => {
    setExpandedFile((prev) => (prev === path ? null : path));
  };

  const expandedChange = expandedFile ? changes.find((f) => f.path === expandedFile) : null;
  const isExpanded = !!expandedChange;

  const expandedIndex = expandedChange ? changes.indexOf(expandedChange) : -1;
  const changeBefore = expandedIndex > 0 ? changes[expandedIndex - 1] : null;
  const changeAfter =
    expandedIndex >= 0 && expandedIndex < changes.length - 1 ? changes[expandedIndex + 1] : null;

  return (
    <View className="flex-1">
      {/* Sticky file header — shown when a file is expanded */}
      {expandedChange && (
        <View className="border-b border-oc-divider px-4 py-3" style={{ gap: 12 }}>
          {changeBefore && (
            <FileRow
              file={changeBefore}
              isExpanded={false}
              onPress={() => toggleFile(changeBefore.path)}
            />
          )}
          <FileRow
            file={expandedChange}
            isExpanded
            onPress={() => toggleFile(expandedChange.path)}
          />
        </View>
      )}

      {/* File list — hidden when a file is expanded */}
      {!isExpanded && (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, gap: 12 }}
          showsVerticalScrollIndicator={false}>
          <Text className="text-xs text-oc-text-muted" style={{ fontFamily: 'JetBrains Mono' }}>
            {changes.length} file{changes.length !== 1 ? 's' : ''} changed
          </Text>

          {changes.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              isExpanded={false}
              onPress={() => toggleFile(file.path)}
            />
          ))}
        </ScrollView>
      )}

      {/* WebView — always mounted, flex-1 when visible, hidden when collapsed */}
      <View
        className={isExpanded ? 'flex-1' : ''}
        style={isExpanded ? undefined : { height: 0, overflow: 'hidden' }}>
        <DiffWebView sessionId={sessionId} activeFile={expandedChange?.path ?? null} />
      </View>

      {expandedChange && changeAfter && (
        <View className="border-t border-oc-divider px-4 py-3">
          <FileRow
            file={changeAfter}
            isExpanded={false}
            onPress={() => toggleFile(changeAfter.path)}
          />
        </View>
      )}
    </View>
  );
}
