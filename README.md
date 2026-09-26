# AURA (Autonomous Urgent Response Agent)
### Production-Grade Crisis Dispatch Co-Pilot

AURA is an autonomous emergency 911 intake and dispatch co-pilot designed to act as the first line of defense for chaotic, high-stakes emergency calls (structure fires, flash floods, active shooter incidents, industrial chemical leaks). 

Using real-time bidirectional voice AI powered by **Google ADK (Agent Development Kit)** and the **`gemini-3.8-live`** model, AURA evaluates raw caller audio, detects paralinguistic panic indicators (screaming, hyperventilation, background sirens/water/fire), supports native caller barge-in interruption, extracts strictly validated survival reports, and streams them with sub-millisecond latency to human dispatchers via **native PostgreSQL `LISTEN`/`NOTIFY` triggers** (zero Redis dependency).

---

## Architecture Diagram

```
[ Panicked Caller (Mic) ]
           │
           │  16kHz Raw PCM Audio (WebSocket)
           ▼
[ FastAPI: /ws/audio/{call_id} ]
           │
           │  google-adk LiveClient
           ▼
[ Gemini 3.8 Live ('gemini-3.8-live') ]
   ├── Paralinguistic Tone Assessment (Panic Index 1-10, Breathing BPM, Screams)
   ├── Full-Duplex Audio & Barge-In Detection (< 45ms playback cutoff)
   └── ADK @tool extract_dispatch_data(report: DispatchReport)
           │
           │  Strict Pydantic Validation & INSERT
           ▼
[ PostgreSQL Database ]
   └── Trigger: AFTER INSERT ON incidents -> pg_notify('dispatch_events', JSON)
           │
           │  asyncpg LISTEN worker (< 1.2ms latency)
           ▼
[ FastAPI: /api/events/dashboard (SSE) ]
           │
           │  Server-Sent Events (Zero Redis)
           ▼
[ Next.js / React Mission Control Dashboard ]
   ├── Real-Time Incident Triage Feed (no page reload)
   ├── Acoustic Waveform & Barge-In Monitor
   └── Tactical First Responder Unit Dispatch (Fire, EMS, Swiftwater, Hazmat)
```

---

## Key Features

1. **Bidirectional Voice & Native Barge-in Interruption**
   - Direct full-duplex audio session via ADK's `LiveClient`.
   - If the caller screams, interrupts, or changes situational facts, AURA halts audio synthesis within 45ms and immediately resumes active intake.
2. **Paralinguistic Tone Assessment**
   - Continuously evaluates non-verbal acoustic distress markers (vocal tremor, high-frequency shrieks, agonal breathing, hyperventilation BPM) to compute a dynamic `panic_index` (1–10).
   - Automatically executes psychological grounding protocols when breathing exceeds 30 BPM or panic score $\ge 8$.
3. **Structured JSON Survival Extraction**
   - Uses strict Pydantic models (`DispatchReport`) to extract:
     - `incident_type` (e.g., *Structure Fire - Trapped Residents*)
     - `location` (e.g., *442 Industrial Parkway, Sector 4*)
     - `panic_index` ($1 \le x \le 10$)
     - `casualties` ($\ge 0$)
     - `tone_assessment` (screaming detection, breathing pattern, background hazards)
     - `recommended_units` (auto-assigned squads)
4. **Native PostgreSQL Pub/Sub Architecture**
   - High-throughput pub/sub directly inside Postgres using `AFTER INSERT` triggers and `pg_notify`.
   - Eliminates Redis and message-broker bloat, providing sub-millisecond dispatch ingestion.
5. **Tactical Dark-Mode Command Center**
   - Next.js / React dashboard adhering to tactical emergency control-room standards.
   - Live waveform monitors, casualty telemetry, geo-location mapping, and 1-click squad deployment controls.
6. **AI Suggested Situational Response Engine**
   - Generates contextual, incident-specific survival and tactical intelligence questions for dispatchers to ask callers.
   - Categorized across `[SAFETY]`, `[TACTICAL INTEL]`, `[GROUNDING]`, and `[HAZARD AVOIDANCE]` with tactical rationales and CAD action cues.
   - Includes 1-click **"Transmit to Caller"** audio feed broadcasting, verbatim **"Copy"**, and dynamic **"Ask AI"** custom observation synthesis.

---

## Folder Structure

