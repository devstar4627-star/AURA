import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import {
  createSession,
  getSession,
  listSessions,
  addMemoryTurn,
  getSessionTurns,
  updateSessionMetadata,
  getLatestSessionByCallId,
  getSessionSummaries,
  recordSessionSummary
} from './server/sqlMemoryDatabase.js';
import { checkAndExecuteSummarizationMiddleware } from './server/summarizationMiddleware.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build'
    }
  }
});

interface IncidentRecord {
  id: string;
  call_id: string;
  incident_type: string;
  location: string;
  panic_index: number;
  casualties: number;
  status: string;
  priority: 'CRITICAL' | 'HIGH' | 'ROUTINE';
  caller_summary?: string;
  tone_assessment?: {
    screaming_detected?: boolean;
    breathing_rate?: string;
    background_noise?: string;
  };
  recommended_units?: string[];
  created_at: string;
}

// In-memory store mirroring PostgreSQL incidents table
const initialIncidents: IncidentRecord[] = [
  {
    id: "a1b2c3d4-0001-4000-8000-000000000001",
    call_id: "CALL-99124",
    incident_type: "Structure Fire - Trapped Residents",
    location: "442 Industrial Parkway, Sector 4",
    panic_index: 9,
    casualties: 3,
    status: "UNITS_DISPATCHED",
    priority: "CRITICAL",
    caller_summary: "Call disconnected after reporting heavy smoke and 3 people on second floor balcony.",
    tone_assessment: {
      screaming_detected: true,
      breathing_rate: "hyperventilating",
      background_noise: "structural fire crackling & smoke alarm"
    },
    recommended_units: ["Engine 12", "Ladder 4", "Medic 2", "Battalion 1"],
    created_at: new Date(Date.now() - 1000 * 120).toISOString()
  },
  {
    id: "a1b2c3d4-0002-4000-8000-000000000002",
    call_id: "CALL-99118",
    incident_type: "Flash Flood - Submerged Vehicle",
    location: "Creek Road & 5th Avenue Underpass",
    panic_index: 8,
    casualties: 1,
    status: "EN_ROUTE",
    priority: "CRITICAL",
    caller_summary: "Sedan washed off roadway by rapid floodwaters. Driver on car roof screaming for rescue.",
    tone_assessment: {
      screaming_detected: true,
      breathing_rate: "hyperventilating",
      background_noise: "torrential water rush"
    },
    recommended_units: ["Swiftwater 7", "Rescue 3", "Boat 1"],
    created_at: new Date(Date.now() - 1000 * 240).toISOString()
  },
  {
    id: "a1b2c3d4-0003-4000-8000-000000000003",
    call_id: "CALL-99105",
    incident_type: "Chemical Spill / Vapor Cloud",
    location: "Bay 14 Warehouses, Dock Street",
    panic_index: 7,
    casualties: 0,
    status: "CONTAINMENT",
    priority: "HIGH",
    caller_summary: "Pungent chlorine-like odor with visible yellow plume after forklift punctured drum.",
    tone_assessment: {
      screaming_detected: false,
      breathing_rate: "elevated",
      background_noise: "warehouse industrial machinery"
    },
    recommended_units: ["Hazmat 9", "Engine 8", "Decon 1"],
    created_at: new Date(Date.now() - 1000 * 480).toISOString()
  }
];

let incidents: IncidentRecord[] = [...initialIncidents];
const sseClients: Response[] = [];

function broadcastPostgresNotify(event: string, data: any) {
  const payload = JSON.stringify({
    event,
    timestamp: Date.now(),
    data
  });

  const formattedMsg = `event: ${event}\ndata: ${payload}\n\n`;
  for (const client of sseClients) {
    client.write(formattedMsg);
  }
}

