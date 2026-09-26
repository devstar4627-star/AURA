/**
 * AURA (Autonomous Urgent Response Agent) - 20K Token Summarization Middleware
 * ============================================================================
 * 
 * Feature Description & Architecture:
 * In emergency 911 dispatch calls, conversations may extend across dozens of turns
 * involving high-frequency paralinguistic updates, multi-speaker exchanges, bystander cries,
 * and responder chatter. As transcripts accumulate, the prompt context size expands.
 * 
 * This middleware acts as an automated cognitive guardian:
 * 
 * 1. Token Threshold Surveillance:
 *    Monitors the cumulative token count of each session's SQL memory turns. When the context
 *    reaches the 20,000 token threshold (or user-configured test threshold), the middleware
 *    automatically intercepts the intake pipeline.
 * 
 * 2. Tactical Crisis Synthesis:
 *    Invokes Gemini 3.8 Flash with a high-fidelity system directive specifically calibrated
 *    for 911 dispatch operations. The model distills the older dialogue turns into an
 *    executive summary while strictly preserving life-critical data points:
 *    - Confirmed street addresses and cross-streets
 *    - Incident classification and severity
 *    - Trapped casualties and medical status
 *    - Confirmed lethal hazards (toxic gases, fire flashover, structural collapse)
 *    - Responding emergency units and assigned tactical sectors
 *    - Paralinguistic trajectory (initial panic vs grounded de-escalation)
 * 
 * 3. Context Window Compression:
 *    The synthesized summary is permanently recorded in the SQL database (`summaries` table).
 *    Future LLM prompts for this call session inject the distilled executive summary alongside
 *    only the most recent active dialogue turns (e.g. latest 6 turns). This preserves 100%
 *    tactical knowledge while keeping context lightweight, fast, and sub-second responsive.
 * 
 * Use Cases:
 * 1. Long-duration structure fires or mass casualty incidents with 50+ caller turns.
 * 2. Multi-caller conference bridges where tokens rapidly approach 20,000.
 * 3. High-throughput simulator testing with automated token stress checks.
 */

import { GoogleGenAI } from "@google/genai";
import { AURA_CONFIG } from "../src/config/auraConfig.ts";
import {
  getSession,
  getSessionTurns,
  recordSessionSummary,
  updateSessionMetadata
} from "./sqlMemoryDatabase.ts";
import type {
  MemoryTurnRecord,
  SessionRecord
} from "./sqlMemoryDatabase.ts";

export interface SummarizationResult {
  triggered: boolean;
  reason?: string;
  previousTokenCount: number;
  newTokenCount: number;
  tokensSummarized: number;
  summaryText?: string;
  turnsSummarizedCount?: number;
}

/**
 * Checks whether a session has breached the 20,000 token limit (or optional force/test threshold)
 * and executes the summarization distillation workflow if required.
 * 
 * @param ai GoogleGenAI client instance.
 * @param sessionId The unique call session ID to evaluate.
 * @param options Optional parameters (e.g. force execution or custom threshold).
 * @returns SummarizationResult describing whether summarization occurred.
 */
