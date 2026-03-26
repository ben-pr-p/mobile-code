import { useEffect, useCallback, useRef } from 'react'
import { Alert } from 'react-native'
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import HandsFreeMedia from '../modules/hands-free-media'
import { handsFreeActiveAtom, nativeRecordingAtom, handsFreeModeAtom } from '../state/settings'
import type { RecordingState } from './useChunkedAudioRecorder'

/** Whether the native module is available in this binary. */
const isModuleAvailable = HandsFreeMedia != null

/** Result from the walking-mode voice prompt server endpoint. */
export type VoicePromptResult =
  | { action: 'forwarded' }
  | { action: 'responded'; text: string; audioData: string; mimeType: string }

/**
 * Bridges the native HandsFreeMedia module (with CallKit) to the app's
 * recording and audio-send flow.
 *
 * ## CallKit flow
 *
 * 1. Idle: audio session is `.playback`, headphone button events arrive via
 *    A2DP / `MPRemoteCommandCenter`.
 * 2. First headphone press: native module starts a CallKit "call", which
 *    switches Bluetooth to HFP and starts recording via `AVAudioEngine`.
 *    The hook receives `onRecordingStarted` and updates `recordingState`.
 * 3. Second headphone press (HFP hang-up): CallKit ends the call, native
 *    module stops recording and delivers base64 audio via `onRecordingStopped`.
 *    The hook calls `onSendAudio` with the audio data.
 * 4. The native module restores `.playback` automatically, ready for the
 *    next press.
 *
 * ## Walking mode
 *
 * When the hands-free mode is `'walking'`:
 * - Audio is routed through `onVoicePrompt` instead of `onSendAudio`.
 *   The server decides whether to forward to the agent or respond directly
 *   with TTS audio that gets played back.
 * - When the session transitions from `busy` to `idle`, a completion chime
 *   plays so the user knows the agent is done.
 *
 * The `onToggleRecording` event is still handled as a fallback for cases
 * where CallKit is unavailable.
 */