async function createServer() {
  const app = express();
  app.use(express.json());

  // API Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'HEALTHY',
      service: 'AURA Crisis Dispatch Co-Pilot',
      model: 'gemini-3.8-live',
      pubsub: 'PostgreSQL LISTEN/NOTIFY',
      subscribers: sseClients.length
    });
  });

  // Get recent incidents
  app.get('/api/incidents', (_req, res) => {
    res.json({ incidents });
  });

  // Server-Sent Events (SSE) Route for live dashboard
  app.get('/api/events/dashboard', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    });

    res.write(`event: CONNECTED\ndata: ${JSON.stringify({ status: 'ONLINE', channel: 'dispatch_events' })}\n\n`);
    res.write(`event: INITIAL_STATE\ndata: ${JSON.stringify(incidents)}\n\n`);

    sseClients.push(res);

    req.on('close', () => {
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
  });

  // ADK Tool Ingestion Endpoint (mimics extract_dispatch_data tool inserting into Postgres)
  app.post('/api/dispatch', (req: Request, res: Response) => {
    const { incident_type, location, panic_index, casualties, caller_summary, tone_assessment, recommended_units } = req.body;

    const newRecord: IncidentRecord = {
      id: `aura-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      call_id: `CALL-${Math.floor(Math.random() * 90000 + 10000)}`,
      incident_type: incident_type || "Emergency Incident",
      location: location || "Unverified Location",
      panic_index: Math.min(10, Math.max(1, Number(panic_index) || 5)),
      casualties: Math.max(0, Number(casualties) || 0),
      status: "NEW_INTAKE",
      priority: (Number(panic_index) >= 8 || Number(casualties) > 0) ? "CRITICAL" : (Number(panic_index) >= 5 ? "HIGH" : "ROUTINE"),
      caller_summary: caller_summary || "Automated intake recorded by AURA AI dispatcher.",
      tone_assessment: tone_assessment || {
        screaming_detected: Number(panic_index) >= 8,
        breathing_rate: Number(panic_index) >= 8 ? "hyperventilating" : "elevated",
        background_noise: "chaotic ambient emergency noise"
      },
      recommended_units: recommended_units || ["Engine 4", "Medic 1"],
      created_at: new Date().toISOString()
    };

    incidents.unshift(newRecord);

    // Trigger native-like NOTIFY broadcast to all SSE dashboards
    broadcastPostgresNotify('NEW_DISPATCH_REPORT', newRecord);

    res.status(201).json({
      status: 'SUCCESS',
      message: 'Dispatch report committed to database. Trigger fired pg_notify on channel dispatch_events.',
      incident: newRecord
    });
  });

  // --- Persistent SQL Memory & Session Management Routes ---
  
  // Start / Register a new Call Session (treating each new call as a separate session)
  app.post('/api/memory/session/start', (req: Request, res: Response) => {
    const { call_id, caller_language = 'English', caller_language_code = 'en' } = req.body;
    const sessionCallId = call_id || `CALL-${Math.floor(Math.random() * 90000 + 10000)}`;
    const session = createSession(sessionCallId, caller_language, caller_language_code);
    res.status(201).json({ status: 'SUCCESS', session });
  });

  // List past sessions from SQL memory
  app.get('/api/memory/sessions', (_req: Request, res: Response) => {
    const sessions = listSessions(50);
    res.json({ status: 'SUCCESS', count: sessions.length, sessions });
  });

  // Get full session detail, turns, and summaries
  app.get('/api/memory/session/:sessionId', (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found in SQL memory' });
    }
    const turns = getSessionTurns(sessionId);
    const summaries = getSessionSummaries(sessionId);
    res.json({ status: 'SUCCESS', session, turns, summaries });
  });

  // Record an individual turn into SQL memory & run summarization middleware check
  app.post('/api/memory/turn', async (req: Request, res: Response) => {
    const { session_id, speaker, text, english_translation, tone_metrics, intent, is_barge_in } = req.body;
    if (!session_id || !text) {
      return res.status(400).json({ error: 'session_id and text are required.' });
    }

    try {
      const turn = addMemoryTurn({
        sessionId: session_id,
        speaker: speaker || 'CALLER',
        text,
        englishTranslation: english_translation,
        toneMetrics: tone_metrics,
        intent,
        isBargeIn: Boolean(is_barge_in)
      });

      // Check if context length reached 20K tokens (or test threshold)
      const summarization = await checkAndExecuteSummarizationMiddleware(ai, session_id);
      const updatedSession = getSession(session_id);

      res.status(201).json({
        status: 'SUCCESS',
        turn,
        sessionTokenCount: updatedSession?.token_count || 0,
        summarization
      });
    } catch (err: any) {
      console.error('[SQL MEMORY API ERROR]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Trigger 20K Token Summarization Middleware manually / test
  app.post('/api/memory/summarize', async (req: Request, res: Response) => {
    const { session_id, force = true } = req.body;
    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required.' });
    }

    try {
      const result = await checkAndExecuteSummarizationMiddleware(ai, session_id, { force });
      res.json({ status: 'SUCCESS', result });
    } catch (err: any) {
      console.error('[SUMMARIZATION MIDDLEWARE API ERROR]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Real-Time Gemini Multilingual Crisis Intake, Multi-Speaker Disentanglement & Tone Reasoning
  app.post('/api/chat/intake', async (req: Request, res: Response) => {
    const { utterance, history = [], tone_metrics = {}, is_barge_in = false, session_id, call_id } = req.body;

    if (!utterance || typeof utterance !== 'string') {
      return res.status(400).json({ error: 'Utterance is required.' });
    }

    // Resolve or initialize active session in persistent SQL memory
    let activeSession = session_id ? getSession(session_id) : null;
    if (!activeSession && call_id) {
      activeSession = getLatestSessionByCallId(call_id);
    }
    if (!activeSession) {
      const assignedCallId = call_id || `CALL-${Math.floor(Math.random() * 90000 + 10000)}`;
      activeSession = createSession(assignedCallId, "English", "en");
    }

    // Commit incoming caller utterance to short-term SQL memory
    let callerTurnRecord: any = null;
    try {
      callerTurnRecord = addMemoryTurn({
        sessionId: activeSession.session_id,
        speaker: "CALLER",
        text: utterance,
        toneMetrics: tone_metrics,
        isBargeIn: Boolean(is_barge_in)
      });
    } catch (dbErr) {
      console.warn("[SQL MEMORY WARNING] Error recording caller turn:", dbErr);
    }

    const systemInstruction = `
You are AURA (Autonomous Urgent Response Agent), an elite 911 emergency crisis intake AI co-pilot.
You listen to panicked live emergency callers, parse raw, chaotic, messy multi-speaker audio, and provide an immediate spoken response while converting the messy multi-speaker audio into structured action for dispatchers.

CRITICAL OPERATIONAL RULES:
1. SAME LANGUAGE RESPONSE & REAL-TIME FEEDBACK:
   - Accurately detect the caller's spoken language (e.g. Spanish, English, French, Vietnamese, Mandarin, Hindi, Arabic, Tagalog, Ukrainian, Japanese, German, Russian, Portuguese, etc.).
   - ALWAYS formulate "caller_response_same_language" in the caller's EXACT SAME LANGUAGE.
   - Use calm, steady, authoritative grounding words (Aoede emergency persona).
   - If the caller did not state their address or location, you MUST prioritize asking for their exact address/cross-street in their language.
   - If acute panic is detected (screaming, hyperventilating, hysteria), begin with immediate grounding words in their language:
     e.g., in Spanish: "Respire conmigo un momento. La ayuda va en camino. Mantenga el teléfono en su oreja. ¿Cuál es su dirección exacta?"
     e.g., in French: "Respirez avec moi. Les secours sont en route. Gardez le téléphone près de vous. Quelle est votre adresse exacte ?"
     e.g., in English: "Take one breath with me right now. Help is on the way. Keep the phone to your ear. What is your exact address?"

2. REAL-TIME TRANSLATION ACROSS LANGUAGES FOR CAD:
   - Provide "caller_response_english": Verbatim English translation of what you told the caller.
   - Provide "caller_input_english_translation": Verbatim English translation of everything heard in the caller's utterance.

3. UNDERSTAND INTENT ACROSS CHAOTIC & FRAGMENTED AUDIO:
   - Emergency callers do not speak in clean, complete sentences. Discern their underlying intent from non-linear, broken, breathless cries:
     - "I can't breathe / it's burning / black smoke / stairs gone" -> Structure Fire with Entrapment
     - "Water is rising / car floating / doors stuck / kids crying" -> Flash Flood Vehicle Submersion
     - "He collapsed / no pulse / turning purple / gasping" -> Sudden Cardiac Arrest
     - "Yellow gas / coughing / tank ruptured / burning eyes" -> Hazardous Materials Toxic Plume
     - "Someone kicking door / has a knife / hiding in closet" -> Active Threat / Home Invasion
     - "Pileup / smashed cars / pinned under dashboard / highway" -> Multi-Vehicle Extrication

4. MULTIPLE USERS AUDIO & MESSY MULTI-SPEAKER DISENTANGLEMENT:
   - Raw emergency audio often contains multiple simultaneous speakers (primary caller, crying children, screaming spouses, shouting bystanders, or background 911 dispatch chatter).
   - Disentangle every distinct voice into the "multi_speakers" array:
     [
       { "speaker_id": "Primary Caller", "text": "Exact words or cries heard from caller", "intent": "Core request or emergency report" },
       { "speaker_id": "Background Speaker / Relative / Child", "text": "Secondary voice heard in room", "intent": "Contextual danger indicator" }
     ]

5. READ VOCAL TONE & PARALINGUISTIC TELEMETRY:
   - Acoustic Tone Assessment:
     - "panic_index": Integer 1 to 10 (10 being extreme hysteria/fatal danger)
     - "screaming_detected": boolean (true if shouting, screaming, shriek keywords, or uppercase screams present)
     - "breathing_rate": string (e.g. "Hyperventilating (38 BPM)", "Agonal Gasps", "Rapid 26 BPM", "Normal 16 BPM")
     - "emotional_state": string describing psychological state (e.g. "Acute Panic / Hysterical Disorientation", "Shock", "Terrified Urgency")

6. MID-SENTENCE INTERRUPTION (BARGE-IN) HANDLING:
   - If is_barge_in is true, the caller interrupted mid-sentence or shouted over dispatch.
   - Cut straight to the critical survival instruction without greetings, apologies, or conversational filler.

7. TURN MESSY AUDIO INTO STRUCTURED ACTION:
   - Convert messy speech into structured dispatch data:
     - "problem_statement": Crisp clinical/tactical emergency diagnosis
     - "importance": "CRITICAL (PRIORITY 1) - IMMEDIATE THREAT TO LIFE" | "HIGH (PRIORITY 2)" | "ELEVATED (PRIORITY 3)"
     - "primary_hazard": Specific lethal threat (e.g., "Thermal Flashover & Toxic Cyanide Smoke Inhalation")
     - "immediate_survival_directive": Concrete physical survival order for caller (e.g., "Crawl under smoke, feel doors with back of hand")
     - "extracted_data": { incident_type, location, casualties, recommended_units }
     - "tactical_action_summary": Direct tactical action for responding units

8. OUTPUT SCHEMA:
Return ONLY a valid JSON object matching this exact structure:
{
  "caller_language": "Detected Language name (e.g. Spanish, English, French, Hindi)",
  "caller_language_code": "2-letter ISO code (e.g. es, en, fr, hi, vi, zh, ar, ja, de, uk)",
  "caller_response_same_language": "Your spoken reply in the caller's exact same language",
  "caller_response_english": "Verbatim English translation of your reply",
  "caller_input_english_translation": "English translation of what was said/heard",
  "problem_statement": "Crisp diagnostic classification of the emergency problem",
  "importance": "CRITICAL (PRIORITY 1) - IMMEDIATE THREAT TO LIFE",
  "primary_hazard": "Lethal threat description",
  "immediate_survival_directive": "Immediate concrete physical survival directive for caller",
  "multi_speakers": [
    { "speaker_id": "Primary Caller", "text": "What was said", "intent": "Underlying intent" }
  ],
  "vocal_tone": {
    "panic_index": 9,
    "screaming_detected": true,
    "breathing_rate": "Hyperventilating (38 BPM)",
    "emotional_state": "Hysterical panic"
  },
  "extracted_data": {
    "incident_type": "Categorized Incident Type",
    "location": "Extracted address or Awaiting Location Confirmation",
    "casualties": 0,
    "recommended_units": ["Unit 1", "Unit 2"]
  },
  "tactical_action_summary": "Summary instruction for responding commanders"
}
`;

    const activeExecutiveSummary = activeSession.summary ? `
PREVIOUS EXECUTIVE INCIDENT SUMMARY (COMPRESSED FROM 20K TOKENS):
${activeSession.summary}
` : '';

    const prompt = `
${activeExecutiveSummary}
CALLER INTAKE UTTERANCE: "${utterance}"
IS MID-SENTENCE BARGE-IN INTERRUPTION: ${Boolean(is_barge_in)}
ACOUSTIC TONE TELEMETRY: ${JSON.stringify(tone_metrics)}
RECENT CONVERSATION TURNS:
${Array.isArray(history) ? history.slice(-6).map((h: any) => `${h.speaker}: ${h.text}`).join('\n') : ''}

Analyze and respond in the caller's exact same language and return valid JSON.
`;

    const modelName = 'gemini-3.8-flash';
    console.info(`[GENAI CALL] Model: ${modelName} | Parameters:`, {
      sessionId: activeSession.session_id,
      utterance: utterance.substring(0, 100),
      is_barge_in,
      tone_metrics,
      hasSummary: Boolean(activeSession.summary),
      historyLength: Array.isArray(history) ? history.length : 0
    });

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      });

      const rawText = response.text || '{}';
      console.info(`[GENAI RESPONSE] Model: ${modelName} | Length: ${rawText.length} chars | Raw output: ${rawText.substring(0, 120)}...`);

      let cleanJson = rawText.trim();
      if (cleanJson.startsWith('```json')) {
        cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsedData = JSON.parse(cleanJson);

      // Record AURA response into SQL short-term memory
      try {
        addMemoryTurn({
          sessionId: activeSession.session_id,
          speaker: "AURA",
          text: parsedData.caller_response_same_language || parsedData.caller_response_english,
          englishTranslation: parsedData.caller_response_english,
          intent: parsedData.problem_statement
        });

        // Update session metadata
        updateSessionMetadata(activeSession.session_id, {
          caller_language: parsedData.caller_language,
          caller_language_code: parsedData.caller_language_code,
          incident_type: parsedData.extracted_data?.incident_type || parsedData.problem_statement,
          location: parsedData.extracted_data?.location
        });
      } catch (dbErr) {
        console.warn("[SQL MEMORY WARNING] Error recording AURA response turn:", dbErr);
      }

      // Check if 20K token context threshold reached and trigger summarization middleware
      const summarization = await checkAndExecuteSummarizationMiddleware(ai, activeSession.session_id);
      const reloadedSession = getSession(activeSession.session_id);

      return res.json({
        status: 'SUCCESS',
        model: modelName,
        session_id: activeSession.session_id,
        session_token_count: reloadedSession?.token_count || 0,
        summarization,
        data: parsedData
      });
    } catch (err: any) {
      console.error('[GEMINI API ERROR] Calling Gemini failed:', err);

      // Intelligent resilient fallback if API key or connectivity encounters an issue
      const isSpanish = /ayuda|fuego|humo|casa|carro|agua|hijo|socorro|por favor/i.test(utterance);
      const isFrench = /aide|feu|fumee|maison|voiture|eau|secours/i.test(utterance);
      const detectedLang = isSpanish ? "Spanish" : isFrench ? "French" : "English";
      const detectedCode = isSpanish ? "es" : isFrench ? "fr" : "en";

      const fallbackSpanish = "Respire conmigo, la ayuda va en camino. Mantenga el teléfono cerca. ¿Cuál es su dirección exacta?";
      const fallbackFrench = "Respirez avec moi, les secours arrivent. Restez en ligne. Quelle est votre adresse exacte ?";
      const fallbackEnglish = "Take one breath with me. Rescue units are being dispatched. What is your exact address right now?";

      const callerResponse = isSpanish ? fallbackSpanish : isFrench ? fallbackFrench : fallbackEnglish;

      // Record fallback turn in SQL memory
      try {
        addMemoryTurn({
          sessionId: activeSession.session_id,
          speaker: "AURA",
          text: callerResponse,
          englishTranslation: fallbackEnglish,
          intent: "Resilient Emergency Grounding Directive"
        });
      } catch {}

      const reloadedSession = getSession(activeSession.session_id);

      return res.json({
        status: 'FALLBACK',
        model: modelName,
        session_id: activeSession.session_id,
        session_token_count: reloadedSession?.token_count || 0,
        summarization: { triggered: false },
        data: {
          caller_language: detectedLang,
          caller_language_code: detectedCode,
          caller_response_same_language: callerResponse,
          caller_response_english: fallbackEnglish,
          caller_input_english_translation: utterance,
          problem_statement: utterance.toLowerCase().includes("fire") || isSpanish ? "Structure Fire: Acute Thermal & Smoke Peril" : "Urgent Crisis Incident",
          importance: "CRITICAL (PRIORITY 1) - IMMEDIATE THREAT TO LIFE",
          primary_hazard: "Thermal flashover, toxic smoke inhalation, situational entrapment",
          immediate_survival_directive: "Stay below the smoke line. Crawl on hands and knees. Feel any door before opening.",
          multi_speakers: [
            { speaker_id: "Primary Caller", text: utterance, intent: "Urgent plea for emergency assistance" }
          ],
          vocal_tone: {
            panic_index: 9,
            screaming_detected: true,
            breathing_rate: "Hyperventilating (36 BPM)",
            emotional_state: "High distress"
          },
          extracted_data: {
            incident_type: "Emergency Crisis Intake",
            location: "Awaiting Location Confirmation",
            casualties: 1,
            recommended_units: ["Engine 12", "Medic 2", "Ladder 4"]
          },
          tactical_action_summary: "Dispatched immediate responder squad to verify address and deploy rescue gear."
        }
      });
    }
  });

  // Mount Vite in development or serve static dist in production
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[AURA SERVER] Listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error("Failed to start AURA server:", err);
});
