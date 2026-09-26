/**
 * AURA (Autonomous Urgent Response Agent) - Backend Memory Manager Engine
 * =======================================================================
 * 
 * Feature Description & Architecture:
 * This module defines the `MemoryManager` class and its child `CallSessionStore`
 * class. It fulfills the core architectural requirement of short-term session
 * storage backed by SQLite, ensuring every emergency 911 call receives a dedicated,
 * fully-isolated session store with automatic 20K-token summarization middleware.
 * 
 * Key Capabilities & Architecture:
 * 1. Dedicated Per-Call Session Store (`CallSessionStore`):
 *    - Each incoming 911 call (keyed by `callId` or `sessionId`) obtains a dedicated
 *      `CallSessionStore` instance.
 *    - Guarantees isolation across concurrent callers: turns, token accounting,
 *      and tactical state from one call never collide with another.
 *    - Short-term conversation history is committed to SQLite (`sessions`, `memory_turns`)
 *      with atomic WAL persistence.
 * 
 * 2. Automated 20K-Token Context Summarization Middleware:
 *    - The session store continuously computes and aggregates token counts.
 *    - When the context length reaches the 20,000 token threshold (or user-configured
 *      test threshold in `AURA_CONFIG.memory.contextTokenLimit`), the middleware triggers.
 *    - Distills older turns into an Executive Incident Summary via Gemini 3.8 Flash,
 *      preserving critical addresses, hazard types, casualty counts, and survival orders.
 *    - Retains only the most recent active dialogue turns alongside the distilled
 *      summary, optimizing the context window for sub-second LLM inference.
 * 
 * 3. Context Window Optimization for LLM Inference:
 *    - `getContextForPrompt()` generates the optimal prompt payload:
 *      [Distilled Executive Summary] + [Latest N Active Turns], keeping prompt size
 *      far below model limits while preserving 100% tactical situational awareness.
 * 
 * Use Cases:
 * - High-stress 911 calls running 40+ turns without memory overflow.
 * - Multi-incident dispatch centers running parallel callers.
 * - Immediate audit retrieval and real-time bidirectional WebSocket syncing.
 */

import type { DatabaseSync } from "node:sqlite";
import { GoogleGenAI } from "@google/genai";
import { AURA_CONFIG } from "../src/config/auraConfig.ts";
import {
  getSqlMemoryDb,
  estimateTokens,
  createSession,
  getSession,
  getLatestSessionByCallId,
  listSessions,
  addMemoryTurn,
  getSessionTurns,
  updateSessionMetadata,
  recordSessionSummary,
  getSessionSummaries
} from "./sqlMemoryDatabase.ts";
import type {
  SessionRecord,
  MemoryTurnRecord,
  SummaryRecord
} from "./sqlMemoryDatabase.ts";
import { checkAndExecuteSummarizationMiddleware } from "./summarizationMiddleware.ts";
import type { SummarizationResult } from "./summarizationMiddleware.ts";

/**
 * Dedicated Session Store for an individual emergency call.
 * Encapsulates short-term SQLite memory persistence, token tracking,
 * and 20K-token summarization middleware triggers.
 */
export class CallSessionStore {
  public readonly callId: string;
  public readonly sessionId: string;
  private db: DatabaseSync;
  private aiClient: GoogleGenAI;
  private tokenThreshold: number;
  private recentTurnsToKeep: number;

  /**
   * Initializes a dedicated session store for an individual 911 call.
   * 
   * @param sessionRecord The initialized or retrieved session record.
   * @param ai GoogleGenAI client for summarization.
   * @param customThreshold Optional custom token threshold for testing (defaults to 20,000).
   */
  constructor(
    sessionRecord: SessionRecord,
    ai: GoogleGenAI,
    customThreshold: number = AURA_CONFIG.memory.contextTokenLimit
  ) {
    console.info(`[CALL SESSION STORE] Initializing dedicated store for callId="${sessionRecord.call_id}", sessionId="${sessionRecord.session_id}"`);
    this.callId = sessionRecord.call_id;
    this.sessionId = sessionRecord.session_id;
    this.db = getSqlMemoryDb();
    this.aiClient = ai;
    this.tokenThreshold = customThreshold;
    this.recentTurnsToKeep = AURA_CONFIG.memory.recentTurnsToKeepAfterSummarization;
  }

