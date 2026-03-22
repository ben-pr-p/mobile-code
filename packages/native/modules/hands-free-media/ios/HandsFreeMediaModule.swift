import ExpoModulesCore
import AVFoundation
import MediaPlayer
import CallKit
import os.log

private let logger = Logger(subsystem: "xyz.bprp.flockcode", category: "HandsFreeMedia")

// MARK: - CallKit Manager

/// Manages a fake CallKit "call" so the headphone button's HFP hang-up signal
/// is captured while the microphone is active.  Records audio via AVAudioEngine
/// and delivers the result as base64 back to the Expo module.
private class CallManager: NSObject, CXProviderDelegate {
  private let provider: CXProvider
  private let callController = CXCallController()
  private(set) var activeCallUUID: UUID?

  // AVAudioEngine recording state
  private var audioEngine: AVAudioEngine?
  private var recordingFile: AVAudioFile?
  private var recordingURL: URL?
  private var recordingStartedAt: Date?
  private var retryCount = 0
  private let maxRetries = 10

  /// Called when the CallKit call ends (headphone hang-up or programmatic end).
  /// Delivers (base64AudioData, mimeType, durationMs)? — nil if recording was
  /// too short or failed.
  var onCallEnded: (((String, String, Int))?) -> Void = { _ in }

  /// Called when the CallKit audio session is activated and recording starts.
  var onRecordingStarted: (() -> Void)?

  /// Called when the CallKit audio session is deactivated.
  var onAudioDeactivated: (() -> Void)?

  /// Called with diagnostic messages that should be surfaced to JS for debugging.
  var onDiagnostic: ((String) -> Void)?

  override init() {
    let config = CXProviderConfiguration()
    config.supportsVideo = false
    config.maximumCallsPerCallGroup = 1
    config.supportedHandleTypes = [.generic]
    // No ringtone — this is a silent "call"
    config.ringtoneSound = nil
    provider = CXProvider(configuration: config)
    super.init()
    provider.setDelegate(self, queue: nil)
  }

  func startCall() {
    let uuid = UUID()
    activeCallUUID = uuid
    let handle = CXHandle(type: .generic, value: "Recording")
    let action = CXStartCallAction(call: uuid, handle: handle)
    action.isVideo = false
    let transaction = CXTransaction(action: action)
    onDiagnostic?("CallKit: requesting startCall transaction for \(uuid.uuidString)")
    callController.request(transaction) { error in
      if let error = error {
        logger.error("startCall request failed: \(error.localizedDescription)")
        self.onDiagnostic?("CallKit: startCall FAILED — \(error.localizedDescription)")
        self.activeCallUUID = nil
      } else {
        logger.info("startCall request succeeded for \(uuid.uuidString)")
        self.onDiagnostic?("CallKit: startCall succeeded, reporting connected")
        // Mark the call as connected so the system knows it's an active call
        self.provider.reportOutgoingCall(with: uuid, connectedAt: nil)
      }
    }
  }

  func endCall() {
    guard let uuid = activeCallUUID else { return }
    let action = CXEndCallAction(call: uuid)
    let transaction = CXTransaction(action: action)
    callController.request(transaction) { error in
      if let error = error {
        logger.error("endCall request failed: \(error.localizedDescription)")
      }
    }
  }

  var hasActiveCall: Bool { activeCallUUID != nil }

  // MARK: CXProviderDelegate

