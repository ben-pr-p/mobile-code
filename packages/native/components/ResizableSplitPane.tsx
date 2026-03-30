import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useColorScheme } from 'nativewind';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const MIN_RATIO = 0.25;
const MAX_RATIO = 0.75;
const DEFAULT_RATIO = 0.5;
const HANDLE_WIDTH = 12;

const SPRING_CONFIG = { damping: 20, stiffness: 300, mass: 0.6 };

/** Horizontally resizable split pane driven by a pan-gesture drag handle. */
export function ResizableSplitPane({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const { colorScheme } = useColorScheme();

  // Ratio of left panel width to total container width (0 – 1).
  const ratio = useSharedValue(DEFAULT_RATIO);
  const startRatio = useSharedValue(DEFAULT_RATIO);
  const isDragging = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startRatio.value = ratio.value;
      isDragging.value = true;
    })
    .onUpdate((e) => {
      'worklet';
      const delta = e.translationX / windowWidth;
      ratio.value = Math.min(MAX_RATIO, Math.max(MIN_RATIO, startRatio.value + delta));
    })
    .onEnd(() => {
      'worklet';
      isDragging.value = false;
    });

  const leftStyle = useAnimatedStyle(() => ({
    width: ratio.value * windowWidth - HANDLE_WIDTH / 2,
  }));

  const rightStyle = useAnimatedStyle(() => ({
    width: (1 - ratio.value) * windowWidth - HANDLE_WIDTH / 2,
  }));

  const handleStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: withSpring(isDragging.value ? 1.5 : 1, SPRING_CONFIG) }],
  }));

  const borderColor = colorScheme === 'dark' ? '#292524' : '#e7e5e4'; // stone-800 / stone-200

  return (
    <View className="flex-1 flex-row">
      {/* Left panel */}
      <Animated.View style={leftStyle} className="overflow-hidden">
        {left}
      </Animated.View>

      {/* Drag handle */}
      <GestureDetector gesture={panGesture}>
        <View
          style={{ width: HANDLE_WIDTH, borderLeftWidth: 1, borderRightWidth: 1, borderColor }}
          className="items-center justify-center bg-stone-100 dark:bg-stone-900">
          <Animated.View
            style={handleStyle}
            className="h-8 w-1 rounded-full bg-stone-400 dark:bg-stone-600"
          />
        </View>
      </GestureDetector>

      {/* Right panel */}
      <Animated.View style={rightStyle} className="overflow-hidden">
        {right}
      </Animated.View>
    </View>
  );
}
