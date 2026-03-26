import { useRef, useState, useCallback } from 'react'
import { Audio } from 'expo-av'
import type { LineSelection } from '../state/line-selection'

export type RecordingState = 'idle' | 'recording'

/** A single recorded audio segment with the line annotation captured at recording time. */
export interface AudioChunk {
  id: string
  base64: string
  mimeType: string
  durationMs: number
  lineReference: LineSelection | null
}

interface UseChunkedAudioRecorderOptions {
  onSendChunks: (chunks: AudioChunk[]) => void
  /** Called after recording stops to restore audio session (e.g. for hands-free mode). */
  onRecordingComplete?: () => void
  /** Reads the current line selection at the moment a chunk is finalized. */
  getLineSelection: () => LineSelection | null
}

/**
 * Audio recorder that accumulates multiple recording chunks, each annotated
 * with the line selection active at recording time. Chunks are queued locally
 * and sent together when the user is ready.
 */
export function useChunkedAudioRecorder({
  onSendChunks,
  onRecordingComplete,
  getLineSelection,
}: UseChunkedAudioRecorderOptions) {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [chunks, setChunks] = useState<AudioChunk[]>([])
  const recordingRef = useRef<Audio.Recording | null>(null)
  const recordingStartedAtRef = useRef(0)
  const chunkIdCounter = useRef(0)

  const totalDurationMs = chunks.reduce((sum, c) => sum + c.durationMs, 0)

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
      console.error('[useChunkedAudioRecorder] startRecording failed:', err)
    }
  }, [])

  // Internal: finalize current recording into a chunk and return it.
  // Returns null if recording was too short or failed.
  const finalizeCurrentRecording = useCallback(async (): Promise<AudioChunk | null> => {
    const recording = recordingRef.current
    if (!recording) return null

    const duration = Date.now() - recordingStartedAtRef.current
    recordingRef.current = null
    setRecordingState('idle')

    try {
      await recording.stopAndUnloadAsync()
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false })

      // Discard recordings under 1 second — likely accidental
      if (duration < 1000) {
        console.log(`[useChunkedAudioRecorder] discarding short recording (${duration}ms)`)
        return null
      }

      const uri = recording.getURI()
      if (!uri) return null

      const response = await fetch(uri)
      const blob = await response.blob()
      const base64 = await blobToBase64(blob)

      const chunk: AudioChunk = {
        id: `chunk-${++chunkIdCounter.current}`,
        base64,
        mimeType: blob.type || 'audio/mp4',
        durationMs: duration,
        lineReference: getLineSelection(),
      }

      return chunk
    } catch (err) {
      console.error('[useChunkedAudioRecorder] finalizeCurrentRecording failed:', err)
      return null
    } finally {
      onRecordingComplete?.()
    }
  }, [getLineSelection, onRecordingComplete])

  /** Stop the current recording and add it to the chunk queue. Does NOT send. */
  const stopRecording = useCallback(async () => {
    const chunk = await finalizeCurrentRecording()
    if (chunk) {
      setChunks((prev) => [...prev, chunk])
    }
  }, [finalizeCurrentRecording])

  /** Stop the current recording (if any), add to queue, and send everything. */
  const sendRecording = useCallback(async () => {
    const chunk = await finalizeCurrentRecording()
    // Gather all chunks including the one just finalized
    setChunks((prev) => {
      const allChunks = chunk ? [...prev, chunk] : prev
      if (allChunks.length > 0) {
        onSendChunks(allChunks)
      }
      return []
    })
  }, [finalizeCurrentRecording, onSendChunks])

  /** Send all queued chunks (when not currently recording). */
  const sendChunks = useCallback(() => {
    setChunks((prev) => {
      if (prev.length > 0) {
        onSendChunks(prev)
      }
      return []
    })
  }, [onSendChunks])

  /** Discard the in-progress recording without touching the queue. */
  const cancelRecording = useCallback(async () => {
    const recording = recordingRef.current
    if (!recording) return

    recordingRef.current = null
    try {
      await recording.stopAndUnloadAsync()
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false })
    } catch (err) {
      console.error('[useChunkedAudioRecorder] cancelRecording failed:', err)
    }
    setRecordingState('idle')
    onRecordingComplete?.()
  }, [onRecordingComplete])

  /** Remove a specific chunk from the queue. */
  const discardChunk = useCallback((id: string) => {
    setChunks((prev) => prev.filter((c) => c.id !== id))
  }, [])

  /** Clear the entire chunk queue. */
  const discardAllChunks = useCallback(() => {
    setChunks([])
  }, [])

  return {
    recordingState,
    chunks,
    totalDurationMs,
    startRecording,
    stopRecording,
    sendRecording,
    cancelRecording,
    sendChunks,
    discardChunk,
    discardAllChunks,
  }
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
