import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  Animated,
  ScrollView,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { Check, Search } from 'lucide-react-native';
import type { CatalogModel, ModelSelection } from '../state/settings';
import { useBackendStateQuery } from '../lib/merged-query';
import { collections } from '../lib/collections';
import type { BackendUrl } from '../state/backends';
import type { Message as ServerMessage } from '../../server/src/types';

/** A recently-used model entry with the timestamp of its last use. */
export type RecentModel = {
  modelID: string;
  providerID: string;
  lastUsedAt: number;
};

interface ModelSelectorSheetProps {
  visible: boolean;
  onClose: () => void;
  catalog: CatalogModel[] | null;
  selectedModel: ModelSelection | null;
  onSelectModel: (model: ModelSelection | null) => void;
  defaultModel: ModelSelection | null;
  backendUrl: BackendUrl;
}

export function ModelSelectorSheet({
  visible,
  onClose,
  catalog,
  selectedModel,
  onSelectModel,
  defaultModel,
  backendUrl,
}: ModelSelectorSheetProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const slideAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [searchQuery, setSearchQuery] = useState('');

  // Derive recently used models from all messages — only queries when the sheet is visible
  const { data: allRawMessages } = useBackendStateQuery<ServerMessage>(
    backendUrl,
    (q) => (visible ? q.from({ messages: collections.messages }) : null),
    [visible]
  );
  const recentModels: RecentModel[] = useMemo(() => {
    if (!allRawMessages) return [];
    const msgs = allRawMessages as ServerMessage[];
    const seen = new Map<string, RecentModel>();
    for (const m of msgs) {
      if (m.modelID && m.providerID) {
        const key = `${m.providerID}/${m.modelID}`;
        const existing = seen.get(key);
        if (!existing || m.createdAt > existing.lastUsedAt) {
          seen.set(key, {
            modelID: m.modelID,
            providerID: m.providerID,
            lastUsedAt: m.createdAt,
          });
        }
      }
    }
    return Array.from(seen.values())
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .slice(0, 5);
  }, [allRawMessages]);

  // Reset search when sheet opens/closes
  useEffect(() => {
    if (!visible) setSearchQuery('');
  }, [visible]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      slideAnim.setValue(0);
      backdropAnim.setValue(0);
    }
  }, [visible, slideAnim, backdropAnim]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  const handleSelect = (model: CatalogModel) => {
    onSelectModel({ providerID: model.providerID, modelID: model.id });
    handleClose();
  };

  const handleSelectDefault = () => {
    onSelectModel(null);
    handleClose();
  };

  const query = searchQuery.trim().toLowerCase();

  // Resolve recent model entries to full CatalogModel objects
  const recentCatalogModels = useMemo(() => {
    if (!recentModels || !catalog) return [];
    const result: CatalogModel[] = [];
    for (const r of recentModels) {
      const match = catalog.find((m) => m.id === r.modelID && m.providerID === r.providerID);
      if (match) result.push(match);
      if (result.length >= 5) break;
    }
    return result;
  }, [recentModels, catalog]);

  // Filter catalog by search query
  const filteredCatalog = useMemo(() => {
    if (!catalog) return null;
    if (!query) return catalog;
    return catalog.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query) ||
        m.providerName.toLowerCase().includes(query)
    );
  }, [catalog, query]);

  // Group filtered models by provider
  const grouped = useMemo(() => {
    if (!filteredCatalog) return [];
    const map = new Map<string, { providerName: string; models: CatalogModel[] }>();
    for (const model of filteredCatalog) {
      let group = map.get(model.providerID);
      if (!group) {
        group = { providerName: model.providerName, models: [] };
        map.set(model.providerID, group);
      }
      group.models.push(model);
    }
    return Array.from(map.entries()).map(([providerID, group]) => ({
      providerID,
      providerName: group.providerName,
      models: group.models,
    }));
  }, [filteredCatalog]);

  // Filter recent models by search query too
  const filteredRecent = useMemo(() => {
    if (!query) return recentCatalogModels;
    return recentCatalogModels.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query) ||
        m.providerName.toLowerCase().includes(query)
    );
  }, [recentCatalogModels, query]);

  const screenHeight = Dimensions.get('window').height;
  const sheetMaxHeight = screenHeight * 0.7;

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetMaxHeight, 0],
  });

  const placeholderColor = isDark ? '#57534E' : '#A8A29E';
  const searchIconColor = isDark ? '#57534E' : '#A8A29E';

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleClose}>
      {/* Backdrop */}
      <Animated.View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          opacity: backdropAnim,
          justifyContent: 'flex-end',
        }}>
        <Pressable style={{ flex: 1 }} onPress={handleClose} />

        {/* Sheet */}
        <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0}>
          <Animated.View
            style={{
              transform: [{ translateY }],
              maxHeight: sheetMaxHeight,
              backgroundColor: isDark ? '#1C1917' : '#FAFAF9',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              paddingBottom: insets.bottom + 8,
            }}>
            {/* Handle bar */}
            <View className="items-center pb-2 pt-3">
              <View
                className="h-1 w-9 rounded-full"
                style={{ backgroundColor: isDark ? '#44403C' : '#D6D3D1' }}
              />
            </View>

            {/* Header */}
            <View className="px-5 pb-3">
              <Text
                className="text-base font-semibold text-stone-900 dark:text-stone-50"
                style={{ fontFamily: 'JetBrains Mono' }}>
                Select Model
              </Text>
            </View>

            <ScrollView
              className="px-5"
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled">
              {/* Default option */}
              <ModelRow
                label="Server Default"
                subtitle={
                  defaultModel ? `${defaultModel.providerID}/${defaultModel.modelID}` : undefined
                }
                isSelected={!selectedModel}
                onPress={handleSelectDefault}
                isDark={isDark}
              />

              <View className="my-2 h-px bg-stone-200 dark:bg-stone-800" />

              {/* Recently Used section */}
              {filteredRecent.length > 0 && (
                <>
                  <SectionLabel text="RECENTLY USED" />
                  {filteredRecent.map((model) => {
                    const isSelected =
                      selectedModel?.modelID === model.id &&
                      selectedModel?.providerID === model.providerID;
                    return (
                      <ModelRow
                        key={`recent-${model.providerID}/${model.id}`}
                        label={model.name}
                        subtitle={model.providerName}
                        isSelected={isSelected}
                        onPress={() => handleSelect(model)}
                        isDark={isDark}
                      />
                    );
                  })}
                  <View className="my-2 h-px bg-stone-200 dark:bg-stone-800" />
                </>
              )}

              {/* Provider groups */}
              {grouped.map((group) => (
                <View key={group.providerID} className="mb-3">
                  <SectionLabel text={group.providerName.toUpperCase()} />
                  {group.models.map((model) => {
                    const isSelected =
                      selectedModel?.modelID === model.id &&
                      selectedModel?.providerID === model.providerID;
                    return (
                      <ModelRow
                        key={`${model.providerID}/${model.id}`}
                        label={model.name}
                        statusBadge={
                          model.status && model.status !== 'active' ? model.status : undefined
                        }
                        isSelected={isSelected}
                        onPress={() => handleSelect(model)}
                        isDark={isDark}
                      />
                    );
                  })}
                </View>
              ))}

              {/* Empty state */}
              {(!catalog || catalog.length === 0) && (
                <View className="items-center py-8">
                  <Text className="text-center text-sm text-stone-400 dark:text-stone-600">
                    {catalog === null ? 'Loading models...' : 'No models available'}
                  </Text>
                </View>
              )}

              {/* No search results */}
              {catalog &&
                catalog.length > 0 &&
                grouped.length === 0 &&
                filteredRecent.length === 0 &&
                query && (
                  <View className="items-center py-6">
                    <Text
                      className="text-center text-sm text-stone-400 dark:text-stone-600"
                      style={{ fontFamily: 'JetBrains Mono' }}>
                      No models matching "{searchQuery.trim()}"
                    </Text>
                  </View>
                )}
            </ScrollView>

            {/* Search bar — pinned at bottom */}
            <View className="px-5 pt-3">
              <View className="h-10 flex-row items-center gap-2 rounded-lg bg-stone-100 px-3 dark:bg-stone-900">
                <Search size={14} color={searchIconColor} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search models..."
                  placeholderTextColor={placeholderColor}
                  className="flex-1 py-0 text-xs text-stone-900 dark:text-stone-50"
                  style={{ fontFamily: 'JetBrains Mono' }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionLabel({ text }: { text: string }) {
  return (
    <Text
      className="mb-2 px-1 text-[10px] font-semibold text-stone-400 dark:text-stone-600"
      style={{ letterSpacing: 2, fontFamily: 'JetBrains Mono' }}>
      {text}
    </Text>
  );
}

function ModelRow({
  label,
  subtitle,
  statusBadge,
  isSelected,
  onPress,
  isDark,
}: {
  label: string;
  subtitle?: string;
  statusBadge?: string;
  isSelected: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-0.5 flex-row items-center justify-between rounded-lg px-3 py-2.5"
      style={{
        backgroundColor: isSelected ? (isDark ? '#292524' : '#F5F5F4') : 'transparent',
      }}>
      <View className="mr-3 flex-1">
        <Text
          className="text-sm text-stone-900 dark:text-stone-50"
          style={{ fontFamily: 'JetBrains Mono' }}>
          {label}
        </Text>
        {subtitle && (
          <Text
            className="mt-0.5 text-[10px] text-stone-500 dark:text-stone-500"
            style={{ fontFamily: 'JetBrains Mono' }}>
            {subtitle}
          </Text>
        )}
        {statusBadge && (
          <Text
            className="mt-0.5 text-[10px] text-stone-400 dark:text-stone-600"
            style={{ fontFamily: 'JetBrains Mono' }}>
            {statusBadge}
          </Text>
        )}
      </View>
      {isSelected && <Check size={16} color={isDark ? '#F59E0B' : '#D97706'} />}
    </Pressable>
  );
}
