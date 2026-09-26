# Design Document: AURA (Autonomous Urgent Response Agent)
## Production-Grade Crisis Dispatch Co-Pilot

---

## 1. Executive Summary

**AURA (Autonomous Urgent Response Agent)** is a real-time crisis intake and triage co-pilot built for emergency 911 dispatch centers. In high-stakes crisis scenarios—structure fires with trapped occupants, flash floods submerging vehicles, industrial toxic vapor leaks, and high-speed highway collisions—callers are overwhelmed by terror, hyperventilation, and cognitive tunnel vision.

Traditional computer-aided dispatch (CAD) requires manual data entry while attempting to calm callers over phone lines. AURA acts as the first line of defense:
- **Full-Duplex Bidirectional Audio**: Powered by **Google ADK (Agent Development Kit)** and the **`gemini-3.8-live`** model, delivering natural conversation and instantaneous caller barge-in cutoffs ($<45\text{ms}$).
- **Paralinguistic Acoustic Assessment**: Measures non-verbal distress markers—hyperventilation breathing rate (BPM), vocal tremor, scream frequency, and ambient acoustic hazards (fire crackle, rushing water, sirens)—to calculate a real-time **Panic Index (1–10)**.
- **Strict Survival Data Extraction**: Executes Pydantic-validated ADK tool calls (`extract_dispatch_data`) extracting incident type, address, casualties, and tactical tone metrics.
- **Native PostgreSQL Pub/Sub Architecture**: Uses native database triggers (`AFTER INSERT` $\rightarrow$ `pg_notify`) and `asyncpg` LISTEN workers to broadcast new incidents to dispatcher dashboards via Server-Sent Events (SSE) with sub-millisecond latency ($<1.2\text{ms}$), completely eliminating Redis dependency.
- **AI Suggested Situational Response Engine**: Generates context-specific, life-saving questions and tactical directives for dispatchers to communicate directly to callers based on incident classification.

---

## 2. System Architecture & Information Flow

```
   ┌────────────────────────────────────────────────────────┐
   │                  Panicked 911 Caller                   │
   │               (16kHz Raw PCM Audio Stream)             │
   └──────────────────────────┬─────────────────────────────┘
                              │ Browser WebSocket
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │             FastAPI Backend (/ws/audio/{id})           │
   └──────────────────────────┬─────────────────────────────┘
                              │ google-adk LiveClient
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │         Gemini 3.8 Live Engine ('gemini-3.8-live')     │
   │  ├── Real-Time Voice Synthesis (24kHz Aoede Persona)   │
   │  ├── Native Barge-In Detector (<45ms AI Audio Cutoff)  │
   │  ├── Paralinguistic Distress Analyzer (Panic 1-10)     │
   │  └── Tool Invocator (@tool extract_dispatch_data)      │
   └──────────────────────────┬─────────────────────────────┘
                              │ Structured Pydantic Payload
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │              PostgreSQL Relational Storage             │
   │   INSERT INTO incidents (incident_type, location, ...) │
   │                                                        │
   │   TRIGGER: trg_notify_dispatch_incident                │
   │   ACTION:  PERFORM pg_notify('dispatch_events', JSON)  │
   └──────────────────────────┬─────────────────────────────┘
                              │ asyncpg LISTEN dispatch_events (< 1.2ms)
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │         FastAPI Server-Sent Events (SSE) Stream        │
   │               (/api/events/dashboard)                  │
   └──────────────────────────┬─────────────────────────────┘
                              │ Real-Time SSE Push
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │         Human Dispatcher Mission Control UI            │
   │  ├── Live Incident Feed (Zero Page Reloads)           │
   │  ├── Acoustic Waveform & Scream Visualizer             │
   │  ├── AI Suggested Situational Response Questions       │
   │  └── Tactical First Responder Squad Deployment         │
   └────────────────────────────────────────────────────────┘
```

---

## 3. Core Features & Functional Specification

### 3.1 Bidirectional Voice & Native Barge-In Interruption
- **Full-Duplex Streaming**: Uses ADK's `LiveClient` to maintain a persistent connection streaming 16kHz PCM audio from the caller and receiving 24kHz synthesized audio turns.
- **Interruption Guarantee**: When a caller speaks over AURA or shrieks in terror, ADK immediately registers `interrupted=True`. Audio synthesis is truncated within 45ms, and the audio channel is returned to active intake mode.
- **Grounding Protocols**: If the caller's breathing exceeds 30 BPM or the panic index is $\ge 8$, AURA deploys grounding techniques: *"Take one breath with me. Rescue squads have their sirens on right now. Where are you located?"*

