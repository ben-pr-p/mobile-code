import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { Shield } from 'lucide-react-native';
import type { PermissionRequestValue } from '../lib/stream-db';
import { getApi } from '../lib/api';

interface PermissionRequestBarProps {
  permission: PermissionRequestValue;
  backendUrl: string;
}

/**
 * Replaces VoiceInputArea when a permission request is pending.
 *
 * Shows the permission description and three action buttons: Reject, Once, Always.
 * Uses the same bottom safe-area padding as VoiceInputArea so the layout doesn't jump.
 */
export function PermissionRequestBar({ permission, backendUrl }: PermissionRequestBarProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [replyInFlight, setReplyInFlight] = useState<'once' | 'always' | 'reject' | null>(null);

  const api = getApi(backendUrl);

  const handleReply = useCallback(
    async (reply: 'once' | 'always' | 'reject') => {
      if (!api || replyInFlight) return;
      setReplyInFlight(reply);
      try {
        await api.permissions.reply({
          requestId: permission.requestId,
          sessionId: permission.sessionId,
          reply,
        });
      } catch (err) {
        console.error('[PermissionRequestBar] reply failed:', err);
      } finally {
        setReplyInFlight(null);
      }
    },
    [api, permission.requestId, replyInFlight]
  );

  const disabled = replyInFlight !== null;

  return (
    <View style={{ paddingBottom: insets.bottom + 4 }}>
      {/* Permission description row */}
      <View className="px-4 mb-3">
        <View className="flex-row items-center gap-2 bg-stone-100 dark:bg-stone-900 rounded-xl px-3.5 py-3">
          <Shield size={16} color={isDark ? '#A8A29E' : '#78716C'} />
          <Text
            className="flex-1 text-sm text-stone-700 dark:text-stone-300"
            style={{ fontFamily: 'JetBrains Mono' }}
            numberOfLines={2}
          >
            {permission.description}
          </Text>
        </View>
      </View>

      {/* Action buttons row */}
      <View className="flex-row items-center px-4 mb-2 gap-2">
        {/* Reject */}
        <Pressable
          onPress={() => handleReply('reject')}
          disabled={disabled}
          className="flex-1 h-11 rounded-xl items-center justify-center border"
          style={{
            borderColor: isDark ? '#57534E' : '#D6D3D1',
            backgroundColor: isDark ? '#1C1917' : '#FAFAF9',
            opacity: disabled && replyInFlight !== 'reject' ? 0.5 : 1,
          }}
        >
          {replyInFlight === 'reject' ? (
            <ActivityIndicator size="small" color={isDark ? '#A8A29E' : '#78716C'} />
          ) : (
            <Text
              className="text-xs font-semibold text-stone-500 dark:text-stone-400"
              style={{ fontFamily: 'JetBrains Mono' }}
            >
              Reject
            </Text>
          )}
        </Pressable>

        {/* Once — primary style */}
        <Pressable
          onPress={() => handleReply('once')}
          disabled={disabled}
          className="flex-1 h-11 rounded-xl items-center justify-center"
          style={{
            backgroundColor: '#F59E0B',
            opacity: disabled && replyInFlight !== 'once' ? 0.5 : 1,
          }}
        >
          {replyInFlight === 'once' ? (
            <ActivityIndicator size="small" color="#0C0A09" />
          ) : (
            <Text
              className="text-xs font-semibold"
              style={{ fontFamily: 'JetBrains Mono', color: '#0C0A09' }}
            >
              Once
            </Text>
          )}
        </Pressable>

        {/* Always — secondary outline style */}
        <Pressable
          onPress={() => handleReply('always')}
          disabled={disabled}
          className="flex-1 h-11 rounded-xl items-center justify-center border"
          style={{
            borderColor: '#F59E0B',
            backgroundColor: isDark ? '#1C1917' : '#FAFAF9',
            opacity: disabled && replyInFlight !== 'always' ? 0.5 : 1,
          }}
        >
          {replyInFlight === 'always' ? (
            <ActivityIndicator size="small" color="#F59E0B" />
          ) : (
            <Text
              className="text-xs font-semibold"
              style={{ fontFamily: 'JetBrains Mono', color: '#F59E0B' }}
            >
              Always
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