  func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
    logger.info("CXStartCallAction — configuring audio for recording")
    onDiagnostic?("CallKit delegate: CXStartCallAction — fulfilling")
    // Audio session is managed by CallKit; we configure the engine in didActivate.
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    logger.info("CXEndCallAction — stopping recording")
    onDiagnostic?("CallKit delegate: CXEndCallAction — stopping recording")
    let result = stopRecording()
    activeCallUUID = nil
    onCallEnded(result)
    action.fulfill()
  }

  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    logger.info("didActivate audioSession — configuring for recording")
    onDiagnostic?("CallKit delegate: didActivate audioSession — category=\(audioSession.category.rawValue) mode=\(audioSession.mode.rawValue)")

    // CallKit activates the audio session but the category may still be
    // .playback.  Switch to .playAndRecord so the microphone input is
    // available and AVAudioEngine's inputNode reports a valid format.
    do {
      try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
      try audioSession.setActive(true)
      onDiagnostic?("CallKit delegate: reconfigured to .playAndRecord/.voiceChat, allowBluetooth")
    } catch {
      onDiagnostic?("CallKit delegate: failed to reconfigure audio session — \(error.localizedDescription)")
      logger.error("failed to reconfigure audio session: \(error.localizedDescription)")
    }

    retryCount = 0
    startRecording()
  }

  func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    logger.info("didDeactivate audioSession")
    onDiagnostic?("CallKit delegate: didDeactivate audioSession")
    onAudioDeactivated?()
  }

  func providerDidReset(_ provider: CXProvider) {
    logger.info("providerDidReset — cleaning up")
    onDiagnostic?("CallKit delegate: providerDidReset")
    _ = stopRecording()
    activeCallUUID = nil
  }

  // MARK: AVAudioEngine recording

  private func startRecording() {
    onDiagnostic?("startRecording: creating AVAudioEngine")

    let engine = AVAudioEngine()
    let inputNode = engine.inputNode
    let inputFormat = inputNode.outputFormat(forBus: 0)
    onDiagnostic?("startRecording: inputFormat sampleRate=\(inputFormat.sampleRate) channels=\(inputFormat.channelCount)")

    // Validate the format — a zero sample rate means the hardware isn't ready
    guard inputFormat.sampleRate > 0 && inputFormat.channelCount > 0 else {
      retryCount += 1
      guard retryCount <= maxRetries, activeCallUUID != nil else {
        onDiagnostic?("startRecording: giving up after \(retryCount) retries or call ended")
        logger.error("startRecording giving up — retries=\(self.retryCount) activeCall=\(self.activeCallUUID?.uuidString ?? "nil")")
        return
      }
      onDiagnostic?("startRecording: invalid format (sampleRate=\(inputFormat.sampleRate), channels=\(inputFormat.channelCount)) — retry \(retryCount)/\(maxRetries) in 0.3s")
      logger.warning("input format not ready, retry \(self.retryCount)/\(self.maxRetries)")
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
        self?.startRecording()
      }
      return
    }

    // Create a temporary file for the recording — use a standard PCM format
    // that AVAudioFile can always write to, regardless of the hardware format.
    let tempDir = FileManager.default.temporaryDirectory
    let fileName = "handsfree_\(UUID().uuidString).caf"
    let fileURL = tempDir.appendingPathComponent(fileName)

    let recordingFormat = AVAudioFormat(
      commonFormat: .pcmFormatFloat32,
      sampleRate: inputFormat.sampleRate,
      channels: inputFormat.channelCount,
      interleaved: false
    )

    guard let recordingFormat = recordingFormat else {
      onDiagnostic?("startRecording: could not create recording format")
      logger.error("could not create recording format")
      return
    }

    do {
      let file = try AVAudioFile(
        forWriting: fileURL,
        settings: recordingFormat.settings
      )
      recordingFile = file
      recordingURL = fileURL
      recordingStartedAt = Date()

      // Install tap using nil format to let the system choose the best match
      inputNode.installTap(onBus: 0, bufferSize: 4096, format: recordingFormat) { buffer, _ in
        do {
          try file.write(from: buffer)
        } catch {
          logger.error("failed to write audio buffer: \(error.localizedDescription)")
        }
      }

      try engine.start()
      audioEngine = engine
      onDiagnostic?("startRecording: AVAudioEngine started, recording to \(fileURL.lastPathComponent)")
      logger.info("AVAudioEngine started, recording to \(fileURL.lastPathComponent)")
      onRecordingStarted?()
    } catch {
      onDiagnostic?("startRecording: AVAudioEngine start failed — \(error.localizedDescription)")
      logger.error("failed to start AVAudioEngine: \(error.localizedDescription)")
      cleanup()
    }
  }

  /// Stops the audio engine and returns (base64, mimeType, durationMs) or nil.
  private func stopRecording() -> (String, String, Int)? {
    guard let engine = audioEngine else { return nil }

    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    audioEngine = nil

    guard let fileURL = recordingURL else {
      cleanup()
      return nil
    }

    // Calculate duration
    let durationMs: Int
    if let started = recordingStartedAt {
      durationMs = Int(Date().timeIntervalSince(started) * 1000)
    } else {
      durationMs = 0
    }

    recordingFile = nil
    recordingStartedAt = nil

    // Discard recordings under 2 seconds
    if durationMs < 2000 {
      logger.info("discarding short recording (\(durationMs)ms)")
      cleanup()
      return nil
    }

    // Read file and convert to base64
    do {
      let data = try Data(contentsOf: fileURL)
      let base64 = data.base64EncodedString()
      logger.info("recording complete: \(durationMs)ms, \(data.count) bytes")
      cleanup()
      return (base64, "audio/x-caf", durationMs)
    } catch {
      logger.error("failed to read recording file: \(error.localizedDescription)")
      cleanup()
      return nil
    }
  }

  private func cleanup() {
    if let url = recordingURL {
      try? FileManager.default.removeItem(at: url)
    }
    recordingFile = nil
    recordingURL = nil
    recordingStartedAt = nil
    audioEngine = nil
  }

  deinit {
    cleanup()
  }
}

