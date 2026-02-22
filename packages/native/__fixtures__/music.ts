export interface TrackInfo {
  name: string
  artist: string
  albumArtUri: string
  durationMs: number
}

export const FIXTURE_TRACK: TrackInfo = {
  name: 'Neon Lights',
  artist: 'Daft Punk',
  albumArtUri: 'https://images.unsplash.com/photo-1674168531886-fa9806e241cf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=200',
  durationMs: 222000, // 3:42
}

export const FIXTURE_PLAYBACK_POSITION = 84000 // 1:24
