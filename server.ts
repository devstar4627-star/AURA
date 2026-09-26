import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;

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

  // Mount Vite or serve static files
  if (!isProduction) {
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
