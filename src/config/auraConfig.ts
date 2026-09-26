/**
 * AURA (Autonomous Urgent Response Agent) - Centralized Frontend Configuration
 * ===========================================================================
 * 
 * This module groups all configurable parameters, model identifiers, API routes,
 * tactical color tokens, audio thresholds, and default values used across the
 * AURA Crisis Dispatch Co-Pilot frontend mission-control command center.
 * 
 * Use Cases:
 * 1. Centralized reference to the Gemini Live AI model ('gemini-3.8-live').
 * 2. Real-time audio streaming parameters (16kHz PCM intake, 24kHz playback).
 * 3. Paralinguistic panic threshold definitions (1-10 severity scale).
 * 4. API endpoints for WebSocket raw audio and Server-Sent Events (SSE).
 */

export interface AuraSystemConfig {
  aiModel: string;
  intakeAiModel: string;
  transcribeAiModel: string;
  framework: string;
  defaultVoice: string;
  speechSynthesis: {
    enabled: boolean;
    rate: number;
    pitch: number;
    volume: number;
    preferredVoiceNames: string[];
  };
  audio: {
    micInputSampleRate: number;
    playbackSampleRate: number;
    bargeInThresholdDb: number;
    screamThresholdDb: number;
    bargeInCutoffLatencyMs: number;
  };
  panicScale: {
    min: number;
    max: number;
    criticalThreshold: number;
    highThreshold: number;
  };
  apiEndpoints: {
    sseDashboard: string;
    wsAudioBase: string;
    wsBidirectional: string;
    audioTranscribe: string;
    recentIncidents: string;
    manualDispatch: string;
    chatIntake: string;
    memorySessionStart: string;
    memorySessions: string;
    memorySessionDetail: string;
    memoryAddTurn: string;
    memorySummarize: string;
  };
  memory: {
    dbFilePath: string;
    contextTokenLimit: number; // 20,000 tokens default summarization threshold
    recentTurnsToKeepAfterSummarization: number;
    testSummarizeThreshold: number; // Option to test summarization with smaller token threshold
    avgCharsPerToken: number;
  };
  telemetry: {
    targetNotifyLatencyMs: number;
    maxFeedHistory: number;
  };
}

export const AURA_CONFIG: AuraSystemConfig = {
  aiModel: "gemini-3.8-live",
  intakeAiModel: "gemini-3.8-flash",
  transcribeAiModel: "gemini-3.5-transcribe",
  framework: "google-adk",
  defaultVoice: "Aoede",
  speechSynthesis: {
    enabled: true,
    rate: 0.95, // Measured, steady calm delivery for 911 intake
    pitch: 1.0,
    volume: 1.0,
    preferredVoiceNames: ["Google US English", "Samantha", "Victoria", "Karen", "en-US"],
  },
  audio: {
    micInputSampleRate: 16000,
    playbackSampleRate: 24000,
    bargeInThresholdDb: 42.0,
    screamThresholdDb: 80.0,
    bargeInCutoffLatencyMs: 38,
  },
  panicScale: {
    min: 1,
    max: 10,
    criticalThreshold: 8,
    highThreshold: 5,
  },
  apiEndpoints: {
    sseDashboard: "/api/events/dashboard",
    wsAudioBase: "/ws/audio",
    wsBidirectional: "/ws/call",
    audioTranscribe: "/api/audio/transcribe",
    recentIncidents: "/api/incidents",
    manualDispatch: "/api/dispatch",
    chatIntake: "/api/chat/intake",
    memorySessionStart: "/api/memory/session/start",
    memorySessions: "/api/memory/sessions",
    memorySessionDetail: "/api/memory/session",
    memoryAddTurn: "/api/memory/turn",
    memorySummarize: "/api/memory/summarize",
  },
  memory: {
    dbFilePath: "./db/aura_memory.sqlite",
    contextTokenLimit: 20000, // 20K tokens summarization middleware trigger
    recentTurnsToKeepAfterSummarization: 6,
    testSummarizeThreshold: 800, // Allows testing summarization behavior quickly in UI
    avgCharsPerToken: 4,
  },
  telemetry: {
    targetNotifyLatencyMs: 1.2,
    maxFeedHistory: 50,
  },
};
