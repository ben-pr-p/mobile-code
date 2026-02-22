import { FIXTURE_TRACK, FIXTURE_PLAYBACK_POSITION, type TrackInfo } from '../__fixtures__/music'

// TODO: Replace with real Spotify SDK integration
// Wire to currentTrackAtom, isPlayingAtom, playbackPositionAtom, isLikedAtom
export function useMusicPlayer() {
  return {
    track: FIXTURE_TRACK as TrackInfo | null,
    isPlaying: false,
    isLiked: true,
    positionMs: FIXTURE_PLAYBACK_POSITION,
    onPlay: () => {},
    onPause: () => {},
    onNext: () => {},
    onPrevious: () => {},
    onToggleLike: () => {},
  }
}