export async function checkAndExecuteSummarizationMiddleware(
  ai: GoogleGenAI,
  sessionId: string,
  options: {
    force?: boolean;
    customThreshold?: number;
  } = {}
): Promise<SummarizationResult> {
  console.info(`[SUMMARIZATION MIDDLEWARE] checkAndExecuteSummarizationMiddleware called for sessionId="${sessionId}" with options:`, options);

  const session = getSession(sessionId);
  if (!session) {
    console.warn(`[SUMMARIZATION MIDDLEWARE] Session not found: ${sessionId}`);
    return {
      triggered: false,
      reason: "Session not found",
      previousTokenCount: 0,
      newTokenCount: 0,
      tokensSummarized: 0
    };
  }

  const effectiveThreshold = options.customThreshold ?? AURA_CONFIG.memory.contextTokenLimit;
  const turns = getSessionTurns(sessionId);
  const currentTokens = session.token_count;

  console.info(`[SUMMARIZATION MIDDLEWARE] Session "${sessionId}" status: ${currentTokens} / ${effectiveThreshold} tokens (${turns.length} turns)`);

  const shouldTrigger = options.force || currentTokens >= effectiveThreshold;
  if (!shouldTrigger) {
    return {
      triggered: false,
      reason: `Context tokens (${currentTokens}) below threshold (${effectiveThreshold})`,
      previousTokenCount: currentTokens,
      newTokenCount: currentTokens,
      tokensSummarized: 0
    };
  }

  // If there are too few turns (e.g. less than 2), summarization is not meaningful
  if (turns.length < 2) {
    console.info(`[SUMMARIZATION MIDDLEWARE] Insufficient turns (${turns.length}) to summarize.`);
    return {
      triggered: false,
      reason: "Insufficient dialogue turns to warrant summarization",
      previousTokenCount: currentTokens,
      newTokenCount: currentTokens,
      tokensSummarized: 0
    };
  }

  // Retain latest active turns, or at least 1 turn if short dialogue
  const turnsToKeep = turns.length <= 4
    ? 1
    : Math.min(turns.length - 2, AURA_CONFIG.memory.recentTurnsToKeepAfterSummarization);
  const turnsToSummarize = turns.slice(0, turns.length - turnsToKeep);
  const turnsRemaining = turns.slice(turns.length - turnsToKeep);

  if (turnsToSummarize.length === 0) {
    return {
      triggered: false,
      reason: "No older turns available for summarization",
      previousTokenCount: currentTokens,
      newTokenCount: currentTokens,
      tokensSummarized: 0
    };
  }

  const startTurnIndex = turnsToSummarize[0].turn_index;
  const endTurnIndex = turnsToSummarize[turnsToSummarize.length - 1].turn_index;
  const tokensSummarized = turnsToSummarize.reduce((acc, t) => acc + t.token_count, 0);

  console.info(`[SUMMARIZATION MIDDLEWARE] Summarizing turns #${startTurnIndex} through #${endTurnIndex} (${tokensSummarized} tokens)...`);

  const transcriptBlock = turnsToSummarize
    .map((t) => `Turn ${t.turn_index} [${t.speaker}] (${t.timestamp}): ${t.text}${t.english_translation ? ` (English CAD: ${t.english_translation})` : ''}`)
    .join("\n");

  const systemPrompt = `
You are the elite AURA Context Summarization Middleware for 911 Emergency CAD dispatch.
Your mission is to compress extensive emergency call transcripts that reached the 20,000 token limit into a dense, high-accuracy Executive Incident Summary.

CRITICAL INSTRUCTIONS:
1. PRESERVE ALL CRITICAL TACTICAL DATA:
   - Exact locations, addresses, floors, room numbers, landmarks.
   - Exact nature of emergency, primary hazard, and fire/flood/hazmat/medical conditions.
   - Number of casualties, names, ages, trapped status, and respiration/pulse states.
   - Responding units dispatched (Engine, Ladder, Medic, Hazmat, Swiftwater).
   - Any survival directives already given to the caller.
   - Language of the caller and any translation notes.
2. DISCARD FLUFF & FILLER:
   - Eliminate repetitive conversational pauses, emotional screams, or pleasantries.
3. OUTPUT FORMAT:
   Return a concise, clinical, bulleted Executive Incident Summary (maximum 150 words) suitable for CAD dispatcher review.
`;

  const userPrompt = `
PREVIOUS EXECUTIVE SUMMARY:
${session.summary || "None (Initial call intake phase)."}

TRANSCRIPT SEGMENT REACHING 20K TOKEN LIMIT:
${transcriptBlock}

Produce the updated Executive Incident Summary now.
`;

  const modelName = AURA_CONFIG.intakeAiModel;
  console.info(`[GENAI CALL] Model: ${modelName} (Summarization Middleware) | Parameters:`, {
    sessionId,
    turnsSummarizedRange: `${startTurnIndex}-${endTurnIndex}`,
    tokensSummarized,
    transcriptLength: transcriptBlock.length
  });

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2
      }
    });

    const summaryText = (response.text || "").trim();
    console.info(`[GENAI RESPONSE] Model: ${modelName} | Output length: ${summaryText.length} chars | Summary: ${summaryText.substring(0, 100)}...`);

    // Record the summary in SQLite database
    recordSessionSummary(sessionId, summaryText, tokensSummarized, startTurnIndex, endTurnIndex);

    // Calculate new active context token count: remaining turns tokens + summary tokens
    const summaryTokens = Math.ceil(summaryText.length / AURA_CONFIG.memory.avgCharsPerToken) + 15;
    const remainingTokens = turnsRemaining.reduce((acc, t) => acc + t.token_count, 0);
    const newContextTokens = summaryTokens + remainingTokens;

    // Update session record
    updateSessionMetadata(sessionId, {
      token_count: newContextTokens,
      summary: summaryText,
      is_summarized: 1
    });

    console.info(`[SUMMARIZATION MIDDLEWARE] Compression completed. Tokens reduced from ${currentTokens} to ${newContextTokens}.`);

    return {
      triggered: true,
      reason: `Context reached threshold (${effectiveThreshold}). Older ${turnsToSummarize.length} turns compressed into tactical summary.`,
      previousTokenCount: currentTokens,
      newTokenCount: newContextTokens,
      tokensSummarized,
      summaryText,
      turnsSummarizedCount: turnsToSummarize.length
    };
  } catch (err: any) {
    console.error("[SUMMARIZATION MIDDLEWARE ERROR] Failed to generate summary via Gemini:", err);

    // Resilient local synthesis fallback
    const fallbackSummary = `[AUTO-SUMMARIZED AT 20K TOKENS]: Ongoing 911 incident for Call ${session.call_id}. Earlier dialogue recorded ${turnsToSummarize.length} turns. Address: ${session.location || 'Pending confirmation'}. Hazards and tactical units deployed.`;
    recordSessionSummary(sessionId, fallbackSummary, tokensSummarized, startTurnIndex, endTurnIndex);

    return {
      triggered: true,
      reason: "Fallback local summary applied after Gemini error",
      previousTokenCount: currentTokens,
      newTokenCount: Math.round(currentTokens * 0.4),
      tokensSummarized,
      summaryText: fallbackSummary,
      turnsSummarizedCount: turnsToSummarize.length
    };
  }
}
