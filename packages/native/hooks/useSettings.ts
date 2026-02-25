import { useAtom, useAtomValue } from 'jotai'
import {
  serverUrlAtom,
  handsFreeAutoRecordAtom,
  notificationSoundAtom,
  connectionInfoAtom,
} from '../state/settings'
import {
  FIXTURE_SETTINGS,
  NOTIFICATION_SOUND_OPTIONS,
} from '../__fixtures__/settings'
import { useServerHealth } from './useServerHealth'

export function useSettings() {
  const [serverUrl, setServerUrl] = useAtom(serverUrlAtom)
  const [handsFreeAutoRecord, setHandsFreeAutoRecord] = useAtom(handsFreeAutoRecordAtom)
  const [notificationSound, setNotificationSound] = useAtom(notificationSoundAtom)

  // Ping health endpoint and write results to connectionInfoAtom
  useServerHealth(serverUrl)
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
