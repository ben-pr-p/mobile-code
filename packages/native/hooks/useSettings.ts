import { useState } from 'react'
import {
  FIXTURE_SETTINGS,
  NOTIFICATION_SOUND_OPTIONS,
  type NotificationSound,
  type ConnectionInfo,
} from '../__fixtures__/settings'

// TODO: Replace with real Jotai atom reads/writes
// import { useAtom } from 'jotai'
// import { serverUrlAtom, handsFreeAutoRecordAtom, notificationSoundAtom } from '../state/settings'
// import { connectionStatusAtom, serverLatencyAtom } from '../state/connectivity'
//
// export function useSettings() {
//   const [serverUrl, setServerUrl] = useAtom(serverUrlAtom)
//   const [handsFreeAutoRecord, setHandsFreeAutoRecord] = useAtom(handsFreeAutoRecordAtom)
//   const [notificationSound, setNotificationSound] = useAtom(notificationSoundAtom)
//   const connectionStatus = useAtomValue(connectionStatusAtom)
//   const serverLatency = useAtomValue(serverLatencyAtom)
//   ...
// }

export function useSettings() {
  const [serverUrl, setServerUrl] = useState(FIXTURE_SETTINGS.serverUrl)
  const [handsFreeAutoRecord, setHandsFreeAutoRecord] = useState(
    FIXTURE_SETTINGS.handsFreeAutoRecord
  )
  const [notificationSound, setNotificationSound] = useState<NotificationSound>(
    FIXTURE_SETTINGS.notificationSound
  )

  // TODO: Replace with real connection monitoring from Jotai atoms
  const connection: ConnectionInfo = FIXTURE_SETTINGS.connection

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