// MARK: - Expo Module

public class HandsFreeMediaModule: Module {
  // Use AVPlayer instead of AVAudioPlayer.  The system can directly
  // pause/play an AVAudioPlayer without going through MPRemoteCommandCenter
  // handlers, which means our handlers never fire.  AVPlayer does NOT have
  // this problem — the system always routes through the registered command
  // handlers.
  private var avPlayer: AVPlayer?
  private var playerLooper: AVPlayerLooper?
  private var playerItem: AVPlayerItem?
  private var queuePlayer: AVQueuePlayer?
  private var isActive = false
  private var callManager: CallManager?

  public func definition() -> ModuleDefinition {
    Name("HandsFreeMedia")

    Events("onToggleRecording", "onRecordingStarted", "onRecordingStopped", "onDiagnostic")

    AsyncFunction("activate") { () -> [String: Any] in
      guard !self.isActive else {
        return ["status": "already_active"]
      }

      var log: [String] = []

      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, mode: .default, options: [])
      log.append("category set to .playback (no mixWithOthers)")
      try session.setActive(true)
      log.append("session activated")

      // Load the silent audio file and play it on loop via AVQueuePlayer +
      // AVPlayerLooper.  This makes us the "now playing" app so
      // MPRemoteCommandCenter handlers receive headphone button events.
      guard let url = Bundle.main.url(forResource: "silence", withExtension: "mp3") else {
        return ["status": "error", "error": "silence.mp3 not found in bundle", "log": log]
      }
      log.append("silence.mp3 found: \(url.lastPathComponent)")

      let asset = AVAsset(url: url)
      let item = AVPlayerItem(asset: asset)
      let player = AVQueuePlayer(items: [item])
      player.volume = 0.01
      // AVPlayerLooper seamlessly loops the item
      let looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(asset: asset))
      player.play()
      self.queuePlayer = player
      self.playerLooper = looper
      log.append("AVQueuePlayer + AVPlayerLooper started, loopCount=\(looper.loopCount)")

      DispatchQueue.main.async {
        UIApplication.shared.beginReceivingRemoteControlEvents()
      }
      log.append("beginReceivingRemoteControlEvents queued")

      // Register for remote control events (A2DP headphone button).
      //
      // With AVPlayer (not AVAudioPlayer), the system does NOT directly
      // control playback — it always routes through these handlers.
      let commandCenter = MPRemoteCommandCenter.shared()

