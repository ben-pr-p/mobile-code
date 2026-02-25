import { useRef, useState, useCallback } from 'react'
import { Audio } from 'expo-av'

export type RecordingState = 'idle' | 'recording'

interface UseAudioRecorderOptions {
  onSendAudio: (base64: string, mimeType: string) => void
}

export function useAudioRecorder({ onSendAudio }: UseAudioRecorderOptions) {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const recordingRef = useRef<Audio.Recording | null>(null)
  const recordingStartedAtRef = useRef(0)

  const startRecording = useCallback(async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync()
      if (!granted) return

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      })

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      )
      recordingRef.current = recording
      recordingStartedAtRef.current = Date.now()
      setRecordingState('recording')
    } catch (err) {
      console.error('[useAudioRecorder] startRecording failed:', err)
    }
  }, [])

  const stopRecording = useCallback(async () => {
    const recording = recordingRef.current
    if (!recording) return

    const duration = Date.now() - recordingStartedAtRef.current
    recordingRef.current = null
    setRecordingState('idle')

    try {
      await recording.stopAndUnloadAsync()
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false })

      // Discard recordings under 2 seconds — likely accidental
      if (duration < 2000) {
        console.log(`[useAudioRecorder] discarding short recording (${duration}ms)`)
        return
      }

      const uri = recording.getURI()
      if (!uri) return

      console.log('[useAudioRecorder] recording URI:', uri)

      // Read file as base64
      const response = await fetch(uri)
      const blob = await response.blob()
      console.log('[useAudioRecorder] blob size:', blob.size, 'type:', blob.type)

      const base64 = await blobToBase64(blob)
      console.log('[useAudioRecorder] base64 length:', base64.length, 'first 80 chars:', base64.slice(0, 80))

      // Fire and forget — caller handles the async work
      onSendAudio(base64, blob.type || 'audio/mp4')
    } catch (err) {
      console.error('[useAudioRecorder] stopRecording failed:', err)
    }
  }, [onSendAudio])

  const cancelRecording = useCallback(async () => {
    const recording = recordingRef.current
    if (!recording) return

    recordingRef.current = null
    try {
      await recording.stopAndUnloadAsync()
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false })
    } catch (err) {
      console.error('[useAudioRecorder] cancelRecording failed:', err)
    }
    setRecordingState('idle')
  }, [])

  return { recordingState, startRecording, stopRecording, cancelRecording }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result as string
      // Strip the data:...;base64, prefix
      const base64 = dataUrl.split(',')[1] ?? ''
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