  /**
   * Retrieves the current snapshot of the session record from SQLite.
   * 
   * @returns Current SessionRecord or null if deleted.
   */
  public getSessionRecord(): SessionRecord | null {
    console.info(`[CALL SESSION STORE] getSessionRecord called for session="${this.sessionId}"`);
    return getSession(this.sessionId);
  }

  /**
   * Retrieves all chronological conversation turns recorded for this call.
   * 
   * @returns Array of MemoryTurnRecord.
   */
  public getTurns(): MemoryTurnRecord[] {
    console.info(`[CALL SESSION STORE] getTurns called for session="${this.sessionId}"`);
    return getSessionTurns(this.sessionId);
  }

  /**
   * Retrieves all executive summaries generated for this call.
   * 
   * @returns Array of SummaryRecord.
   */
  public getSummaries(): SummaryRecord[] {
    console.info(`[CALL SESSION STORE] getSummaries called for session="${this.sessionId}"`);
    return getSessionSummaries(this.sessionId);
  }

  /**
   * Returns the current aggregate token count for this session.
   * 
   * @returns Number of tokens in active context.
   */
  public getTokenCount(): number {
    console.info(`[CALL SESSION STORE] getTokenCount called for session="${this.sessionId}"`);
    const session = getSession(this.sessionId);
    return session ? session.token_count : 0;
  }

  /**
   * Appends an interaction turn to the dedicated session's short-term SQLite memory.
   * Automatically executes the 20K-token summarization middleware if the context
   * threshold is reached or exceeded.
   * 
   * @param turn Turn details (speaker, text, translations, acoustic tone, barge-in flag).
   * @returns Object containing the created turn, updated token count, and summarization outcome.
   */
  public async addTurn(turn: {
    speaker: "CALLER" | "AURA" | "SYSTEM";
    text: string;
    englishTranslation?: string;
    toneMetrics?: any;
    intent?: string;
    isBargeIn?: boolean;
  }): Promise<{
    turn: MemoryTurnRecord;
    currentTokenCount: number;
    summarization: SummarizationResult;
  }> {
    console.info(`[CALL SESSION STORE] addTurn called on session="${this.sessionId}" | Speaker: ${turn.speaker} | Text: "${turn.text.substring(0, 40)}..."`);
    
    // 1. Commit turn to SQLite
    const turnRecord = addMemoryTurn({
      sessionId: this.sessionId,
      speaker: turn.speaker,
      text: turn.text,
      englishTranslation: turn.englishTranslation,
      toneMetrics: turn.toneMetrics,
      intent: turn.intent,
      isBargeIn: turn.isBargeIn
    });

    // 2. Check 20K token summarization trigger
    const summarization = await this.checkSummarizationMiddleware();

    // 3. Retrieve latest session state
    const currentTokens = this.getTokenCount();

    return {
      turn: turnRecord,
      currentTokenCount: currentTokens,
      summarization
    };
  }

  /**
   * Checks whether the current session token count meets or exceeds the 20K threshold
   * and triggers the summarization middleware if appropriate.
   * 
   * @param force Whether to force summarization regardless of token count.
   * @returns SummarizationResult describing whether compression took place.
   */
  public async checkSummarizationMiddleware(force: boolean = false): Promise<SummarizationResult> {
    console.info(`[CALL SESSION STORE] checkSummarizationMiddleware called for session="${this.sessionId}" (force=${force}, threshold=${this.tokenThreshold})`);
    return await checkAndExecuteSummarizationMiddleware(this.aiClient, this.sessionId, {
      force,
      customThreshold: this.tokenThreshold
    });
  }