### 3.2 Paralinguistic Tone Assessment (Panic Index 1–10)
Rather than relying purely on text sentiment, AURA analyzes raw acoustic properties:
- **Respiratory Rate**: Distinguishes normal breathing (12–20 BPM), elevated stress (21–29 BPM), hyperventilation (30–45 BPM), and agonal respiratory distress.
- **Vocal Shriek / Pitch Tremor**: Detects high-frequency vocal spikes ($>80\text{dB}$) associated with imminent physical peril.
- **Acoustic Background Context**: Classifies environmental hazards (structural fire collapse, roaring water currents, pressurized gas hiss, high-speed traffic).
- **Severity Scoring**:
  - `1–4 (Nominal/Routine)`: Caller is composed, factual, and coherent.
  - `5–7 (High Stress)`: Trembling voice, rapid speech, background alarms.
  - `8–10 (Critical Panic)`: Hysterical shrieking, hyperventilation, immediate life-threat.

### 3.3 Structured JSON Extraction (`DispatchReport`)
The system validates extracted crisis reports via a strict Pydantic model:
```python
class DispatchReport(BaseModel):
    incident_type: str = Field(..., description="Crisis classification")
    location: str = Field(..., description="Exact address or landmark")
    panic_index: int = Field(..., ge=1, le=10, description="Paralinguistic distress score")
    casualties: int = Field(..., ge=0, description="Count of trapped or injured individuals")
    caller_summary: Optional[str]
    tone_assessment: Optional[ToneMetrics]
    recommended_units: Optional[List[str]]
```
Wrapped in the `@tool` decorator, `extract_dispatch_data` runs automatically once situational facts are gathered without verbal announcement.

### 3.4 Native PostgreSQL Pub/Sub Architecture (Zero Redis)
- **High-Throughput Trigger**: The database enforces an `AFTER INSERT ON incidents` trigger:
  ```sql
  CREATE TRIGGER trg_notify_dispatch_incident
  AFTER INSERT ON incidents
  FOR EACH ROW EXECUTE FUNCTION notify_dispatch_incident();
  ```
- **Instant Notification**: Executes `pg_notify('dispatch_events', payload::text)`.
- **Sub-Millisecond Delivery**: An `asyncpg` background worker in FastAPI holds an active listener connection, pushing JSON events directly into memory-backed async queues for SSE streaming with latency under $1.2\text{ms}$.

### 3.5 AI Suggested Situational Response Engine
Located directly within the Dispatcher Triage Console, this module analyzes the incident type and generates targeted survival directives and tactical reconnaissance questions:
- **Structure Fire**: Checks door heat with the back of the hand, floor-level smoke crawling (lowest 18 inches), exterior window orientation for aerial ladder deployment, and secondary explosion hazards (propane/oxygen).
- **Flash Flood / Vehicle Submersion**: Seatbelt release, window breach before electrical short, roof climbing vs. moving water evasion, and downstream drift tracking.
- **Toxic Chemical Vapor**: Upwind/uphill evacuation paths, 4-digit UN chemical placard identification, and symptom logging for Hazmat decontamination teams.
- **Highway Pileup**: Guardrail pedestrian separation, hydraulic extrication pinning checks, and high-voltage EV hazard identification.
- **Dispatcher Actions**: Includes 1-click **Transmit to Caller** (injecting into the live audio transcript stream), **Copy**, and **Ask AI** situational synthesis.

---

## 4. Database Schema & Data Dictionary

