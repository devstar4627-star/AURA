/**
 * AURA (Autonomous Urgent Response Agent) - Bidirectional WebSocket Client Service
 * ===============================================================================
 * 
 * Feature Description & Architecture:
 * This client-side service maintains a persistent, full-duplex WebSocket connection
 * with the AURA backend bidirectional engine (`/ws/call`).
 * 
 * Key Capabilities & Architecture:
 * 1. Full-Duplex Real-Time Event Communication:
 *    - Connects directly to the backend `BidirectionalWsServer`.
 *    - Streams caller utterances, paralinguistic tone metrics, and barge-in signals.
 *    - Receives AI triage responses, verbatim translations, and token telemetry in real time.
 * 
 * 2. Dedicated SQLite Session Synchronization:
 *    - Emits `CALL_INIT` with the call identifier, causing the backend `MemoryManager`
 *      to bind a dedicated `CallSessionStore` to this socket.
 *    - Receives real-time `TURN_COMMITTED` and `CONTEXT_SUMMARIZED` events whenever
 *      the 20K token middleware executes.
 * 
 * 3. Sub-30ms Barge-In Interruption Protocol:
 *    - Transmits instantaneous `BARGE_IN` control frames when the user speaks over AURA
 *      or hits the barge-in button.
 *    - Receives `BARGE_IN_CONFIRMED` acknowledgment with measured round-trip latency.
 * 
 * 4. Automatic Reconnection & Resilient Fallback:
 *    - Automatically detects socket drops and attempts reconnection with exponential backoff.
 *    - Allows components to seamlessly switch between WebSocket and HTTP REST if desired.
 * 
 * Use Cases:
 * - Live interactive 911 dispatch calls with instant voice/text responses.
 * - Dynamic context window compression testing (20K token summarization).
 * - Real-time acoustic telemetry synchronization.
 */

import { AURA_CONFIG } from "../config/auraConfig";

export type ConnectionStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";

export interface BidirectionalMessage {
  type: string;
  [key: string]: any;
}

export type MessageHandler = (msg: BidirectionalMessage) => void;
export type StatusHandler = (status: ConnectionStatus) => void;

/**
 * Manages full-duplex WebSocket communication between the client and AURA server.
 */
export class BidirectionalService {
  private static instance: BidirectionalService | null = null;
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "DISCONNECTED";
  private messageHandlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private reconnectTimer: any = null;
  private currentCallId: string | null = null;
  private currentSessionId: string | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  /**
   * Private constructor for singleton pattern.
   */
  private constructor() {
    console.info("[BIDIRECTIONAL SERVICE] Instance created.");
  }

  /**
   * Returns the shared singleton instance of BidirectionalService.
   * 
   * @returns Shared BidirectionalService instance.
   */
  public static getInstance(): BidirectionalService {
    console.info("[BIDIRECTIONAL SERVICE] getInstance called.");
    if (!BidirectionalService.instance) {
      BidirectionalService.instance = new BidirectionalService();
    }
    return BidirectionalService.instance;
  }

  /**
   * Establishes the WebSocket connection with the backend server.
   * 
   * @param callId Unique 911 Call Identifier.
   * @param callerLanguage Spoken caller language.
   * @param callerLanguageCode 2-letter ISO language code.
   */
  public connect(
    callId?: string,
    callerLanguage: string = "English",
    callerLanguageCode: string = "en"
  ): void {
    console.info(`[BIDIRECTIONAL SERVICE] connect called with callId="${callId}", lang="${callerLanguage}"`);
    if (callId) this.currentCallId = callId;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      console.info("[BIDIRECTIONAL SERVICE] WebSocket already connected or connecting.");
      if (callId && this.ws.readyState === WebSocket.OPEN) {
        this.initializeCall(callId, callerLanguage, callerLanguageCode);
      }
      return;
    }

