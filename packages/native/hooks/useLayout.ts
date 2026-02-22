import { Platform, useWindowDimensions } from 'react-native'

export interface LayoutInfo {
  /** True when on iPad in landscape orientation */
  isTabletLandscape: boolean
  /** True when on iPad (any orientation) */
  isTablet: boolean
  /** True when landscape (any device) */
  isLandscape: boolean
  /** Current window width */
  width: number
  /** Current window height */
  height: number
}

/**
 * Reactive layout hook that detects iPad + landscape orientation.
 * Uses useWindowDimensions so it updates automatically on rotation.
 */
export function useLayout(): LayoutInfo {
  const { width, height } = useWindowDimensions()
  const isTablet = Platform.OS === 'ios' && (Platform as any).isPad === true
  const isLandscape = width > height

  return {
    isTabletLandscape: isTablet && isLandscape,
    isTablet,
    isLandscape,
    width,
    height,
  }
}