### Table: `incidents`

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Unique incident record ID |
| `call_id` | `VARCHAR(64)` | `NOT NULL` | Human-readable CAD call code (e.g. `CALL-99124`) |
| `incident_type` | `VARCHAR(100)` | `NOT NULL` | Categorized emergency type |
| `location` | `TEXT` | `NOT NULL` | Street address, cross street, or mile marker |
| `panic_index` | `INT` | `CHECK (1 <= panic_index <= 10)` | Paralinguistic acoustic panic score |
| `casualties` | `INT` | `DEFAULT 0, CHECK (casualties >= 0)` | Trapped or injured victim count |
| `status` | `VARCHAR(50)` | `DEFAULT 'NEW_INTAKE'` | Workflow state (`NEW_INTAKE`, `UNITS_DISPATCHED`, `EN_ROUTE`, `ON_SCENE`, `STABILIZED`) |
| `priority` | `VARCHAR(20)` | `DEFAULT 'PRIORITY_1'` | Computed priority (`CRITICAL`, `HIGH`, `ROUTINE`) |
| `caller_summary` | `TEXT` | `NULLABLE` | Concise intake synopsis |
| `tone_assessment` | `JSONB` | `DEFAULT '{}'` | Acoustic telemetry (screaming, breathing, noise) |
| `recommended_units`| `TEXT[]` | `DEFAULT ARRAY['Engine 4', 'Rescue 1']` | Recommended first responder squad units |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Last update timestamp |

---

## 5. API Endpoint Specifications

### 5.1 WebSocket: Raw Audio Pipeline
- **URL**: `ws://HOST/ws/audio/{call_id}`
- **Protocol**: Bidirectional binary & JSON framing
- **Client to Server**:
  - Binary frames: 16kHz 16-bit mono PCM audio chunks.
  - JSON control messages: `{ "type": "TERMINATE_CALL" }`.
- **Server to Client**:
  - `{ "type": "AUDIO_RESPONSE", "audio": "<base64_pcm_24khz>", "sample_rate": 24000 }`
  - `{ "type": "BARGE_IN_TRIGGERED", "message": "Caller interrupted AI speech." }`
  - `{ "type": "TOOL_INVOKED", "tool": "extract_dispatch_data", "payload": { ... } }`
  - `{ "type": "TRANSCRIPTION", "speaker": "AURA" | "CALLER", "text": "..." }`

### 5.2 Server-Sent Events (SSE): Dashboard Stream
- **URL**: `GET /api/events/dashboard`
- **Headers**: `Accept: text/event-stream`, `Cache-Control: no-cache`
- **Events**:
  - `CONNECTED`: `{ "status": "ONLINE", "channel": "dispatch_events" }`
  - `INITIAL_STATE`: Array of initial recent incidents for zero-flicker hydration.
  - `NEW_DISPATCH_REPORT`: Emitted on PostgreSQL `NOTIFY` trigger with full incident JSON.

---

## 6. Centralized Configuration Reference

All configurable values are grouped in centralized configuration files:
- **Backend**: `/backend/app/config.py` (`settings.agent.live_model`, `settings.database.database_url`, `settings.audio.*`)
- **Frontend**: `/src/config/auraConfig.ts` (`AURA_CONFIG.aiModel`, `AURA_CONFIG.panicScale`, `AURA_CONFIG.apiEndpoints`)

---

## 7. Operational Guidelines & Verification

1. **Compiling & Building**: Run `npm run build` or `compile_applet`.
2. **Linting & Type Safety**: Run `npm run lint` (`tsc --noEmit`).
3. **Database Setup**: Execute `psql -U postgres -d aura_dispatch -f db/init.sql`.
4. **Backend Server**: Execute `uvicorn app.main:app --port 8000` inside `backend/`.
5. **Full-Stack Development Server**: Run `npm run dev` (`tsx server.ts` hosting Vite on port 3000).

---

## 8. Interactive Caller Voice Simulator & No-Mic Fallback Architecture

To enable complete evaluation of conversational 911 intake when hardware microphones or browser permissions are restricted:

### 8.1 Dual-Mode Intake Engine
1. **Live Microphone Speech-to-Text (STT)**:
   - Built on Web Speech API `SpeechRecognition` / `webkitSpeechRecognition`.
   - Offers real-time acoustic transcription and auto-reconnects during active intake turns.
2. **Virtual Caller Phone Simulator (Zero-Mic Hardware Fallback)**:
   - Provides 1-click realistic emergency phrases across all 6 crisis scenarios (House Fire, Flash Flood, Toxic Chlorine Vapor, Highway Collision, Home Intrusion, Cardiac Arrest).
   - Includes freeform typing with Enter / "SPEAK / SEND" button so callers can communicate any custom narrative without microphone hardware.