    this.updateStatus("CONNECTING");

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}${AURA_CONFIG.apiEndpoints.wsBidirectional}`;
      console.info(`[BIDIRECTIONAL SERVICE] Connecting to WebSocket URL: ${wsUrl}`);

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.info("[BIDIRECTIONAL SERVICE] WebSocket connection opened successfully.");
        this.reconnectAttempts = 0;
        this.updateStatus("CONNECTED");

        if (this.currentCallId) {
          this.initializeCall(this.currentCallId, callerLanguage, callerLanguageCode);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.info(`[BIDIRECTIONAL SERVICE] Received message type: "${data.type}"`);

          if (data.sessionId) {
            this.currentSessionId = data.sessionId;
          }

          this.notifyMessageHandlers(data);
        } catch (parseErr) {
          console.warn("[BIDIRECTIONAL SERVICE WARNING] Failed to parse message:", parseErr);
        }
      };

      this.ws.onclose = (event) => {
        console.info(`[BIDIRECTIONAL SERVICE] WebSocket connection closed (code: ${event.code}, reason: ${event.reason})`);
        this.updateStatus("DISCONNECTED");
        this.scheduleReconnect(callerLanguage, callerLanguageCode);
      };

      this.ws.onerror = (err) => {
        console.error("[BIDIRECTIONAL SERVICE ERROR] WebSocket error:", err);
        this.updateStatus("ERROR");
      };
    } catch (err) {
      console.error("[BIDIRECTIONAL SERVICE ERROR] Exception during connect:", err);
      this.updateStatus("ERROR");
    }
  }

  /**
   * Sends a CALL_INIT message to bind this connection to a dedicated session store.
   * 
   * @param callId 911 Call Identifier.
   * @param callerLanguage Spoken language.
   * @param callerLanguageCode 2-letter ISO code.
   */
  public initializeCall(
    callId: string,
    callerLanguage: string = "English",
    callerLanguageCode: string = "en"
  ): void {
    console.info(`[BIDIRECTIONAL SERVICE] initializeCall: callId="${callId}", lang="${callerLanguage}"`);
    this.currentCallId = callId;
    this.send({
      type: "CALL_INIT",
      call_id: callId,
      caller_language: callerLanguage,
      caller_language_code: callerLanguageCode
    });
  }

  /**
   * Transmits a caller utterance over the bidirectional channel.
   * 
   * @param utterance Spoken or simulated caller text.
   * @param options Optional parameters (isBargeIn, toneMetrics, history).
   */
  public sendUtterance(
    utterance: string,
    options: {
      isBargeIn?: boolean;
      toneMetrics?: any;
      history?: any[];
    } = {}
  ): void {
    console.info(`[BIDIRECTIONAL SERVICE] sendUtterance: "${utterance.substring(0, 40)}..." (isBargeIn=${options.isBargeIn})`);
    this.send({
      type: "CALLER_UTTERANCE",
      utterance,
      is_barge_in: Boolean(options.isBargeIn),
      tone_metrics: options.toneMetrics || {},
      history: options.history || []
    });
  }

  /**
   * Transmits an instantaneous mid-sentence barge-in interruption signal.
   */
  public sendBargeIn(): void {
    console.info("[BIDIRECTIONAL SERVICE] sendBargeIn called.");
    this.send({
      type: "BARGE_IN",
      timestamp: Date.now()
    });
  }

  /**
   * Transmits a manual or test request to trigger the 20K token summarization middleware.
   * 
   * @param force Force execution regardless of current token count.
   */
  public triggerSummarization(force: boolean = true): void {
    console.info(`[BIDIRECTIONAL SERVICE] triggerSummarization called (force=${force})`);
    this.send({
      type: "SUMMARIZE_REQUEST",
      force
    });
  }

  /**
   * Sends an arbitrary JSON payload over the WebSocket if connected.
   * 
   * @param payload Object to stringify and transmit.
   */
  public send(payload: any): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    console.warn("[BIDIRECTIONAL SERVICE WARNING] Cannot send message, WebSocket not OPEN.");
    return false;
  }

  /**
   * Disconnects the active WebSocket session.
   */
  public disconnect(): void {
    console.info("[BIDIRECTIONAL SERVICE] disconnect called.");
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.updateStatus("DISCONNECTED");
  }

  /**
   * Subscribes a listener to incoming bidirectional messages.
   * 
   * @param handler Message handler callback.
   * @returns Unsubscribe function.
   */
  public onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /**
   * Subscribes a listener to connection status changes.
   * 
   * @param handler Status handler callback.
   * @returns Unsubscribe function.
   */
  public onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  /**
   * Returns current connection status.
   * 
   * @returns ConnectionStatus enum value.
   */
  public getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Returns current active call ID.
   * 
   * @returns string or null.
   */
  public getCurrentCallId(): string | null {
    return this.currentCallId;
  }

  /**
   * Returns current active session ID.
   * 
   * @returns string or null.
   */
  public getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Updates status and notifies all registered status handlers.
   * 
   * @param newStatus New connection status.
   */
  private updateStatus(newStatus: ConnectionStatus): void {
    if (this.status !== newStatus) {
      console.info(`[BIDIRECTIONAL SERVICE] Status changed: ${this.status} -> ${newStatus}`);
      this.status = newStatus;
      for (const handler of this.statusHandlers) {
        handler(this.status);
      }
    }
  }

  /**
   * Notifies all registered message handlers of an incoming message.
   * 
   * @param msg The parsed JSON message.
   */
  private notifyMessageHandlers(msg: BidirectionalMessage): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(msg);
      } catch (err) {
        console.error("[BIDIRECTIONAL SERVICE ERROR] Error in message handler:", err);
      }
    }
  }

  /**
   * Schedules an automatic reconnection attempt with exponential backoff.
   */
  private scheduleReconnect(lang: string, langCode: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.info("[BIDIRECTIONAL SERVICE] Max reconnect attempts reached.");
      return;
    }

    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
    this.reconnectAttempts++;
    console.info(`[BIDIRECTIONAL SERVICE] Scheduling reconnect attempt #${this.reconnectAttempts} in ${delay}ms...`);

    this.reconnectTimer = setTimeout(() => {
      if (this.status !== "CONNECTED") {
        this.connect(this.currentCallId || undefined, lang, langCode);
      }
    }, delay);
  }
}

export const bidirectionalService = BidirectionalService.getInstance();
