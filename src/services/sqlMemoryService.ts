/**
 * AURA (Autonomous Urgent Response Agent) - SQL Memory & Context Client Service
 * ==============================================================================
 * 
 * Feature Description & Architecture:
 * This service manages communications between the frontend interactive simulator
 * and the backend persistent SQLite memory system.
 * 
 * Capabilities & Use Cases:
 * 1. Call Session Life-Cycle Management:
 *    - Automatically registers a new, isolated SQL session for each new 911 intake call.
 *    - Generates and synchronizes unique session identifiers across turns.
 * 2. Short-Term Memory Commit:
 *    - Persists every caller utterance, AI response, acoustic telemetry snapshot, and
 *      barge-in status into the SQLite `memory_turns` table in real time.
 * 3. Token Tracking & 20K Token Summarization Surveillance:
 *    - Monitors active session context length.
 *    - Reports whether the 20,000 token limit is approached or triggered.
 *    - Provides an immediate test trigger to verify context compression in the UI.
 * 4. Post-Call Session Audit & Inspection:
 *    - Fetches chronological memory turns and executive summaries for review.
 */

import { AURA_CONFIG } from "../config/auraConfig";

export interface SqlSessionData {
  id?: number;
  session_id: string;
  call_id: string;
  caller_language: string;
  caller_language_code: string;
  incident_type?: string;
  location?: string;
  status: string;
  summary?: string;
  token_count: number;
  is_summarized: number;
  created_at: string;
  updated_at: string;
}

export interface SqlMemoryTurnData {
  id?: number;
  session_id: string;
  turn_index: number;
  speaker: "CALLER" | "AURA" | "SYSTEM";
  text: string;
  english_translation?: string;
  tone_metrics_json?: string;
  intent?: string;
  is_barge_in: number;
  token_count: number;
  timestamp: string;
}

export interface SqlSummaryData {
  id?: number;
  session_id: string;
  summary_text: string;
  tokens_summarized: number;
  range_start_turn: number;
  range_end_turn: number;
  created_at: string;
}

export interface SessionDetailResponse {
  status: string;
  session: SqlSessionData;
  turns: SqlMemoryTurnData[];
  summaries: SqlSummaryData[];
}

/**
 * Initializes a new, isolated call session in the persistent SQL memory store.
 * 
 * @param callId Unique 911 Call Identifier (e.g. CALL-99124).
 * @param callerLanguage Caller's spoken language (e.g. English, Spanish).
 * @param callerLanguageCode 2-letter ISO language code (e.g. en, es).
 * @returns Promise resolving to the created SqlSessionData.
 */
export async function startNewCallSession(
  callId: string,
  callerLanguage: string = "English",
  callerLanguageCode: string = "en"
): Promise<SqlSessionData> {
  console.info(`[SQL MEMORY CLIENT] startNewCallSession: callId="${callId}", lang="${callerLanguage}" (${callerLanguageCode})`);
  try {
    const res = await fetch(AURA_CONFIG.apiEndpoints.memorySessionStart, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call_id: callId,
        caller_language: callerLanguage,
        caller_language_code: callerLanguageCode
      })
    });

    if (!res.ok) {
      throw new Error(`Failed to start SQL session: ${res.statusText}`);
    }

    const data = await res.json();
    console.info("[SQL MEMORY CLIENT] Session successfully created:", data.session.session_id);
    return data.session;
  } catch (err) {
    console.warn("[SQL MEMORY CLIENT] Backend session initialization failed, using local session state:", err);
    return {
      session_id: `SESSION-${callId}-${Date.now()}`,
      call_id: callId,
      caller_language: callerLanguage,
      caller_language_code: callerLanguageCode,
      status: "ACTIVE",
      token_count: 0,
      is_summarized: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }
}

/**
 * Appends a conversation turn to the session's short-term SQL memory store.
 * 
 * @param params Turn details to record.
 * @returns Promise resolving to recorded turn data and summarization trigger status.
 */
