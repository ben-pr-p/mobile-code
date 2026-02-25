import { useEffect, useRef } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  serverUrlAtom,
  debouncedServerUrlAtom,
  handsFreeAutoRecordAtom,
  notificationSoundAtom,
  connectionInfoAtom,
} from '../state/settings'
import {
  FIXTURE_SETTINGS,
  NOTIFICATION_SOUND_OPTIONS,
} from '../__fixtures__/settings'
import { useServerHealth } from './useServerHealth'

const DEBOUNCE_MS = 1_000

export function useSettings() {
  const [serverUrl, setServerUrl] = useAtom(serverUrlAtom)
  const [handsFreeAutoRecord, setHandsFreeAutoRecord] = useAtom(handsFreeAutoRecordAtom)
  const [notificationSound, setNotificationSound] = useAtom(notificationSoundAtom)

  // Debounce serverUrl → debouncedServerUrlAtom so downstream consumers
  // (health check, API client) don't thrash on every keystroke.
  const setDebouncedUrl = useSetAtom(debouncedServerUrlAtom)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setDebouncedUrl(serverUrl)
    }, DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [serverUrl, setDebouncedUrl])

  const debouncedUrl = useAtomValue(debouncedServerUrlAtom)

  // Ping health endpoint using the debounced URL
  useServerHealth(debouncedUrl)
  const connection = useAtomValue(connectionInfoAtom)

  return {
    serverUrl,
    setServerUrl,
    connection,
    handsFreeAutoRecord,
    setHandsFreeAutoRecord,
    notificationSound,
    setNotificationSound,
    notificationSoundOptions: NOTIFICATION_SOUND_OPTIONS,
    appVersion: FIXTURE_SETTINGS.appVersion,
    defaultModel: FIXTURE_SETTINGS.defaultModel,
  }
}
