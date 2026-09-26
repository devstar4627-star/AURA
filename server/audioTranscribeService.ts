/**
 * AURA (Autonomous Urgent Response Agent) - Audio Transcription Service
 * =====================================================================
 * 
 * Feature Description & Architecture:
 * This module provides high-accuracy server-side audio transcription powered by
 * Google GenAI's dedicated `gemini-3.5-transcribe` model. It allows callers and
 * dispatchers to capture live raw audio streams or recorded voice notes directly
 * from browser microphones across any spoken language without pre-configuring
 * speech recognition language codes.
 * 
 * Key Capabilities & Architecture:
 * 1. Native Audio Transcription via `gemini-3.5-transcribe`:
 *    - Ingests raw audio payloads (WebM, WAV, MP3, OGG, or PCM) passed as base64.
 *    - Executes `generateContent` using the dedicated transcription model.
 *    - Transcribes frantic, breathless, and chaotic 911 caller utterances verbatim,
 *      preserving original non-English vocabulary, distress cries, and addresses.
 * 
 * 2. Automated Multilingual Speech Detection:
 *    - Unlike standard browser STT (which fails when configured for English but spoken to in Spanish),
 *      `gemini-3.5-transcribe` natively understands dozens of world languages (Spanish,
 *      French, German, Vietnamese, Mandarin, Hindi, Arabic, Tagalog, Ukrainian, Japanese, etc.).
 *    - Transcribes the spoken audio in its original language, enabling seamless downstream
 *      language auto-detection and same-language AI responses.
 * 
 * 3. Telemetry & Auditing:
 *    - Logs function calls and GenAI invocations with model parameters, safely stripping
 *      inline raw audio payloads to prevent log bloat.
 * 
 * Use Cases:
 * - Direct microphone voice input when browser SpeechRecognition lacks permissions or language support.
 * - Multi-language emergency voice transcription.
 * - Ambient background noise and distressed audio transcription.
 */

import { GoogleGenAI } from "@google/genai";
import { AURA_CONFIG } from "../src/config/auraConfig.ts";

export interface AudioTranscriptionResult {
  transcript: string;
  model: string;
  mimeType: string;
  durationEstimateSeconds?: number;
  success: boolean;
  error?: string;
}

/**
 * Transcribes audio data using the dedicated `gemini-3.5-transcribe` model.
 * 
 * @param ai GoogleGenAI client instance.
 * @param audioBase64 Base64-encoded raw audio string.
 * @param mimeType Audio MIME type (e.g. 'audio/webm', 'audio/wav', 'audio/mp3').
 * @returns AudioTranscriptionResult containing the verbatim transcript.
 */
export async function transcribeAudioWithGemini(
  ai: GoogleGenAI,
  audioBase64: string,
  mimeType: string = "audio/webm"
): Promise<AudioTranscriptionResult> {
  const modelName = AURA_CONFIG.transcribeAiModel;
  console.info(`[AUDIO TRANSCRIBE] transcribeAudioWithGemini called with mimeType="${mimeType}", payloadLength=${audioBase64?.length || 0}`);

  if (!audioBase64 || typeof audioBase64 !== "string") {
    console.warn("[AUDIO TRANSCRIBE WARNING] Invalid or empty audioBase64 payload.");
    return {
      transcript: "",
      model: modelName,
      mimeType,
      success: false,
      error: "Audio payload is required."
    };
  }

  // Clean data URL prefix if present
  let cleanBase64 = audioBase64;
  if (cleanBase64.includes(";base64,")) {
    const parts = cleanBase64.split(";base64,");
    cleanBase64 = parts[1];
  }

  const promptText = "Transcribe this audio verbatim in its original spoken language. Detect and accurately transcribe whatever language is spoken, including panicked or emotional cries, street names, and room numbers. Do not summarize or translate; return only the exact transcription.";

  // Log GenAI call parameters, stripping inline binary data
  console.info(`[GENAI CALL] Model: ${modelName} | Parameters:`, {
    model: modelName,
    mimeType,
    prompt: promptText,
    dataSizeChars: cleanBase64.length,
    inlineDataStripped: true
  });

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64
            }
          },
          {
            text: promptText
          }
        ]
      }
    });

    const transcript = (response.text || "").trim();
    console.info(`[GENAI RESPONSE] Model: ${modelName} | Output length: ${transcript.length} chars | Transcript: "${transcript.substring(0, 100)}..."`);

    return {
      transcript,
      model: modelName,
      mimeType,
      success: true
    };
  } catch (err: any) {
    console.error(`[AUDIO TRANSCRIBE ERROR] Failed to transcribe audio with model ${modelName}:`, err);
    return {
      transcript: "",
      model: modelName,
      mimeType,
      success: false,
      error: err.message || "Failed to transcribe audio."
    };
  }
}
