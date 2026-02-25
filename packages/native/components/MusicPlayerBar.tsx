import React from 'react'
import { View, Text, Pressable, Image } from 'react-native'
import { useColorScheme } from 'nativewind'

interface MusicPlayerBarProps {
  track: {
    name: string
    artist: string
    albumArtUri: string
    durationMs: number
  } | null
  isPlaying: boolean
  isLiked: boolean
  positionMs: number
  onPlay: () => void
  onPause: () => void
  onNext: () => void
  onPrevious: () => void
  onToggleLike: () => void
}

export function MusicPlayerBar({
  track,
  isPlaying,
  isLiked,
  positionMs,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onToggleLike,
}: MusicPlayerBarProps) {
  if (!track) return null

  const progress = track.durationMs > 0 ? (positionMs / track.durationMs) * 100 : 0

  return (
    <View className="gap-2.5 px-4 pt-3 pb-7 border-t border-stone-200 dark:border-stone-800">
      {/* Song row */}
      <View className="flex-row items-center gap-2.5">
        <Image
          source={{ uri: track.albumArtUri }}
          className="w-11 h-11 rounded-md"
        />
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-semibold text-stone-900 dark:text-stone-50" style={{ fontFamily: 'JetBrains Mono' }}>{track.name}</Text>
          <Text className="text-xs text-stone-500">{track.artist}</Text>
        </View>
        <Pressable onPress={onToggleLike} hitSlop={8}>
          <Text style={{ color: '#1DB954', fontSize: 18 }}>{isLiked ? '♥' : '♡'}</Text>
        </Pressable>
      </View>

      {/* Controls row */}
      <View className="flex-row items-center justify-center gap-5">
        <Pressable onPress={onPrevious} hitSlop={8}>
          <Text className="text-stone-700 dark:text-stone-400 text-lg">⏮</Text>
        </Pressable>
        <Pressable
          onPress={isPlaying ? onPause : onPlay}
          className="w-8 h-8 rounded-lg bg-[#1DB954] items-center justify-center"
        >
          <Text className="text-white text-sm">{isPlaying ? '⏸' : '▶'}</Text>
        </Pressable>
        <Pressable onPress={onNext} hitSlop={8}>
          <Text className="text-stone-700 dark:text-stone-400 text-lg">⏭</Text>
        </Pressable>
      </View>

      {/* Progress row */}
      <View className="flex-row items-center gap-2">
        <Text className="text-[10px] text-stone-500" style={{ fontFamily: 'JetBrains Mono' }}>
          {formatTime(positionMs)}
        </Text>
        <View className="flex-1 h-[3px] rounded-sm bg-stone-200 dark:bg-stone-800">
          <View
            className="h-[3px] rounded-sm bg-[#1DB954]"
            style={{ width: `${progress}%` }}
          />
        </View>
        <Text className="text-[10px] text-stone-500" style={{ fontFamily: 'JetBrains Mono' }}>
          {formatTime(track.durationMs)}
        </Text>
      </View>
    </View>
  )
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