  /**
   * Formats an optimized context representation tailored for LLM prompt generation.
   * Combines the distilled executive summary (if present) with only the most recent
   * short-term turns, keeping context window consumption minimal.
   * 
   * @returns Object containing executiveSummary, recentTurns, and estimatedPromptTokens.
   */
  public getContextForPrompt(): {
    executiveSummary: string | null;
    recentTurns: Array<{ speaker: string; text: string; english?: string }>;
    totalTokens: number;
  } {
    console.info(`[CALL SESSION STORE] getContextForPrompt called for session="${this.sessionId}"`);
    const session = getSession(this.sessionId);
    const turns = getSessionTurns(this.sessionId);

    const recentTurns = turns.slice(-this.recentTurnsToKeep).map((t) => ({
      speaker: t.speaker,
      text: t.text,
      english: t.english_translation
    }));

    return {
      executiveSummary: session?.summary || null,
      recentTurns,
      totalTokens: session?.token_count || 0
    };
  }

  /**
   * Updates metadata on the session record (such as language, location, incident type, status).
   * 
   * @param updates Key-value updates.
   */
  public updateMetadata(updates: Partial<SessionRecord>): void {
    console.info(`[CALL SESSION STORE] updateMetadata called for session="${this.sessionId}" with keys:`, Object.keys(updates));
    updateSessionMetadata(this.sessionId, updates);
  }

  /**
   * Retrieves operational telemetry metrics for this call session store.
   * 
   * @returns Status object including turns count, token count, summary status, and threshold.
   */
  public getStats(): {
    callId: string;
    sessionId: string;
    turnsCount: number;
    tokenCount: number;
    tokenThreshold: number;
    isSummarized: boolean;
    hasActiveSummary: boolean;
  } {
    console.info(`[CALL SESSION STORE] getStats called for session="${this.sessionId}"`);
    const session = getSession(this.sessionId);
    const turns = getSessionTurns(this.sessionId);
    return {
      callId: this.callId,
      sessionId: this.sessionId,
      turnsCount: turns.length,
      tokenCount: session?.token_count || 0,
      tokenThreshold: this.tokenThreshold,
      isSummarized: Boolean(session?.is_summarized),
      hasActiveSummary: Boolean(session?.summary)
    };
  }
}

/**
 * Backend Memory Manager Class
 * ============================
 * Manages dedicated SQLite session stores across concurrent calls.
 * Ensures each incoming 911 call obtains an isolated `CallSessionStore` instance
 * and coordinates persistent SQLite lifecycle and summarization policies.
 */
export class MemoryManager {
  private static instance: MemoryManager | null = null;
  private dedicatedStores: Map<string, CallSessionStore> = new Map();
  private aiClient: GoogleGenAI;

  /**
   * Private constructor enforcing singleton or scoped instance initialization.
   * 
   * @param aiClient GoogleGenAI client for cognitive middleware operations.
   */
  constructor(aiClient: GoogleGenAI) {
    console.info("[MEMORY MANAGER] MemoryManager instance created with SQLite backend.");
    this.aiClient = aiClient;
    // Pre-initialize database tables and indices
    getSqlMemoryDb();
  }

