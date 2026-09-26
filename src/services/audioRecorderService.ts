/**
 * AURA (Autonomous Urgent Response Agent) - Microphone Audio Recording & Transcription Service
 * ===========================================================================================
 * 
 * Feature Description & Architecture:
 * This service provides browser-level microphone audio recording via the standard HTML5
 * `MediaRecorder` API and handles transmission to the backend `gemini-3.5-transcribe`
 * endpoint (`/api/audio/transcribe`).
 * 
 * Key Capabilities & Architecture:
 * 1. Native Audio Recording:
 *    - Captures high-fidelity raw audio (16kHz-48kHz) from user microphone.
 *    - Encodes chunks into lightweight WebM or MP4 audio blobs without external codecs.
 * 
 * 2. Dedicated `gemini-3.5-transcribe` Cloud Transcription:
 *    - Converts recorded audio blob to base64 and posts to `/api/audio/transcribe`.
 *    - Transcribes the speech in its native language with emotional inflection,
 *      eliminating the need to select manual STT language dropdowns.
 * 
 * 3. Direct Seamless Handoff:
 *    - The resulting transcript is handed directly to `processCallerUtteranceOnline`
 *      or the bidirectional WebSocket, where `gemini-3.8-flash` auto-detects the voice
 *      and formulates an immediate response in that exact same language!
 * 
 * Use Cases:
 * - Hands-free microphone emergency reporting in any world language.
 * - Mobile browsers where SpeechRecognition is unavailable or unreliable.
 * - High-noise emergency audio intake.
 */

import { AURA_CONFIG } from "../config/auraConfig";

export interface AudioRecordingState {
  isRecording: boolean;
  durationMs: number;
  audioBlob: Blob | null;
  mimeType: string;
}

export type RecordingStateCallback = (state: AudioRecordingState) => void;

/**
 * Service for recording raw microphone audio in the browser and transcribing with Gemini.
 */
export class AudioRecorderService {
  private static instance: AudioRecorderService | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private mediaStream: MediaStream | null = null;
  private startTime: number = 0;
  private durationInterval: any = null;
  private stateCallbacks: Set<RecordingStateCallback> = new Set();
  private currentState: AudioRecordingState = {
    isRecording: false,
    durationMs: 0,
    audioBlob: null,
    mimeType: "audio/webm"
  };

  /**
   * Private constructor for singleton pattern.
   */
  private constructor() {
    console.info("[AUDIO RECORDER] AudioRecorderService instance created.");
  }

  /**
   * Returns the shared singleton instance of AudioRecorderService.
   * 
   * @returns Shared AudioRecorderService instance.
   */
  public static getInstance(): AudioRecorderService {
    console.info("[AUDIO RECORDER] getInstance called.");
    if (!AudioRecorderService.instance) {
      AudioRecorderService.instance = new AudioRecorderService();
    }
    return AudioRecorderService.instance;
  }

  /**
   * Checks if audio recording via MediaRecorder is supported by the browser.
   * 
   * @returns boolean.
   */
  public isSupported(): boolean {
    return typeof window !== "undefined" &&
      !!navigator.mediaDevices &&
      !!navigator.mediaDevices.getUserMedia &&
      typeof MediaRecorder !== "undefined";
  }

  /**
   * Starts microphone recording.
   * 
   * @returns Promise resolving to boolean indicating whether recording started.
   */
  public async startRecording(): Promise<boolean> {
    console.info("[AUDIO RECORDER] startRecording requested.");

    if (!this.isSupported()) {
      console.warn("[AUDIO RECORDER WARNING] MediaRecorder not supported in this browser environment.");
      return false;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      this.audioChunks = [];
      const supportedMimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4"
      ];

      let selectedMimeType = "audio/webm";
      for (const mime of supportedMimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMimeType = mime;
          break;
        }
      }

      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: selectedMimeType
      });

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100); // 100ms timeslices for smooth chunking
      this.startTime = Date.now();

      this.updateState({
        isRecording: true,
        durationMs: 0,
        audioBlob: null,
        mimeType: selectedMimeType
      });

      this.durationInterval = setInterval(() => {
        const elapsed = Date.now() - this.startTime;
        this.updateState({
          ...this.currentState,
          durationMs: elapsed
        });
      }, 200);

      console.info(`[AUDIO RECORDER] Recording started with MIME type: ${selectedMimeType}`);
      return true;
    } catch (err) {
      console.error("[AUDIO RECORDER ERROR] Failed to access microphone:", err);
      return false;
    }
  }

  /**
   * Stops microphone recording, returns the encoded audio blob, and terminates the media stream.
   * 
   * @returns Promise resolving to the recorded audio Blob.
   */
  public stopRecording(): Promise<Blob | null> {
    console.info("[AUDIO RECORDER] stopRecording requested.");

    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
        this.cleanup();
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || "audio/webm";
        const finalBlob = new Blob(this.audioChunks, { type: mimeType });
        console.info(`[AUDIO RECORDER] Recording stopped. Total size: ${finalBlob.size} bytes, MIME: ${mimeType}`);

        this.cleanup();
        this.updateState({
          isRecording: false,
          durationMs: Date.now() - this.startTime,
          audioBlob: finalBlob,
          mimeType
        });

        resolve(finalBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Cancels active recording without producing a blob.
   */
  public cancelRecording(): void {
    console.info("[AUDIO RECORDER] cancelRecording requested.");
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    this.cleanup();
    this.updateState({
      isRecording: false,
      durationMs: 0,
      audioBlob: null,
      mimeType: "audio/webm"
    });
  }

  /**
   * Converts an audio Blob into a base64-encoded string.
   * 
   * @param blob The audio Blob.
   * @returns Promise resolving to base64 string.
   */
  public async blobToBase64(blob: Blob): Promise<string> {
    console.info(`[AUDIO RECORDER] blobToBase64 converting ${blob.size} bytes.`);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Transcribes an audio blob using the backend `gemini-3.5-transcribe` endpoint.
   * 
   * @param blob The recorded audio Blob.
   * @returns Promise resolving to the transcribed text.
   */
  public async transcribeBlob(blob: Blob): Promise<string> {
    console.info(`[AUDIO RECORDER] transcribeBlob sending to ${AURA_CONFIG.apiEndpoints.audioTranscribe} (model: ${AURA_CONFIG.transcribeAiModel})`);
    const base64 = await this.blobToBase64(blob);

    const res = await fetch(AURA_CONFIG.apiEndpoints.audioTranscribe, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioBase64: base64,
        mimeType: blob.type || "audio/webm"
      })
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Transcription failed with HTTP ${res.status}`);
    }

    const data = await res.json();
    console.info(`[AUDIO RECORDER] Transcription received: "${data.transcript}" (Model: ${data.model})`);
    return data.transcript || "";
  }

  /**
   * Subscribes a listener to recording state changes.
   * 
   * @param callback Callback receiving state updates.
   * @returns Unsubscribe function.
   */
  public onStateChange(callback: RecordingStateCallback): () => void {
    this.stateCallbacks.add(callback);
    callback(this.currentState);
    return () => {
      this.stateCallbacks.delete(callback);
    };
  }

  /**
   * Updates state and notifies registered listeners.
   */
  private updateState(newState: AudioRecordingState): void {
    this.currentState = newState;
    for (const cb of this.stateCallbacks) {
      cb(this.currentState);
    }
  }

  /**
   * Stops stream tracks and clears intervals.
   */
  private cleanup(): void {
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }
}

export const audioRecorderService = AudioRecorderService.getInstance();
