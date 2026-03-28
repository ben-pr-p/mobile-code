import React from 'react';
import { useRouter } from 'expo-router';
import { SettingsScreen } from '../components/SettingsScreen';
import { useSettings } from '../hooks/useSettings';

/**
 * Settings modal route — presented as a modal overlay via expo-router.
 * Accessible from the sessions sidebar gear icon.
 */
export default function SettingsModal() {
  const router = useRouter();
  const settings = useSettings();

  return (
    <SettingsScreen
      connection={settings.connection}
      notificationSound={settings.notificationSound}
      onNotificationSoundChange={settings.setNotificationSound}
      notificationSoundOptions={settings.notificationSoundOptions}
      appVersion={settings.appVersion}
      onBack={() => router.back()}
    />
  );
}