  /**
   * Returns or initializes the shared MemoryManager singleton instance.
   * 
   * @param aiClient GoogleGenAI client instance.
   * @returns Shared MemoryManager.
   */
  public static getInstance(aiClient: GoogleGenAI): MemoryManager {
    console.info("[MEMORY MANAGER] getInstance called.");
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager(aiClient);
    }
    return MemoryManager.instance;
  }

  /**
   * Creates a new dedicated session store for a specific 911 call.
   * 
   * @param callId Unique 911 call identifier.
   * @param callerLanguage Spoken caller language (e.g. Spanish, English).
   * @param callerLanguageCode 2-letter ISO code.
   * @param customThreshold Optional custom token threshold.
   * @returns Dedicated CallSessionStore instance.
   */
  public createSessionStore(
    callId: string,
    callerLanguage: string = "English",
    callerLanguageCode: string = "en",
    customThreshold?: number
  ): CallSessionStore {
    console.info(`[MEMORY MANAGER] createSessionStore: callId="${callId}", language="${callerLanguage}" (${callerLanguageCode})`);
    
    // Create new session in SQLite
    const record = createSession(callId, callerLanguage, callerLanguageCode);
    const store = new CallSessionStore(record, this.aiClient, customThreshold);

    // Register in active stores cache mapped by both callId and sessionId
    this.dedicatedStores.set(record.session_id, store);
    this.dedicatedStores.set(callId, store);

    console.info(`[MEMORY MANAGER] Dedicated session store created for callId="${callId}", sessionId="${record.session_id}". Active stores: ${this.dedicatedStores.size}`);
    return store;
  }

  /**
   * Retrieves an existing dedicated session store by callId or sessionId.
   * If not cached in memory, rehydrates the store from persistent SQLite.
   * 
   * @param id The call_id or session_id.
   * @returns Dedicated CallSessionStore or null if not found.
   */
  public getSessionStore(id: string): CallSessionStore | null {
    console.info(`[MEMORY MANAGER] getSessionStore called for id="${id}"`);
    if (this.dedicatedStores.has(id)) {
      return this.dedicatedStores.get(id)!;
    }

    // Attempt lookup by session_id in SQLite
    let session = getSession(id);

    // Attempt lookup by call_id in SQLite
    if (!session) {
      session = getLatestSessionByCallId(id);
    }

    if (!session) {
      console.info(`[MEMORY MANAGER] Session not found in SQLite for id="${id}"`);
      return null;
    }

    const store = new CallSessionStore(session, this.aiClient);
    this.dedicatedStores.set(session.session_id, store);
    this.dedicatedStores.set(session.call_id, store);
    return store;
  }

  /**
   * Retrieves an existing session store or creates a dedicated new one if none exists.
   * Guarantees that every call receives a dedicated session store.
   * 
   * @param callId Unique 911 Call Identifier.
   * @param callerLanguage Spoken caller language.
   * @param callerLanguageCode 2-letter ISO code.
   * @param customThreshold Optional custom token threshold.
   * @returns Dedicated CallSessionStore instance.
   */
  public getOrCreateSessionStore(
    callId: string,
    callerLanguage: string = "English",
    callerLanguageCode: string = "en",
    customThreshold?: number
  ): CallSessionStore {
    console.info(`[MEMORY MANAGER] getOrCreateSessionStore called for callId="${callId}"`);
    const existing = this.getSessionStore(callId);
    if (existing) {
      return existing;
    }
    return this.createSessionStore(callId, callerLanguage, callerLanguageCode, customThreshold);
  }

  /**
   * Lists past emergency call sessions stored in SQLite.
   * 
   * @param limit Maximum sessions to return.
   * @returns Array of SessionRecord.
   */
  public listAllSessions(limit: number = 50): SessionRecord[] {
    console.info(`[MEMORY MANAGER] listAllSessions called with limit=${limit}`);
    return listSessions(limit);
  }

  /**
   * Triggers the 20K summarization middleware for a given session.
   * 
   * @param id Call ID or Session ID.
   * @param force Force compression regardless of token count.
   * @returns SummarizationResult.
   */
  public async triggerSummarization(id: string, force: boolean = true): Promise<SummarizationResult> {
    console.info(`[MEMORY MANAGER] triggerSummarization called for id="${id}", force=${force}`);
    const store = this.getSessionStore(id);
    if (!store) {
      return {
        triggered: false,
        reason: `Session not found for id: ${id}`,
        previousTokenCount: 0,
        newTokenCount: 0,
        tokensSummarized: 0
      };
    }
    return await store.checkSummarizationMiddleware(force);
  }

  /**
   * Returns telemetry stats for all active dedicated stores.
   * 
   * @returns Array of store stats.
   */
  public getActiveStoresStats(): Array<ReturnType<CallSessionStore["getStats"]>> {
    console.info(`[MEMORY MANAGER] getActiveStoresStats called. Active stores count: ${this.dedicatedStores.size}`);
    const seen = new Set<string>();
    const stats: Array<ReturnType<CallSessionStore["getStats"]>> = [];

    for (const store of this.dedicatedStores.values()) {
      if (!seen.has(store.sessionId)) {
        seen.add(store.sessionId);
        stats.push(store.getStats());
      }
    }
    return stats;
  }
}