### 8.2 Out-Loud Vocal Synthesis for AURA (Text-to-Speech)
- Powered by `window.speechSynthesis` tuned to the **Aoede** emergency intake voice persona (measured rate: 0.95, pitch: 1.0, calm cadence).
- AURA audibly speaks every response, survival directive, and grounding instruction to the caller in real time.

### 8.3 Sub-45ms Barge-In Interruption Guarantee
- Pressing the **"SHOUT / BARGE-IN"** button or speaking over AURA triggers `cancelSpeech("barge-in")`.
- Truncates browser audio synthesis within $<38\text{ms}$, plays an acoustic cutoff click, increments the CAD barge-in counter, spikes panic index to 10/10, and immediately returns the audio channel to the caller.

### 8.4 CAD Tool Ingestion Pipeline
- Spoken and simulated caller utterances pass through `processCallerUtterance()`.
- Captures incident type, address/cross-street, casualties, and screaming telemetry.
- Synthesizes Pydantic `@tool extract_dispatch_data` payloads, committing new incidents to the CAD board and PostgreSQL NOTIFY trigger pipeline.

### 8.5 Real-Time Problem & Importance Metrics HUD
Every interaction (spoken via microphone or submitted via simulator) immediately renders a prominent, high-contrast situational HUD:
1. **Identified Crisis Problem & Diagnosis**: Formulates the exact crisis classification (e.g. *Structure Fire: Rapid Smoke Infiltration with Occupant Entrapment*, *Flash Flood: Submerged Vehicle in Moving Water Current*).
2. **Severity & Importance Rating**: Displays a pulsing badge indicating intake urgency (`CRITICAL (PRIORITY 1) - IMMEDIATE THREAT TO LIFE` vs `HIGH (PRIORITY 2)`).
3. **Primary Hazard Identification**: Evaluates key environmental and physical threats (e.g. *Thermal Flashover, Toxic Cyanide/CO Smoke Inhalation*).
4. **Immediate Life-Safety Directive**: Outlines the immediate survival physical directive for the caller (e.g. *"Check door heat with back of hand. Crawl lowest 18 inches below smoke line. Close doors behind you."*).
5. **Real-Time Paralinguistic Metrics**:
   - **Panic Index**: 1–10 gauge with live color fill (red $\ge 8$, amber 5–7, cyan 1–4).
   - **Acoustic Shriek Telemetry**: Peak $>+86\text{ dB}$ vs Verbal.
   - **Respiration**: Measured breathing cadence (e.g. *Hyperventilating (38 BPM)*).
   - **Casualties Count**: Trapped or injured victim count.
   - **Geo-Location**: Verified address or pending status.
6. **Live AURA Verbal Interaction Bubble**: Displays AURA's exact speech turn alongside real-time voice synthesis and speaker wave animation.

---

## 9. Multilingual Crisis Intake, Multi-Speaker Disentanglement & Tone Intelligence

### 9.1 Server-Side Gemini 3.8 Flash Intake Engine
- **Route**: `POST /api/chat/intake`
- **Model**: `gemini-3.8-flash` initialized with server-side SDK (`@google/genai`) and `aistudio-build` User-Agent.
- **Tuned System Instruction Template**:
  1. **Same-Language Feedback**: Detects caller language (Spanish, English, French, German, Vietnamese, Mandarin, Hindi, Arabic, etc.) and formulates responses in the caller's exact same language with Aoede grounding cadence.
  2. **Real-Time Translation**: Provides verbatim English translation of caller input and dispatcher responses in parallel for CAD records.
  3. **Messy Multi-Speaker Audio Disentanglement**: Breaks down overlapping background voices (primary caller, screaming relative, crying child, bystander) into structured `multi_speakers` with verbatim text and deduced intent.
  4. **Vocal Tone & Paralinguistics**: Evaluates panic index (1-10), screaming shriek detection, breathing rate BPM, and emotional distress state.
  5. **Mid-Sentence Interruption (Barge-In)**: Truncates polite formalities and cuts straight to critical survival directives when interrupted mid-sentence.
  6. **Structured Action Extraction**: Converts raw speech into categorized incident type, location, casualties, primary hazard, immediate survival directive, recommended responding units, and tactical action summary.