```
├── backend/
│   ├── app/
│   │   ├── agent/
│   │   │   ├── adk_client.py     # ADK LiveClient initialization with gemini-3.8-live & barge-in
│   │   │   ├── tools.py          # Pydantic DispatchReport model & @tool extract_dispatch_data
│   │   │   └── prompts.py        # System instructions & paralinguistic tone guidelines
│   │   ├── api/
│   │   │   ├── ws_audio.py       # WebSocket endpoint for raw browser audio streaming
│   │   │   └── sse_dashboard.py  # Server-Sent Events (SSE) route for live dashboard updates
│   │   ├── database.py           # asyncpg connection pool & dedicated Postgres LISTEN listener
│   │   └── main.py               # FastAPI server entrypoint
│   └── requirements.txt          # Python backend dependencies
├── db/
│   └── init.sql                  # PostgreSQL schema, notify function & AFTER INSERT trigger
├── frontend/
│   └── src/app/dashboard/
│       ├── page.tsx              # Next.js command center UI with dark mission-control styling
│       └── use-sse.ts            # React hook for auto-reconnecting SSE stream
├── server.ts                     # Full-stack Express server with SSE, Vite middleware, & REST APIs
└── src/
    └── App.tsx                   # Interactive mission-control UI & live audio simulator
```

---

## System Instructions (Prompting)

The ADK `LiveConfig` system instruction is strictly defined as:

```text
"You are AURA, an emergency intake AI. Stay calm, grounded, and concise. 
Your goal is to extract the LOCATION, INCIDENT TYPE, and NUMBER OF CASUALTIES from panicked callers. 
If the caller interrupts, stop speaking. If they are hyperventilating, use grounding techniques. 
Execute the extract_dispatch_data tool immediately once you have the facts. Do not announce tool usage."
```

---

## Database Schema & Trigger (`/db/init.sql`)

```sql
-- Incidents table for 911 intake records
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id VARCHAR(64) NOT NULL,
    incident_type VARCHAR(100) NOT NULL,
    location TEXT NOT NULL,
    panic_index INT NOT NULL CHECK (panic_index >= 1 AND panic_index <= 10),
    casualties INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'NEW_INTAKE',
    caller_summary TEXT,
    tone_assessment JSONB,
    recommended_units TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sub-millisecond Notification Trigger Function
CREATE OR REPLACE FUNCTION notify_dispatch_incident()
RETURNS TRIGGER AS $$
DECLARE
    payload JSONB;
BEGIN
    payload = jsonb_build_object(
        'event', 'NEW_DISPATCH_REPORT',
        'timestamp', EXTRACT(EPOCH FROM NOW()),
        'data', row_to_json(NEW)
    );
    PERFORM pg_notify('dispatch_events', payload::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach Trigger to Table
DROP TRIGGER IF EXISTS trg_notify_dispatch_incident ON incidents;
CREATE TRIGGER trg_notify_dispatch_incident
AFTER INSERT ON incidents
FOR EACH ROW EXECUTE FUNCTION notify_dispatch_incident();
```

---

## Getting Started

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **Python**: v3.11 or higher
- **PostgreSQL**: v14 or higher
- **Gemini API Key**: Configured with access to `gemini-3.8-live`

### 2. Environment Variables
Create a `.env` file in the root directory:
```env
GEMINI_API_KEY="your-gemini-api-key"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/aura_dispatch"
PORT=3000
```

### 3. Database Initialization
```bash
psql -U postgres -d aura_dispatch -f db/init.sql
```

### 4. Running the Python Backend (FastAPI + ADK)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 5. Running the Frontend & Mission Control Dashboard
```bash
# In the project root
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the live dashboard.

---

## WebSocket & SSE API Reference

| Protocol | Endpoint | Description |
| :--- | :--- | :--- |
| **WebSocket** | `/ws/audio/{call_id}` | Full-duplex raw 16kHz PCM audio pipe with ADK `LiveClient` and barge-in cutoffs |
| **SSE** | `/api/events/dashboard` | Sub-millisecond incident push notification channel from PostgreSQL `NOTIFY` |
| **HTTP GET** | `/api/incidents` | Retrieves historical 911 intake incident records |
| **HTTP POST** | `/api/dispatch` | Ingestion endpoint triggering the PostgreSQL `NOTIFY` broadcast |

---

## License
Apache-2.0