export async function recordMemoryTurn(params: {
  sessionId: string;
  speaker: "CALLER" | "AURA" | "SYSTEM";
  text: string;
  englishTranslation?: string;
  toneMetrics?: any;
  intent?: string;
  isBargeIn?: boolean;
}): Promise<{
  turn: SqlMemoryTurnData;
  sessionTokenCount: number;
  summarizationTriggered: boolean;
  summaryText?: string;
}> {
  console.info(`[SQL MEMORY CLIENT] recordMemoryTurn: session="${params.sessionId}", speaker="${params.speaker}", text="${params.text.substring(0, 30)}..."`);
  try {
    const res = await fetch(AURA_CONFIG.apiEndpoints.memoryAddTurn, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: params.sessionId,
        speaker: params.speaker,
        text: params.text,
        english_translation: params.englishTranslation,
        tone_metrics: params.toneMetrics,
        intent: params.intent,
        is_barge_in: params.isBargeIn
      })
    });

    if (!res.ok) {
      throw new Error(`Failed to record memory turn: ${res.statusText}`);
    }

    const data = await res.json();
    return {
      turn: data.turn,
      sessionTokenCount: data.sessionTokenCount,
      summarizationTriggered: Boolean(data.summarization?.triggered),
      summaryText: data.summarization?.summaryText
    };
  } catch (err) {
    console.warn("[SQL MEMORY CLIENT] Failed to record turn to backend SQL:", err);
    return {
      turn: {
        session_id: params.sessionId,
        turn_index: 1,
        speaker: params.speaker,
        text: params.text,
        english_translation: params.englishTranslation,
        is_barge_in: params.isBargeIn ? 1 : 0,
        token_count: Math.ceil(params.text.length / 4),
        timestamp: new Date().toISOString()
      },
      sessionTokenCount: Math.ceil(params.text.length / 4),
      summarizationTriggered: false
    };
  }
}

/**
 * Retrieves the full transcript, summaries, and metadata for a specific call session.
 * 
 * @param sessionId The unique session ID string.
 * @returns Promise resolving to SessionDetailResponse.
 */
export async function fetchSessionDetails(sessionId: string): Promise<SessionDetailResponse | null> {
  console.info(`[SQL MEMORY CLIENT] fetchSessionDetails: sessionId="${sessionId}"`);
  try {
    const res = await fetch(`${AURA_CONFIG.apiEndpoints.memorySessionDetail}/${encodeURIComponent(sessionId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn("[SQL MEMORY CLIENT] Error fetching session details:", err);
    return null;
  }
}

/**
 * Lists past call sessions stored in the persistent database.
 * 
 * @returns Promise resolving to an array of SqlSessionData.
 */
export async function fetchSessionList(): Promise<SqlSessionData[]> {
  console.info("[SQL MEMORY CLIENT] fetchSessionList called.");
  try {
    const res = await fetch(AURA_CONFIG.apiEndpoints.memorySessions);
    if (!res.ok) return [];
    const data = await res.json();
    return data.sessions || [];
  } catch (err) {
    console.warn("[SQL MEMORY CLIENT] Error fetching sessions:", err);
    return [];
  }
}

/**
 * Manually or test-triggers the Summarization Middleware for the active session.
 * 
 * @param sessionId The session identifier.
 * @param force Whether to force summarization regardless of token count.
 * @returns Promise resolving to the summarization outcome.
 */
export async function triggerSessionSummarization(sessionId: string, force: boolean = true): Promise<any> {
  console.info(`[SQL MEMORY CLIENT] triggerSessionSummarization: sessionId="${sessionId}", force=${force}`);
  try {
    const res = await fetch(AURA_CONFIG.apiEndpoints.memorySummarize, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        force
      })
    });
    if (!res.ok) throw new Error(`Summarization request failed: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn("[SQL MEMORY CLIENT] Error triggering summarization:", err);
    return { triggered: false, reason: String(err) };
  }
}
