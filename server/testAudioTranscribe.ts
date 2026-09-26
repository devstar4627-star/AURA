/**
 * AURA - Verify Audio Transcription via gemini-3.5-transcribe
 * ============================================================
 */

import { transcribeAudioWithGemini } from "./audioTranscribeService.ts";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build'
    }
  }
});

// A minimal valid 1-second 16kHz mono 16-bit PCM WAV base64 string (silent / acoustic tone)
function createMinimalWavBase64(): string {
  const sampleRate = 16000;
  const numSamples = 16000;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // RIFF identifier
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + numSamples * 2, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // fmt subchunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // 16 for PCM
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  // data subchunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, numSamples * 2, true);

  return Buffer.from(buffer).toString("base64");
}

async function runTest() {
  console.log("Testing gemini-3.5-transcribe with audio payload...");
  const wavBase64 = createMinimalWavBase64();
  const result = await transcribeAudioWithGemini(ai, wavBase64, "audio/wav");
  console.log("Transcription result:", {
    success: result.success,
    model: result.model,
    transcript: result.transcript,
    error: result.error
  });
}

runTest().catch(console.error);