      commandCenter.togglePlayPauseCommand.isEnabled = true
      commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
        logger.info("togglePlayPauseCommand received")
        guard let self = self else { return .commandFailed }
        self.handleHeadphoneButton(source: "togglePlayPause")
        return .success
      }

      commandCenter.playCommand.isEnabled = true
      commandCenter.playCommand.addTarget { [weak self] _ in
        logger.info("playCommand received")
        guard let self = self else { return .commandFailed }
        self.handleHeadphoneButton(source: "play")
        return .success
      }

      commandCenter.pauseCommand.isEnabled = true
      commandCenter.pauseCommand.addTarget { [weak self] _ in
        logger.info("pauseCommand received")
        guard let self = self else { return .commandFailed }
        self.handleHeadphoneButton(source: "pause")
        return .success
      }

      // Claim stop / next / prev so they don't leak to other apps
      commandCenter.stopCommand.isEnabled = true
      commandCenter.stopCommand.addTarget { _ in .success }
      commandCenter.nextTrackCommand.isEnabled = false
      commandCenter.previousTrackCommand.isEnabled = false
      log.append("remote commands registered")

      // Now-playing metadata
      var nowPlayingInfo = [String: Any]()
      nowPlayingInfo[MPMediaItemPropertyTitle] = "Hands-Free Mode"
      nowPlayingInfo[MPMediaItemPropertyArtist] = "flockcode"
      nowPlayingInfo[MPNowPlayingInfoPropertyIsLiveStream] = true
      nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = 1.0
      nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = 0
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
      log.append("now playing info set")

      // Initialize CallKit manager
      let manager = CallManager()
      manager.onCallEnded = { [weak self] result in
        self?.handleCallEnded(result: result)
      }
      manager.onRecordingStarted = { [weak self] in
        self?.sendEvent("onRecordingStarted", [:])
      }
      manager.onAudioDeactivated = { [weak self] in
        self?.restorePlayback()
      }
      manager.onDiagnostic = { [weak self] message in
        logger.info("diagnostic: \(message)")
        self?.sendEvent("onDiagnostic", ["message": message])
      }
      self.callManager = manager
      log.append("CallKit manager initialized")

      log.append("sessionCategory=\(session.category.rawValue) mode=\(session.mode.rawValue)")
      log.append("isOtherAudioPlaying=\(session.isOtherAudioPlaying)")

      self.isActive = true
      return ["status": "ok", "log": log]
    }

    AsyncFunction("restorePlaybackSession") { () -> Bool in
      guard self.isActive else { return false }
      return self.restorePlayback()
    }

    AsyncFunction("deactivate") { () -> Bool in
      logger.info("deactivating...")
      // End any active CallKit call first
      self.callManager?.endCall()
      self.tearDown()
      return true
    }

    OnDestroy {
      self.callManager?.endCall()
      self.tearDown()
    }
  }

  // MARK: Headphone button handling

  /// Called when the headphone button is pressed in A2DP (playback) mode.
  /// Starts a CallKit call which switches to HFP and begins recording.
  /// Does NOT emit onToggleRecording — the CallKit path uses its own events
  /// (onRecordingStarted / onRecordingStopped) so the JS side doesn't
  /// accidentally start an expo-av recording that would steal the audio session.
  private func handleHeadphoneButton(source: String) {
    logger.info("headphone button pressed (source: \(source))")
    sendEvent("onDiagnostic", ["message": "handleHeadphoneButton called, source=\(source), hasCallManager=\(callManager != nil), hasActiveCall=\(callManager?.hasActiveCall ?? false)"])

    guard let manager = callManager else {
      // No CallKit manager — fall back to JS-side toggle (expo-av recording)
      logger.info("no CallKit manager, falling back to onToggleRecording")
      sendEvent("onToggleRecording", ["source": source])
      return
    }

    if manager.hasActiveCall {
      // Shouldn't normally happen (in HFP mode, button goes through CallKit)
      // but handle it gracefully by ending the call
      logger.info("active call exists during A2DP button — ending call")
      sendEvent("onDiagnostic", ["message": "ending existing CallKit call"])
      manager.endCall()
    } else {
      // Start the CallKit call → will switch to HFP → recording begins.
      // CallKit manages the audio session; onRecordingStarted will fire
      // once AVAudioEngine is running.
      logger.info("starting CallKit call for recording")
      sendEvent("onDiagnostic", ["message": "pausing queuePlayer, starting CallKit call"])
      queuePlayer?.pause()
      manager.startCall()
    }
  }

  /// Called when the CallKit call ends (headphone hang-up or programmatic).
  private func handleCallEnded(result: (String, String, Int)?) {
    if let (base64, mimeType, durationMs) = result {
      logger.info("recording complete: \(durationMs)ms — sending to JS")
      sendEvent("onRecordingStopped", [
        "audioData": base64,
        "mimeType": mimeType,
        "durationMs": durationMs,
      ])
    } else {
      logger.info("recording ended with no usable audio")
      sendEvent("onRecordingStopped", [
        "audioData": NSNull(),
        "mimeType": "",
        "durationMs": 0,
      ])
    }
    // Playback restoration happens via onAudioDeactivated callback
  }

  // MARK: Playback session restoration

  /// Restores the .playback audio session and silent audio so the headphone
  /// button works again via A2DP / MPRemoteCommandCenter.
  @discardableResult
  private func restorePlayback() -> Bool {
    guard isActive else { return false }
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, mode: .default)
      try session.setActive(true)
      // Restart the queue player
      queuePlayer?.play()
      logger.info("playback session restored, player rate=\(self.queuePlayer?.rate ?? -1)")
      return true
    } catch {
      logger.error("failed to restore playback session: \(error.localizedDescription)")
      return false
    }
  }

  // MARK: Teardown

  private func tearDown() {
    guard isActive else { return }

    DispatchQueue.main.async {
      UIApplication.shared.endReceivingRemoteControlEvents()
    }

    let commandCenter = MPRemoteCommandCenter.shared()
    commandCenter.togglePlayPauseCommand.removeTarget(nil)
    commandCenter.playCommand.removeTarget(nil)
    commandCenter.pauseCommand.removeTarget(nil)
    commandCenter.stopCommand.removeTarget(nil)
    commandCenter.togglePlayPauseCommand.isEnabled = false
    commandCenter.playCommand.isEnabled = false
    commandCenter.pauseCommand.isEnabled = false
    commandCenter.stopCommand.isEnabled = false

    queuePlayer?.pause()
    queuePlayer = nil
    playerLooper = nil
    avPlayer = nil

    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil

    callManager = nil

    do {
      try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    } catch {
      logger.error("failed to deactivate audio session: \(error.localizedDescription)")
    }

    isActive = false
    logger.info("teardown complete")
  }
}