export function useHandsFreeMode(
  recordingState: RecordingState,
  startRecording: () => void,
  stopRecording: () => void,
  onSendAudio?: (base64: string, mimeType: string) => void,
  /**
   * Walking-mode voice prompt handler. Returns the routing result with an
   * audioUrl (relative path) that the native module can stream from.
   */
  onVoicePrompt?: (base64: string, mimeType: string) => Promise<VoicePromptResult>,
  /** Current session status for detecting busy→idle transitions. */
  sessionStatus?: 'idle' | 'busy' | 'error',
) {
  const [isActive, setIsActive] = useAtom(handsFreeActiveAtom)
  const handsFreeMode = useAtomValue(handsFreeModeAtom)

  // Use refs so event listeners always see the latest values without
  // needing to re-subscribe.
  const recordingStateRef = useRef(recordingState)
  recordingStateRef.current = recordingState

  const startRecordingRef = useRef(startRecording)
  startRecordingRef.current = startRecording

  const stopRecordingRef = useRef(stopRecording)
  stopRecordingRef.current = stopRecording

  const onSendAudioRef = useRef(onSendAudio)
  onSendAudioRef.current = onSendAudio

  const onVoicePromptRef = useRef(onVoicePrompt)
  onVoicePromptRef.current = onVoicePrompt

  const handsFreeModeRef = useRef(handsFreeMode)
  handsFreeModeRef.current = handsFreeMode

  const setIsNativeRecording = useSetAtom(nativeRecordingAtom)

  // Track previous session status for busy→idle transition detection
  const prevSessionStatusRef = useRef(sessionStatus)
  useEffect(() => {
    if (
      isActive &&
      isModuleAvailable &&
      handsFreeMode === 'walking' &&
      prevSessionStatusRef.current === 'busy' &&
      sessionStatus === 'idle'
    ) {
      // Agent just finished — play completion chime
      console.log('[HandsFree] walking mode: session went busy→idle, playing completion sound')
      HandsFreeMedia!.playSound('completion').catch((err: any) => {
        console.error('[HandsFree] playSound failed:', err)
      })
    }
    prevSessionStatusRef.current = sessionStatus
  }, [sessionStatus, isActive, handsFreeMode])

  // Subscribe to native events when active
  useEffect(() => {
    if (!isActive || !isModuleAvailable) return

    const subscriptions: { remove: () => void }[] = []

    // --- CallKit events (primary flow) ---

    // Native recording started (CallKit call active, AVAudioEngine running)
    subscriptions.push(
      HandsFreeMedia!.addListener('onRecordingStarted', () => {
        console.log('[HandsFree] onRecordingStarted — native recording active')
        setIsNativeRecording(true)
      }),
    )

    // Native recording stopped (CallKit call ended, audio delivered)
    subscriptions.push(
      HandsFreeMedia!.addListener('onRecordingStopped', (event) => {
        console.log(
          '[HandsFree] onRecordingStopped — audioData:',
          event?.audioData ? `${event.audioData.length} chars` : 'null',
          'duration:', event?.durationMs, 'ms',
        )
        setIsNativeRecording(false)

        if (!event?.audioData) return

        // Route audio based on current mode
        if (handsFreeModeRef.current === 'walking' && onVoicePromptRef.current) {
          // Walking mode: send through the voice-prompt endpoint
          console.log('[HandsFree] walking mode: routing audio through voice-prompt')
          onVoicePromptRef.current(event.audioData, event.mimeType)
            .then((result) => {
              console.log('[HandsFree] voice-prompt result:', result.action,
                result.action === 'responded' ? `audioData=${result.audioData?.length ?? 0} chars, mime=${result.mimeType}` : '')
              if (result.action === 'responded' && result.audioData) {
                // Play the TTS response audio
                console.log('[HandsFree] calling playAudioData...')
                HandsFreeMedia!.playAudioData(result.audioData, result.mimeType)
                  .then((ok: boolean) => {
                    console.log('[HandsFree] playAudioData returned:', ok)
                  })
                  .catch((err: any) => {
                    console.error('[HandsFree] playAudioData failed:', err)
                  })
              } else {
                console.log('[HandsFree] voice prompt forwarded to agent')
              }
            })
            .catch((err: any) => {
              console.error('[HandsFree] voice prompt failed:', err)
              // Fall back to normal send
              onSendAudioRef.current?.(event.audioData!, event.mimeType)
            })
        } else if (onSendAudioRef.current) {
          // Washing dishes mode (or no voice prompt handler): normal send
          onSendAudioRef.current(event.audioData, event.mimeType)
        }
      }),
    )

    // --- Diagnostics (surfaces os.log messages to Metro) ---
    subscriptions.push(
      HandsFreeMedia!.addListener('onDiagnostic', (event) => {
        console.log('[HandsFree:native]', event?.message)
      }),
    )

    // --- Legacy fallback (no CallKit) ---
    subscriptions.push(
      HandsFreeMedia!.addListener('onToggleRecording', (event) => {
        console.log(
          '[HandsFree] onToggleRecording (fallback), source:',
          event?.source,
          'state:',
          recordingStateRef.current,
        )
        if (recordingStateRef.current === 'recording') {
          stopRecordingRef.current()
        } else {
          startRecordingRef.current()
        }
      }),
    )

    console.log('[HandsFree] subscribed to native events (CallKit + fallback)')

    return () => {
      subscriptions.forEach((s) => s.remove())
    }
  }, [isActive])

  const activate = useCallback(async () => {
    if (!isModuleAvailable) {
      Alert.alert(
        'Hands-Free Unavailable',
        'Native build required. Rebuild the app with "bun run ios".',
      )
      return
    }
    try {
      console.log('[HandsFree] calling native activate()')
      const result = await HandsFreeMedia!.activate()
      console.log('[HandsFree] native activate() result:', JSON.stringify(result))
      if (result.status === 'ok' || result.status === 'already_active') {
        setIsActive(true)
      } else {
        Alert.alert('Hands-Free Failed', result.error ?? 'Unknown error')
      }
    } catch (err: any) {
      console.error('[useHandsFreeMode] activate failed:', err)
      Alert.alert(
        'Hands-Free Failed',
        err.message ?? 'Could not activate hands-free mode.',
      )
    }
  }, [setIsActive])

  const deactivate = useCallback(async () => {
    if (!isModuleAvailable) return
    try {
      await HandsFreeMedia!.deactivate()
      setIsNativeRecording(false)
      setIsActive(false)
    } catch (err: any) {
      console.error('[useHandsFreeMode] deactivate failed:', err)
      setIsActive(false)
    }
  }, [setIsActive])

  const toggle = useCallback(async () => {
    if (isActive) {
      await deactivate()
    } else {
      await activate()
    }
  }, [isActive, activate, deactivate])

  // Clean up on unmount — deactivate if still active
  useEffect(() => {
    return () => {
      if (isActive && isModuleAvailable) {
        HandsFreeMedia!.deactivate().catch(() => {})
      }
    }
    // Only run on unmount, not when isActive changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    isHandsFreeAvailable: isModuleAvailable,
    toggle,
    activate,
    deactivate,
  }
}
