export type NotificationSound = 'chime' | 'bell' | 'ping' | 'none'

export interface ConnectionInfo {
  status: 'connected' | 'disconnected' | 'reconnecting'
  latencyMs: number | null
}

export interface SettingsData {
  serverUrl: string
  connection: ConnectionInfo
  handsFreeAutoRecord: boolean
  notificationSound: NotificationSound
  appVersion: string
  defaultModel: string
}

export const NOTIFICATION_SOUND_OPTIONS: { label: string; value: NotificationSound }[] = [
  { label: 'Chime (default)', value: 'chime' },
  { label: 'Bell', value: 'bell' },
  { label: 'Ping', value: 'ping' },
  { label: 'None', value: 'none' },
]

export const FIXTURE_SETTINGS: SettingsData = {
  serverUrl: 'https://api.opencode.dev',
  connection: {
    status: 'connected',
    latencyMs: 42,
  },
  handsFreeAutoRecord: true,
  notificationSound: 'chime',
  appVersion: '6.4.2-beta',
  defaultModel: 'claude-opus-4-6',
}