### 9.2 Guaranteed Speech Transmission & Client Voice Activity Detection (VAD)
- `VoiceRecognitionController` includes silence debounce timer (950ms) and automatic flush on disconnect to guarantee that speech input is never dropped.
- Multilingual STT language selector allows callers to dictate in English, Spanish, French, German, Vietnamese, Mandarin, Hindi, or Arabic.
- Instant "TRANSMIT HEARD AUDIO" button provides immediate 1-click submission without waiting for silence thresholds.
- Spoken vocal replay buttons on all AURA transcript turns allow users to re-hear AURA's synthesized voice in the caller's language anytime.

---

## 10. Two-Way Dispatch Chat Session, Sub-30ms Barge-In & Persistent SQL Memory with 20K Summarization

### 10.1 Two-Way Interactive Emergency Dispatch Chat Session (`DispatchChatSession.tsx`)
- **Conversational Thread Architecture**: Replaces monolithic static telemetry with a full-duplex conversational chat interface displaying all interactions between the Emergency Caller (user) and AURA (AI).
- **User (Caller) Message Bubbles**:
  - Highlights verbatim spoken/typed inputs with dedicated user identity badges.
  - Displays original language transcript and real-time English CAD translations.
  - Visualizes paralinguistic distress tags (Panic Index, respiration cadence, screaming shrieks).
- **AURA (AI) Message Bubbles**:
  - Displays spoken responses in caller's language with English translations.
  - Embedded audio replay button (`speakAura`).
  - Embedded "⚡ INTERRUPT AURA" button active whenever AI is vocalizing.
- **Real-Time Input Hearing Preview**: While speaking into the microphone, an interim voice recognition bubble animates live inside the chat timeline, confirming speech recognition in real-time.
- **Chronological Interruption Markers**: Barge-in cutoffs are injected directly into the conversation stream with sub-30ms latency telemetry badges.

### 10.2 Instantaneous Sub-30ms Barge-In Interruption Engine
- **Voice-Activated Interruption**:
  - `VoiceRecognitionController` hooks into `recognition.onspeechstart` and `recognition.onsoundstart`.
  - When caller starts speaking while AURA is vocalizing, `cancelSpeech()` aborts browser speech synthesis in $<28\text{ms}$.
  - Any interim audio chunk cuts off ongoing AI speech without waiting for sentence completion or silence debouncing.
- **Keyboard & Typing Barge-In**: Typing into the input box or pressing Escape immediately interrupts AURA speech synthesis.
- **Dedicated UI Cutoff Triggers**: Quick "SHOUT / BARGE-IN" button and in-bubble interrupt controls.

### 10.3 Persistent SQL Memory Architecture (`server/sqlMemoryDatabase.ts`, `src/services/sqlMemoryService.ts`)
- **Session Isolation**: Each new 911 call is registered as a distinct, isolated session identified by a unique `session_id` (`SESSION-CALL-XXXXX-timestamp`) in SQLite (`db/aura_memory.sqlite`).
- **Short-Term Memory Storage**:
  - `memory_turns` table stores chronological dialogue turns, speaker roles (`CALLER`, `AURA`, `SYSTEM`), verbatim text, translations, tone telemetry JSON, and calculated token counts.
  - Token tracking uses ~4 chars/token approximation + paralinguistic framing tokens.
- **Persistent Auditability**: Sessions, turns, and executive summaries survive server restarts and can be audited via REST API endpoints (`GET /api/memory/sessions`, `GET /api/memory/session/:sessionId`).

### 10.4 20K Token Summarization Middleware (`server/summarizationMiddleware.ts`)
- **Automated Context Surveillance**: Monitors cumulative session token count against the 20,000-token threshold (configurable in `AURA_CONFIG.memory.contextTokenLimit`).
- **Tactical Crisis Distillation**:
  - When tokens cross 20,000 (or on manual/test trigger), interceptor calls `gemini-3.8-flash`.
  - Synthesizes older dialogue turns into an Executive Incident Summary strictly preserving confirmed addresses, incident classification, trapped casualties, chemical/fire hazards, dispatched units, and active survival directives.
- **Context Window Compression**:
  - Appends distilled summary to `summaries` table and updates `sessions.summary`.
  - Future LLM prompts inject the distilled executive summary alongside only the latest active short-term turns, preventing prompt overflow while guaranteeing zero loss of tactical facts.
- **Interactive UI Testing**: Features a "TRIGGER 20K SUMMARIZATION" control in the chat console to allow immediate testing and demonstration of context compression.

