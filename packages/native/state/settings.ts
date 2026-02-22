import { atom } from 'jotai'
import type { NotificationSound } from '../__fixtures__/settings'

// TODO: Replace with atomWithStorage for AsyncStorage persistence
// import { atomWithStorage } from 'jotai/utils'
// import { asyncStorageAdapter } from '../lib/jotai-async-storage'
//
// export const serverUrlAtom = atomWithStorage('settings:serverUrl', 'https://api.opencode.dev', asyncStorageAdapter)
// export const handsFreeAutoRecordAtom = atomWithStorage('settings:handsFreeAutoRecord', true, asyncStorageAdapter)
// export const notificationSoundAtom = atomWithStorage('settings:notificationSound', 'chime', asyncStorageAdapter)

export const serverUrlAtom = atom('https://api.opencode.dev')
export const handsFreeAutoRecordAtom = atom(true)
export const notificationSoundAtom = atom<NotificationSound>('chime')
