import { atom } from 'jotai'
import type { TrackInfo } from '../__fixtures__/music'

export const currentTrackAtom = atom<TrackInfo | null>(null)
export const isPlayingAtom = atom(false)
export const playbackPositionAtom = atom(0)
export const isLikedAtom = atom(false)
