import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ShieldAlert,
  Flame,
  Radio,
  Activity,
  AlertTriangle,
  Volume2,
  VolumeX,
  Users,
  MapPin,
  Clock,
  Sparkles,
  CheckCircle2,
  Database,
  Truck,
  ArrowUpRight,
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  BellRing,
  Code2,
  Terminal,
  Zap,
  ChevronRight,
  Send,
  Layers,
  FileCode,
  Copy,
  Check,
  Info,
  Maximize2,
  Waves,
  HeartPulse,
  Compass,
  Siren,
  Bot,
  MessageSquareQuote,
  RefreshCw,
  HelpCircle,
  Lightbulb,
  SlidersHorizontal
} from "lucide-react";
import { InteractiveCallerSimulator } from "./components/InteractiveCallerSimulator";

// Web Audio API Synthesizer for tactical dispatch chirps and tones
class TacticalAudio {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private init() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  // 911 Dispatch Alert Warble (Two-tone alert)
  playDispatchChime() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(850, now);
      osc.frequency.setValueAtTime(1100, now + 0.12);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch {
      // AudioContext policy fallback
    }
  }

  // Barge-in Interrupt click / cut tone
  playBargeInClick() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "square";
      osc.frequency.setValueAtTime(1600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {}
  }

  // Unit Deployed Radio Chirp
  playRadioChirp() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.setValueAtTime(1550, now + 0.06);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch {}
  }
}

const audioFX = new TacticalAudio();

export interface IncidentRecord {
  id: string;
  call_id: string;
  incident_type: string;
  location: string;
  panic_index: number;
  casualties: number;
  status: "NEW_INTAKE" | "UNITS_DISPATCHED" | "EN_ROUTE" | "ON_SCENE" | "STABILIZED";
  priority: "CRITICAL" | "HIGH" | "ROUTINE";
  caller_summary?: string;
  tone_assessment?: {
    screaming_detected: boolean;
    breathing_rate: string;
    background_noise: string;
    peak_db?: number;
  };
  recommended_units: string[];
  created_at: string;
  timeline?: { time: string; text: string; speaker: "CALLER" | "AURA" | "SYSTEM" }[];
}

// Preset Emergency Caller Scenarios
interface CrisisScenario {
  id: string;
  title: string;
  incidentType: string;
  location: string;
  callerQuote: string;
  panicIndex: number;
  casualties: number;
  breathing: string;
  screaming: boolean;
  backgroundNoise: string;
  units: string[];
  dialogue: { speaker: "CALLER" | "AURA" | "SYSTEM"; text: string; delayMs: number; isBargeIn?: boolean }[];
}

const CRISIS_SCENARIOS: CrisisScenario[] = [
  {
    id: "fire-trapped",
    title: "Structure Fire - Multi-Story Residential",
    incidentType: "Structure Fire - Trapped Residents",
    location: "442 Industrial Parkway, Sector 4",
    callerQuote: "HELP ME! THE SMOKE IS BLACK! MY BABIES ARE IN THE BEDROOM!",
    panicIndex: 9,
    casualties: 3,
    breathing: "Hyperventilating (38 BPM)",
    screaming: true,
    backgroundNoise: "Structural wood collapse, screaming fire alarm",
    units: ["Engine 12", "Ladder 4", "Medic 2", "Battalion 1"],
    dialogue: [
      { speaker: "CALLER", text: "HELP ME! THE STAIRS ARE ON FIRE! THE SMOKE IS BLACK! MY KIDS ARE TRAPPED ON THE SECOND FLOOR!", delayMs: 400 },
      { speaker: "AURA", text: "I hear you, stay with me. This is AURA 911 dispatch. Where are you located?", delayMs: 2200 },
      { speaker: "CALLER", text: "442 Industrial Parkway! Sector 4! Please hurry, the ceiling is cracking!", delayMs: 3800 },
      { speaker: "AURA", text: "I have 442 Industrial Parkway. Close the bedroom door and put a towel or cloth at the bottom—", delayMs: 5200 },
      { speaker: "CALLER", text: "THE WINDOW WON'T OPEN! THEY CAN'T BREATHE, WE'RE CHOKING!", delayMs: 6400, isBargeIn: true },
      { speaker: "SYSTEM", text: "[BARGE-IN TRIGGERED] Caller voice energy peak (+86dB) cut off AI speech. Audio buffer switched to active intake.", delayMs: 6500 },
      { speaker: "AURA", text: "I am with you. Do not jump. Engine 12 and Ladder 4 are en route with high-reach rescue ladders right now.", delayMs: 7800 },
      { speaker: "SYSTEM", text: "[ADK TOOL FIRED] extract_dispatch_data({ incident_type: 'Structure Fire - Trapped Residents', location: '442 Industrial Parkway, Sector 4', panic_index: 9, casualties: 3 })", delayMs: 8200 },
      { speaker: "SYSTEM", text: "[POSTGRES TRIGGER] trg_notify_dispatch_incident() executed -> pg_notify('dispatch_events') [1.1ms]", delayMs: 8300 }
    ]
  },
  {
    id: "flash-flood",
    title: "Flash Flood - Vehicle Submerged Underpass",
    incidentType: "Flash Flood - Vehicle Submersion",
    location: "Creek Road & 5th Avenue Underpass",
    callerQuote: "WATER IS COMING THROUGH THE WINDOWS! MY CAR IS FLOATING!",
    panicIndex: 8,
    casualties: 1,
    breathing: "Rapid Gasping (32 BPM)",
    screaming: true,
    backgroundNoise: "Torrential rushing water surge, engine dying",
    units: ["Swiftwater 7", "Rescue 3", "Boat 1", "Medic 4"],
    dialogue: [
      { speaker: "CALLER", text: "The water swept my sedan off the road! It's up to my chest inside the car!", delayMs: 500 },
      { speaker: "AURA", text: "This is AURA emergency dispatch. What is your exact location?", delayMs: 2000 },
      { speaker: "CALLER", text: "Under the Creek Road bridge at 5th Avenue underpass! The current is pulling the car!", delayMs: 3600 },
      { speaker: "AURA", text: "Unbuckle your seatbelt right now. Can you roll down or break the window?", delayMs: 5000 },
      { speaker: "CALLER", text: "I CAN'T OPEN THE DOOR THE PRESSURE IS TOO STRONG OH GOD!", delayMs: 6200, isBargeIn: true },
      { speaker: "SYSTEM", text: "[BARGE-IN TRIGGERED] Immediate caller voice detection. AI playback halted in 42ms.", delayMs: 6300 },
      { speaker: "AURA", text: "Roll down the window now. Climb onto the roof of your vehicle. Swiftwater Rescue 7 is rolling.", delayMs: 7600 },
      { speaker: "SYSTEM", text: "[ADK TOOL FIRED] extract_dispatch_data({ incident_type: 'Flash Flood - Vehicle Submersion', location: 'Creek Road & 5th Avenue Underpass', panic_index: 8, casualties: 1 })", delayMs: 8000 }
    ]
  },
  {
    id: "chemical-hazmat",
    title: "Industrial Chemical Spill - Chlorine Vapor Plume",
    incidentType: "Toxic Vapor Cloud / Hazmat Hazard",
    location: "Bay 14 Logistics Complex, Dock 8",
    callerQuote: "Forklift ruptured a pressurized tank. Yellow gas everywhere! People collapsed!",
    panicIndex: 9,
    casualties: 4,
    breathing: "Severe Coughing / Agonal Wheeze",
    screaming: false,
    backgroundNoise: "High-pressure hissing gas, automated sirens",
    units: ["Hazmat 9", "Decon 2", "Engine 8", "ALS Ambulance 3"],
    dialogue: [
      { speaker: "CALLER", text: "*Coughing violently* Forklift speared a 500-gallon cylinder... yellow green vapor everywhere... my coworker passed out!", delayMs: 500 },
      { speaker: "AURA", text: "Listen carefully: evacuate upwind immediately. What is the address and dock number?", delayMs: 2200 },
      { speaker: "CALLER", text: "Bay 14 logistics... Dock 8! My eyes are burning, I can't see!", delayMs: 3800 },
      { speaker: "AURA", text: "Cover your nose and mouth with your shirt. Move north toward the wind. How many people are down?", delayMs: 5300 },
      { speaker: "CALLER", text: "At least four in the loading bay! We can't drag them out without masks!", delayMs: 6800, isBargeIn: true },
      { speaker: "SYSTEM", text: "[BARGE-IN TRIGGERED] Audio stream prioritized. AI interrupted.", delayMs: 6900 },
      { speaker: "AURA", text: "Do not re-enter the vapor cloud. Hazmat 9 and Decontamination units are en route with breathing apparatus.", delayMs: 8200 },
      { speaker: "SYSTEM", text: "[ADK TOOL FIRED] extract_dispatch_data({ incident_type: 'Toxic Vapor Cloud / Hazmat Hazard', location: 'Bay 14 Logistics Complex, Dock 8', panic_index: 9, casualties: 4 })", delayMs: 8500 }
    ]
  },
  {
    id: "highway-pileup",
    title: "Interstate 101 Multi-Car Pileup - Rollover & Fuel Spill",
    incidentType: "High-Speed Multi-Vehicle Collision",
    location: "I-101 Northbound at Mile Marker 142",
    callerQuote: "Semi-truck jackknifed and crushed three cars! There's gasoline pouring out!",
    panicIndex: 8,
    casualties: 5,
    breathing: "Elevated Shaky (28 BPM)",
    screaming: true,
    backgroundNoise: "Highway horns, metal groaning, rushing traffic",
    units: ["Heavy Rescue 2", "Engine 5", "Medic 6", "Medic 7", "Highway Patrol"],
    dialogue: [
      { speaker: "CALLER", text: "Massive pileup on Highway 101 North! A semi flipped and hit three SUVs!", delayMs: 400 },
      { speaker: "AURA", text: "AURA intake received. Confirm your nearest mile marker or exit.", delayMs: 2000 },
      { speaker: "CALLER", text: "Just passed Mile Marker 142! One driver is pinned inside a crushed sedan!", delayMs: 3500 },
      { speaker: "AURA", text: "Are there signs of fire or fuel spill?", delayMs: 4900 },
      { speaker: "CALLER", text: "YES! THE TANK RUPTURED, DIESEL IS RUNNING ACROSS ALL THREE LANES!", delayMs: 6100, isBargeIn: true },
      { speaker: "SYSTEM", text: "[BARGE-IN TRIGGERED] AI turn aborted upon caller screaming 'DIESEL'.", delayMs: 6200 },
      { speaker: "AURA", text: "Keep all bystanders behind the guardrail away from sparks. Heavy Rescue 2 and two Medic units dispatched.", delayMs: 7500 },
      { speaker: "SYSTEM", text: "[ADK TOOL FIRED] extract_dispatch_data({ incident_type: 'High-Speed Multi-Vehicle Collision', location: 'I-101 Northbound at Mile Marker 142', panic_index: 8, casualties: 5 })", delayMs: 7900 }
    ]
  }
];

export interface SuggestedQuestion {
  id: string;
  category: "SAFETY" | "TACTICAL" | "GROUNDING" | "HAZARD";
  urgency: "CRITICAL" | "HIGH" | "ROUTINE";
  question: string;
  rationale: string;
  recommendedAction: string;
}

export function generateSituationalQuestions(
  incidentType: string,
  panicIndex: number,
  casualties: number,
  location: string
): SuggestedQuestion[] {
  const inc = (incidentType || "").toLowerCase();
  const questions: SuggestedQuestion[] = [];

  // Grounding if caller panic index is elevated/critical
  if (panicIndex >= 8) {
    questions.push({
      id: "ground-01",
      category: "GROUNDING",
      urgency: "CRITICAL",
      question: "Take one breath with me right now. You are doing great. Keep the phone to your ear. Rescue crews have their sirens on and are rolling toward you right now.",
      rationale: "Disrupts acute panic hyperventilation, anchors caller attention, and ensures they do not hang up or freeze.",
      recommendedAction: "Use calm, firm downward inflection. Pause 2 seconds for compliance."
    });
  }

  if (inc.includes("fire") || inc.includes("smoke") || inc.includes("burn") || inc.includes("flame")) {
    questions.push(
      {
        id: "fire-01",
        category: "SAFETY",
        urgency: "CRITICAL",
        question: "Feel any doors with the back of your hand before touching the knob. Are they hot? If hot, DO NOT open them. Can you seal the gap beneath the door with blankets or clothing?",
        rationale: "Prevents backdraft flashover and superheated gas ingestion; establishes survivable refuge space.",
        recommendedAction: "Instruct caller to retreat to window and close interior doors."
      },
      {
        id: "fire-02",
        category: "TACTICAL",
        urgency: "HIGH",
        question: "Which side of the building is your window on—street side or alley? Can you wave a bright shirt or flashlight out the window?",
        rationale: "Guides Ladder 4 aerial platform directly to the target window, eliminating exterior recon delay.",
        recommendedAction: "Relay exact window side and floor height to inbound Battalion Chief."
      },
      {
        id: "fire-03",
        category: "HAZARD",
        urgency: "HIGH",
        question: "Are there propane barbecue tanks, home oxygen cylinders, or solar battery arrays near the fire?",
        rationale: "Alerts interior fire attack crews to explosive BLEVE hazards before breach.",
        recommendedAction: "Flag secondary explosive hazard on tactical CAD dispatch screen."
      },
      {
        id: "fire-04",
        category: "SAFETY",
        urgency: "HIGH",
        question: "Drop to your hands and knees immediately. Crawl beneath the smoke line. The lowest 18 inches contain breathable air.",
        rationale: "Carbon monoxide and cyanide gases rise rapidly; oxygen remains concentrated at floor level.",
        recommendedAction: "Verify caller has dropped to floor level."
      }
    );
  } else if (inc.includes("flood") || inc.includes("water") || inc.includes("submerg") || inc.includes("drown") || inc.includes("river")) {
    questions.push(
      {
        id: "flood-01",
        category: "SAFETY",
        urgency: "CRITICAL",
        question: "Unbuckle your seatbelt right now. Can you roll down or break the side window before electrical systems short out?",
        rationale: "Interior hydrostatic pressure locks vehicle doors until cabin fully floods; window exit is the sole escape path.",
        recommendedAction: "Direct caller to escape through side window onto roof immediately."
      },
      {
        id: "flood-02",
        category: "SAFETY",
        urgency: "CRITICAL",
        question: "Climb onto the roof or trunk of the car. Do NOT step into the moving water current.",
        rationale: "Just 6 inches of fast-moving water sweeps adults off their feet, pulling them into debris and undercurrents.",
        recommendedAction: "Alert Swiftwater 7 to deploy tethered rescue boat and throw bags."
      },
      {
        id: "flood-03",
        category: "TACTICAL",
        urgency: "HIGH",
        question: "Is your vehicle pinned stationary against a tree or guardrail, or is it drifting downstream?",
        rationale: "Determines whether an upstream anchor rescue or downstream intercept capture is required.",
        recommendedAction: "Calculate water drift velocity and alert downstream bridge spotters."
      },
      {
        id: "flood-04",
        category: "HAZARD",
        urgency: "HIGH",
        question: "Are there downed electrical poles or power lines touching or near the water surface?",
        rationale: "Water conducts high-voltage lethal electrical charge over a 100+ foot radius.",
        recommendedAction: "Contact electrical utility grid operations for immediate substation grid isolation."
      }
    );
  } else if (inc.includes("chem") || inc.includes("vapor") || inc.includes("toxic") || inc.includes("gas") || inc.includes("leak") || inc.includes("hazmat") || inc.includes("chlorine")) {
    questions.push(
      {
        id: "chem-01",
        category: "SAFETY",
        urgency: "CRITICAL",
        question: "Evacuate upwind and uphill immediately. Look around—which direction is the wind blowing the yellow or white vapor relative to you?",
        rationale: "Heavy industrial toxic vapors hug the ground and move downwind; uphill/upwind path is life-saving.",
        recommendedAction: "Establish a 1,500-foot hot zone isolation perimeter immediately."
      },
      {
        id: "chem-02",
        category: "TACTICAL",
        urgency: "HIGH",
        question: "Can you see a 4-digit UN chemical placard number or colored diamond symbol on the drum or tanker?",
        rationale: "Identifies the exact compound to deploy correct neutralizing foam and level-A Hazmat suits.",
        recommendedAction: "Cross-reference Emergency Response Guidebook (ERG) guide number."
      },
      {
        id: "chem-03",
        category: "SAFETY",
        urgency: "HIGH",
        question: "Do NOT go back inside to rescue others without breathing apparatus. Are you coughing violently or experiencing burning eyes?",
        rationale: "Prevents rescuer casualties and provides inbound EMS with acute exposure symptoms.",
        recommendedAction: "Dispatch Decon Unit 2 and prepare sterile eye irrigation stations."
      }
    );
  } else if (inc.includes("crash") || inc.includes("collision") || inc.includes("pileup") || inc.includes("vehicle") || inc.includes("traffic")) {
    questions.push(
      {
        id: "crash-01",
        category: "SAFETY",
        urgency: "CRITICAL",
        question: "If you can safely walk, get behind the metal highway guardrail off the roadway immediately. Do NOT stand between cars.",
        rationale: "Secondary vehicle collisions at high speeds cause over 55% of highway scene fatalities.",
        recommendedAction: "Dispatch Highway Patrol to initiate full approaching lane rolling roadblock."
      },
      {
        id: "crash-02",
        category: "TACTICAL",
        urgency: "HIGH",
        question: "Is anyone trapped or pinned under dashboard metal or steering column? Are doors jammed shut?",
        rationale: "Confirms whether Heavy Rescue hydraulic spreaders ('jaws of life') are required for extrication.",
        recommendedAction: "Authorize hydraulic extrication crew pre-stage on arrival."
      },
      {
        id: "crash-03",
        category: "HAZARD",
        urgency: "HIGH",
        question: "Do you see smoking engine compartments, spilled fuel pools, or electric vehicle high-voltage orange cables?",
        rationale: "Lithium battery thermal runaway and fuel vapors create explosive fire hazards.",
        recommendedAction: "Dispatch Foam Tender & Engine 5 with continuous water supply line."
      }
    );
  } else if (inc.includes("medical") || inc.includes("cardiac") || inc.includes("breathing") || inc.includes("heart") || inc.includes("unconscious")) {
    questions.push(
      {
        id: "med-01",
        category: "SAFETY",
        urgency: "CRITICAL",
        question: "Is the patient awake and answering you? Put your ear to their mouth—are they breathing normally or gasping?",
        rationale: "Agonal gasping is often mistaken for normal breathing; indicates immediate cardiac arrest.",
        recommendedAction: "Prepare caller for hands-only CPR coaching immediately."
      },
      {
        id: "med-02",
        category: "TACTICAL",
        urgency: "CRITICAL",
        question: "Place the heel of your hand on the center of their chest between the nipples. Push down 2 inches deep, fast—two pumps per second.",
        rationale: "Immediate hands-only CPR doubles or triples survival before Advanced Life Support arrives.",
        recommendedAction: "Count cadence aloud to keep caller in rhythm: 1, 2, 3, 4."
      },
      {
        id: "med-03",
        category: "TACTICAL",
        urgency: "HIGH",
        question: "Is there an Automated External Defibrillator (AED) in the building? Send someone to grab it right now.",
        rationale: "Early defibrillation within 3 minutes delivers >70% shock conversion rate.",
        recommendedAction: "Instruct runner to open AED and press green power button."
      }
    );
  } else if (inc.includes("shooter") || inc.includes("gun") || inc.includes("weapon") || inc.includes("violence") || inc.includes("assault")) {
    questions.push(
      {
        id: "viol-01",
        category: "SAFETY",
        urgency: "CRITICAL",
        question: "Are you in a lockable room? Lock the door, barricade it with heavy furniture, turn off lights, and silence your phone.",
        rationale: "Denial protocol (Run, Hide, Fight) minimizes visual target acquisition and acoustic tracking.",
        recommendedAction: "Advise caller to whisper or text if speaking becomes dangerous."
      },
      {
        id: "viol-02",
        category: "TACTICAL",
        urgency: "HIGH",
        question: "Did you see the person's physical description, clothing, or weapon type? Which hallway or exit were they heading toward?",
        rationale: "Enables tactical police teams to establish perimeter containment and direct active entry.",
        recommendedAction: "Broadcast suspect description (BOLO) across tactical law enforcement channels."
      }
    );
  } else {
    // General Crisis Intake
    questions.push(
      {
        id: "gen-01",
        category: "SAFETY",
        urgency: "CRITICAL",
        question: "Are you in immediate physical danger where you are standing right now? Can you safely step back 50 feet?",
        rationale: "Determines if caller needs active flight evacuation or shelter-in-place instructions.",
        recommendedAction: "Guide caller to closest safe structural exit."
      },
      {
        id: "gen-02",
        category: "TACTICAL",
        urgency: "HIGH",
        question: "How many people are injured or trapped in your immediate area needing medical triage?",
        rationale: "Quantifies Mass Casualty Incident (MCI) triage requirements for EMS dispatch staging.",
        recommendedAction: "Stage multi-patient EMS triage bus if casualties > 2."
      }
    );
  }

  // Casualty specific follow-up question
  if (casualties > 0) {
    questions.push({
      id: "cas-01",
      category: "TACTICAL",
      urgency: "HIGH",
      question: `You reported ${casualties} injured person(s). Is anyone bleeding heavily from wounds? Can you apply firm direct pressure with clean cloth?`,
      rationale: "Severe arterial hemorrhage can be fatal in under 3 minutes; bystander direct pressure is critical life support.",
      recommendedAction: "Instruct caller to maintain continuous firm pressure without lifting cloth to check."
    });
  }

  return questions;
}

export default function App() {
  // Main Incidents State
  const [incidents, setIncidents] = useState<IncidentRecord[]>([
    {
      id: "inc-001",
      call_id: "CALL-99124",
      incident_type: "Structure Fire - Trapped Residents",
      location: "442 Industrial Parkway, Sector 4",
      panic_index: 9,
      casualties: 3,
      status: "UNITS_DISPATCHED",
      priority: "CRITICAL",
      caller_summary: "Call disconnected after reporting heavy smoke and 3 children on second floor balcony.",
      tone_assessment: {
        screaming_detected: true,
        breathing_rate: "Hyperventilating (38 BPM)",
        background_noise: "Structural wood collapse, screaming fire alarm",
        peak_db: 88
      },
      recommended_units: ["Engine 12", "Ladder 4", "Medic 2", "Battalion 1"],
      created_at: new Date(Date.now() - 1000 * 180).toISOString(),
      timeline: [
        { time: "02:08:12", speaker: "CALLER", text: "HELP ME! THE SMOKE IS BLACK! MY BABIES ARE IN THE BEDROOM!" },
        { time: "02:08:14", speaker: "AURA", text: "I hear you, stay with me. This is AURA 911 dispatch. Where are you located?" },
        { time: "02:08:17", speaker: "CALLER", text: "442 Industrial Parkway! Sector 4!" },
        { time: "02:08:19", speaker: "SYSTEM", text: "[BARGE-IN DETECTED] Caller shriek interrupted AI advice. Channel cleared." },
        { time: "02:08:21", speaker: "AURA", text: "Engine 12 and Ladder 4 are rolling. Stay near the window low to the floor." }
      ]
    },
    {
      id: "inc-002",
      call_id: "CALL-99118",
      incident_type: "Flash Flood - Vehicle Submersion",
      location: "Creek Road & 5th Avenue Underpass",
      panic_index: 8,
      casualties: 1,
      status: "EN_ROUTE",
      priority: "CRITICAL",
      caller_summary: "Sedan swept into retention basin by flash flood. Driver climbed onto roof screaming for rope.",
      tone_assessment: {
        screaming_detected: true,
        breathing_rate: "Rapid Gasping (32 BPM)",
        background_noise: "Torrential water surge",
        peak_db: 84
      },
      recommended_units: ["Swiftwater 7", "Rescue 3", "Boat 1"],
      created_at: new Date(Date.now() - 1000 * 360).toISOString()
    },
    {
      id: "inc-003",
      call_id: "CALL-99105",
      incident_type: "Toxic Vapor Cloud / Hazmat Hazard",
      location: "Bay 14 Logistics Complex, Dock 8",
      panic_index: 7,
      casualties: 0,
      status: "ON_SCENE",
      priority: "HIGH",
      caller_summary: "Forklift punctured 500-gal chlorine cylinder. Facility evacuated north upwind.",
      tone_assessment: {
        screaming_detected: false,
        breathing_rate: "Elevated Wheeze",
        background_noise: "Warehouse machinery, hiss",
        peak_db: 72
      },
      recommended_units: ["Hazmat 9", "Engine 8", "Decon 1"],
      created_at: new Date(Date.now() - 1000 * 720).toISOString()
    }
  ]);

  // Selected Incident for Right-side Triage
  const [selectedIncident, setSelectedIncident] = useState<IncidentRecord>(incidents[0]);
  const [filterPriority, setFilterPriority] = useState<string>("ALL");
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Active Call Simulator State
  const [activeCall, setActiveCall] = useState<{
    scenario: CrisisScenario;
    stepIndex: number;
    callId: string;
    isMuted: boolean;
    bargeInCount: number;
    liveTranscript: { speaker: "CALLER" | "AURA" | "SYSTEM"; text: string; isBargeIn?: boolean }[];
    currentPanic: number;
    isAiSpeaking: boolean;
    callerVolumeLevel: number;
  } | null>(null);

  // Real Microphone Stream State
  const [isMicActive, setIsMicActive] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [micPanicScore, setMicPanicScore] = useState(3);
  const [micBargeInTriggered, setMicBargeInTriggered] = useState(false);
  const [micTranscript, setMicTranscript] = useState<{ speaker: "USER" | "AURA" | "SYSTEM"; text: string }[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Architecture & Code Inspector Modal
  const [showCodeInspector, setShowCodeInspector] = useState(false);
  const [selectedCodeFile, setSelectedCodeFile] = useState<string>("adk_client");

  // SSE Live Connection Simulation
  const [sseLatency, setSseLatency] = useState(1.1);
  const [lastEventBadge, setLastEventBadge] = useState<string | null>(null);
  const timerRef = useRef<any>(null);

  // Grounding Technique Active Indicator
  const [groundingActive, setGroundingActive] = useState(false);

  // AI Suggested Responses State
  const [copiedQuestionId, setCopiedQuestionId] = useState<string | null>(null);
  const [transmittedQuestionId, setTransmittedQuestionId] = useState<string | null>(null);
  const [selectedQuestionCategory, setSelectedQuestionCategory] = useState<string>("ALL");
  const [customQuestionPrompt, setCustomQuestionPrompt] = useState<string>("");
  const [isGeneratingCustom, setIsGeneratingCustom] = useState(false);
  const [customQuestions, setCustomQuestions] = useState<Record<string, SuggestedQuestion[]>>({});
  const [simulatorTransmittedQuestion, setSimulatorTransmittedQuestion] = useState<string | null>(null);

  const handleSimulatorDispatchReport = async (reportArgs: any) => {
    console.info("[APP] handleSimulatorDispatchReport received:", reportArgs);
    const isCrit = (reportArgs.importance && reportArgs.importance.includes("CRITICAL")) || reportArgs.panic_index >= 8 || reportArgs.casualties > 0;
    const newRecord: IncidentRecord = {
      id: `aura-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      call_id: `CALL-${Math.floor(Math.random() * 90000 + 10000)}`,
      incident_type: reportArgs.problemStatement || reportArgs.incident_type || "Emergency Incident",
      location: reportArgs.location || "Awaiting Location Confirmation",
      panic_index: reportArgs.panic_index || 8,
      casualties: reportArgs.casualties || 0,
      status: "NEW_INTAKE",
      priority: isCrit ? "CRITICAL" : "HIGH",
      caller_summary: reportArgs.caller_summary || "Automated intake recorded by AURA AI dispatcher.",
      tone_assessment: {
        screaming_detected: reportArgs.panic_index >= 8,
        breathing_rate: reportArgs.panic_index >= 8 ? "Hyperventilating (36 BPM)" : "Elevated",
        background_noise: reportArgs.primaryHazard || "Emergency crisis acoustic environment"
      },
      recommended_units: reportArgs.recommended_units || ["Engine 4", "Medic 1"],
      created_at: new Date().toISOString()
    };

    setIncidents((prev) => [newRecord, ...prev]);
    setSelectedIncident(newRecord);
    audioFX.playDispatchChime();
    setLastEventBadge(`CRISIS INTAKE: ${newRecord.incident_type} [${newRecord.priority}]`);
    setTimeout(() => setLastEventBadge(null), 4000);

    try {
      await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reportArgs)
      });
    } catch (err) {
      // Local fallback
    }
  };

  const handleCopyQuestion = (id: string, text: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedQuestionId(id);
      setTimeout(() => setCopiedQuestionId(null), 2000);
    }
  };

  const handleTransmitQuestion = (q: SuggestedQuestion) => {
    audioFX.playRadioChirp();
    setTransmittedQuestionId(q.id);
    setSimulatorTransmittedQuestion(q.question);
    setTimeout(() => {
      setTransmittedQuestionId(null);
      setSimulatorTransmittedQuestion(null);
    }, 2500);

    // If an active simulated call is running, push the dispatcher question to the live transcript stream!
    if (activeCall) {
      setActiveCall((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          liveTranscript: [
            ...prev.liveTranscript,
            {
              speaker: "AURA",
              text: `[DISPATCHER TRANSMISSION]: ${q.question}`
            }
          ]
        };
      });
    } else if (isMicActive) {
      setMicTranscript((prev) => [
        ...prev,
        {
          speaker: "AURA",
          text: `[DISPATCHER TRANSMISSION]: ${q.question}`
        }
      ]);
    }

    setLastEventBadge(`DISPATCH QUESTION TRANSMITTED: "${q.question.substring(0, 36)}..."`);
    setTimeout(() => setLastEventBadge(null), 3500);
  };

  const handleGenerateCustomQuestion = () => {
    if (!customQuestionPrompt.trim() || !selectedIncident) return;
    setIsGeneratingCustom(true);
    setTimeout(() => {
      const generated: SuggestedQuestion = {
        id: `custom-${Date.now()}`,
        category: "TACTICAL",
        urgency: "HIGH",
        question: `Based on your report of '${customQuestionPrompt.trim()}': Can you confirm if you have a clear, safe exit route away from that hazard right now?`,
        rationale: `Dynamically synthesized for caller situational detail: '${customQuestionPrompt.trim()}'.`,
        recommendedAction: "Relay hazard detail directly to responding squad commander."
      };
      setCustomQuestions((prev) => ({
        ...prev,
        [selectedIncident.id]: [generated, ...(prev[selectedIncident.id] || [])]
      }));
      setCustomQuestionPrompt("");
      setIsGeneratingCustom(false);
      audioFX.playRadioChirp();
    }, 600);
  };

  // Sync Audio FX mute state
  useEffect(() => {
    audioFX.enabled = soundEnabled;
  }, [soundEnabled]);

  // Connect to real SSE route if running fullstack server
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/events/dashboard");
      es.addEventListener("NEW_DISPATCH_REPORT", (evt) => {
        try {
          const payload = JSON.parse(evt.data);
          const record: IncidentRecord = payload.data || payload;
          setIncidents((prev) => {
            if (prev.some((p) => p.id === record.id)) return prev;
            return [record, ...prev];
          });
          audioFX.playDispatchChime();
          setLastEventBadge(`POSTGRES NOTIFY: ${record.incident_type}`);
          setTimeout(() => setLastEventBadge(null), 4000);
        } catch (e) {
          console.warn("SSE parse error", e);
        }
      });
    } catch {
      // Standalone client mode fallback
    }
    return () => {
      if (es) es.close();
    };
  }, []);

  // Simulator Stepping Effect
  useEffect(() => {
    if (!activeCall) return;

    const { scenario, stepIndex } = activeCall;
    if (stepIndex >= scenario.dialogue.length) {
      return;
    }

    const currentStep = scenario.dialogue[stepIndex];
    const delay = currentStep.delayMs || 1500;

    const timeout = setTimeout(() => {
      // Check if barge-in
      if (currentStep.isBargeIn) {
        audioFX.playBargeInClick();
      } else if (currentStep.speaker === "AURA") {
        // AI Speaking
      }

      // Check if tool fired
      if (currentStep.text.includes("[ADK TOOL FIRED]")) {
        audioFX.playDispatchChime();

        // Commit new incident to state as if Postgres NOTIFY fired
        const newRecord: IncidentRecord = {
          id: `sim-${Date.now()}`,
          call_id: activeCall.callId,
          incident_type: scenario.incidentType,
          location: scenario.location,
          panic_index: scenario.panicIndex,
          casualties: scenario.casualties,
          status: "UNITS_DISPATCHED",
          priority: scenario.panicIndex >= 8 ? "CRITICAL" : "HIGH",
          caller_summary: scenario.callerQuote,
          tone_assessment: {
            screaming_detected: scenario.screaming,
            breathing_rate: scenario.breathing,
            background_noise: scenario.backgroundNoise,
            peak_db: scenario.screaming ? 88 : 72
          },
          recommended_units: scenario.units,
          created_at: new Date().toISOString(),
          timeline: activeCall.liveTranscript.map((t) => ({
            time: new Date().toLocaleTimeString(),
            speaker: t.speaker,
            text: t.text
          }))
        };

        setIncidents((prev) => [newRecord, ...prev]);
        setSelectedIncident(newRecord);
        setLastEventBadge(`POSTGRES NOTIFY: ${scenario.incidentType}`);
        setTimeout(() => setLastEventBadge(null), 4000);
      }

      setActiveCall((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          stepIndex: prev.stepIndex + 1,
          bargeInCount: currentStep.isBargeIn ? prev.bargeInCount + 1 : prev.bargeInCount,
          isAiSpeaking: currentStep.speaker === "AURA",
          currentPanic: currentStep.isBargeIn ? 10 : prev.currentPanic,
          liveTranscript: [
            ...prev.liveTranscript,
            {
              speaker: currentStep.speaker,
              text: currentStep.text,
              isBargeIn: currentStep.isBargeIn
            }
          ]
        };
      });
    }, delay);

    return () => clearTimeout(timeout);
  }, [activeCall?.stepIndex, activeCall?.scenario.id]);

  // Start Scenario Call
  const startScenario = (scenario: CrisisScenario) => {
    // End active mic if any
    if (isMicActive) stopMicrophone();

    const callId = `CALL-${Math.floor(Math.random() * 90000 + 10000)}`;
    audioFX.playRadioChirp();

    setActiveCall({
      scenario,
      stepIndex: 0,
      callId,
      isMuted: false,
      bargeInCount: 0,
      liveTranscript: [],
      currentPanic: scenario.panicIndex,
      isAiSpeaking: false,
      callerVolumeLevel: scenario.screaming ? 85 : 45
    });

    if (scenario.panicIndex >= 8) {
      setGroundingActive(true);
      setTimeout(() => setGroundingActive(false), 8000);
    }
  };

  const endCall = () => {
    setActiveCall(null);
  };

  // Real Microphone Stream Implementation
  const startMicrophone = async () => {
    if (activeCall) setActiveCall(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      setIsMicActive(true);
      setMicTranscript([
        { speaker: "SYSTEM", text: "[AURA LIVE VOICE INITIALIZED] Listening on 16kHz PCM stream. Gemini 3.8 Live ready." },
        { speaker: "AURA", text: "AURA Crisis Dispatch active. State your emergency, location, and casualties." }
      ]);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let lastSpokenTime = Date.now();
      let aiSpeakingSim = false;

      const analyze = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicVolume(normalized);

        // Paralinguistic Panic Heuristic based on real acoustic intensity
        if (normalized > 70) {
          setMicPanicScore(9);
          // If AI was speaking, trigger BARGE-IN
          if (aiSpeakingSim) {
            aiSpeakingSim = false;
            setMicBargeInTriggered(true);
            audioFX.playBargeInClick();
            setMicTranscript((prev) => [
              ...prev,
              { speaker: "SYSTEM", text: `[BARGE-IN TRIGGERED] User voice volume (${normalized}%) exceeded threshold. AI speech aborted.` }
            ]);
            setTimeout(() => setMicBargeInTriggered(false), 2500);
          }
        } else if (normalized > 40) {
          setMicPanicScore(6);
        } else {
          setMicPanicScore(3);
        }

        animationFrameRef.current = requestAnimationFrame(analyze);
      };

      analyze();
    } catch (err) {
      setLastEventBadge("MICROPHONE UNAVAILABLE: Please use interactive simulator keypad below.");
      setTimeout(() => setLastEventBadge(null), 4000);
      setIsMicActive(false);
    }
  };

  const stopMicrophone = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsMicActive(false);
  };

  // Dispatch Units Action
  const handleDeployUnits = (incidentId: string) => {
    audioFX.playRadioChirp();
    setIncidents((prev) =>
      prev.map((inc) => (inc.id === incidentId ? { ...inc, status: "UNITS_DISPATCHED" } : inc))
    );
    if (selectedIncident.id === incidentId) {
      setSelectedIncident((prev) => ({ ...prev, status: "UNITS_DISPATCHED" }));
    }
    setLastEventBadge(`DISPATCH SQUAD CONFIRMED: ${selectedIncident.call_id}`);
    setTimeout(() => setLastEventBadge(null), 3000);
  };

  const handleEvacAlert = (incident: IncidentRecord) => {
    audioFX.playDispatchChime();
    setLastEventBadge(`[GEO-ALERT BROADCASTED]: Cellular towers alerted for ${incident.location}`);
    setTimeout(() => setLastEventBadge(null), 4500);
  };

  // Filtered Incidents
  const filteredIncidents = incidents.filter((inc) => {
    if (filterPriority === "ALL") return true;
    if (filterPriority === "CRITICAL") return inc.panic_index >= 8 || inc.priority === "CRITICAL";
    if (filterPriority === "HIGH") return inc.panic_index >= 5 && inc.panic_index < 8;
    return true;
  });

  const criticalTotal = incidents.filter((i) => i.panic_index >= 8).length;
  const totalCasualties = incidents.reduce((sum, i) => sum + (i.casualties || 0), 0);

  return (
    <div className="min-h-screen bg-[#07090e] text-neutral-100 font-sans antialiased selection:bg-red-500/30 selection:text-red-200 flex flex-col">
      {/* Real-time Toast Notification for Postgres NOTIFY Events */}
      {lastEventBadge && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-neutral-900/95 border border-cyan-500/50 text-cyan-200 shadow-[0_0_25px_rgba(6,182,212,0.3)] animate-in fade-in slide-in-from-bottom-4 duration-200">
          <Database className="w-5 h-5 text-cyan-400 animate-spin" />
          <div>
            <div className="text-[10px] font-mono text-cyan-400 tracking-wider uppercase font-bold">
              PostgreSQL NOTIFY Trigger • &lt; 1.2ms
            </div>
            <div className="text-xs font-semibold text-neutral-100">{lastEventBadge}</div>
          </div>
        </div>
      )}

      {/* Top Tactical Mission Control Bar */}
      <header className="border-b border-neutral-800/80 bg-neutral-950/90 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo & Agent Identity */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-red-950 to-neutral-900 border border-red-500/40 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.25)]">
              <ShieldAlert className="w-5 h-5 animate-pulse text-red-500" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black tracking-widest text-neutral-100">
                  AURA
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30">
                  911 DISPATCH CO-PILOT
                </span>
                <span className="hidden sm:inline text-xs font-mono text-neutral-500">• LIVE AGENT</span>
              </div>
              <p className="text-[11px] text-neutral-400 font-mono flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-ping" />
                ADK LiveClient (gemini-3.8-live) • Postgres LISTEN/NOTIFY Trigger
              </p>
            </div>
          </div>

          {/* Right Action & Status Pills */}
          <div className="flex items-center gap-2 sm:gap-3 text-xs font-mono">
            {/* Native Postgres Pub/Sub Status Indicator */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300">
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px]">channel:</span>
              <span className="text-cyan-300 font-bold">dispatch_events</span>
              <span className="text-neutral-600">|</span>
              <span className="text-[10px] text-emerald-400 font-bold">{sseLatency}ms latency</span>
            </div>

            {/* Sound Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? "Mute Radio Chirps" : "Unmute Radio Chirps"}
              className="p-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-neutral-600" />}
            </button>

            {/* Architecture & Code Inspector Button */}
            <button
              onClick={() => setShowCodeInspector(true)}
              className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Code2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Inspect Source</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-5 flex-1">
        {/* KPI Telemetry Header */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-3.5 sm:p-4 rounded-xl bg-neutral-900/70 border border-neutral-800 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-1">
              <span>911 INTAKE PIPELINE</span>
              <Radio className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-neutral-100 flex items-baseline gap-2">
              {incidents.length}
              <span className="text-xs text-emerald-400 font-sans font-normal">Active Calls</span>
            </div>
            <div className="text-[11px] text-neutral-500 mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              WebSocket Audio Stream
            </div>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl bg-neutral-900/70 border border-neutral-800 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-1">
              <span>CRITICAL PANIC (8-10)</span>
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-red-400 flex items-baseline gap-2">
              {criticalTotal}
              <span className="text-xs text-red-500/80 font-sans font-normal">Immediate Response</span>
            </div>
            <div className="text-[11px] text-neutral-500 mt-1 flex items-center gap-1">
              <Flame className="w-3 h-3 text-red-500" />
              Scream & Hyperventilation
            </div>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl bg-neutral-900/70 border border-neutral-800 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-1">
              <span>REPORTED CASUALTIES</span>
              <Users className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-amber-300 flex items-baseline gap-2">
              {totalCasualties}
              <span className="text-xs text-amber-500/80 font-sans font-normal">Trapped / Injured</span>
            </div>
            <div className="text-[11px] text-neutral-500 mt-1 flex items-center gap-1">
              <Activity className="w-3 h-3 text-amber-400" />
              Pydantic Schema Extracted
            </div>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl bg-neutral-900/70 border border-neutral-800 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-1">
              <span>POSTGRES NOTIFY LATENCY</span>
              <Database className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-cyan-300 flex items-baseline gap-2">
              {sseLatency} <span className="text-xs font-sans text-neutral-400">ms</span>
            </div>
            <div className="text-[11px] text-cyan-400/90 mt-1 flex items-center gap-1">
              <Zap className="w-3 h-3 text-cyan-400" />
              Zero Redis • Native DB Pub/Sub
            </div>
          </div>
        </section>

        {/* Interactive 911 Caller Voice Simulator & Virtual Phone */}
        <InteractiveCallerSimulator
          onDispatchReportFired={handleSimulatorDispatchReport}
          externalTransmittedQuestion={simulatorTransmittedQuestion}
        />

        {/* Live Incidents Feed & Selected Incident Command Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Live Incident Feed (7 cols on lg) */}
          <div className="lg:col-span-7 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-200 font-mono flex items-center gap-2">
                  <Radio className="w-4 h-4 text-red-500" />
                  <span>Crisis Incident Stream</span>
                </h2>
                <span className="text-xs font-mono text-neutral-500">
                  ({filteredIncidents.length} Records)
                </span>
              </div>

              {/* Priority Filters */}
              <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-900 border border-neutral-800 text-xs font-mono">
                {["ALL", "CRITICAL", "HIGH"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFilterPriority(tab)}
                    className={`px-2.5 py-1 rounded transition-colors text-[11px] ${
                      filterPriority === tab
                        ? "bg-neutral-800 text-white font-semibold shadow-sm"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Incidents Cards List */}
            <div className="space-y-2.5">
              {filteredIncidents.map((incident) => {
                const isSelected = selectedIncident?.id === incident.id;
                const isCritical = incident.panic_index >= 8;

                return (
                  <div
                    key={incident.id}
                    onClick={() => setSelectedIncident(incident)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
                      isSelected
                        ? "bg-neutral-900/90 border-neutral-600 shadow-xl ring-1 ring-neutral-600"
                        : "bg-neutral-900/50 border-neutral-800/80 hover:border-neutral-700 hover:bg-neutral-900"
                    }`}
                  >
                    {/* Left severity indicator border */}
                    <div
                      className={`absolute top-0 left-0 bottom-0 w-1.5 ${
                        isCritical ? "bg-red-500" : incident.panic_index >= 5 ? "bg-amber-500" : "bg-cyan-500"
                      }`}
                    />

                    <div className="pl-2 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-neutral-300">
                              {incident.call_id}
                            </span>
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                                isCritical
                                  ? "bg-red-500/20 text-red-300 border border-red-500/30"
                                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              }`}
                            >
                              {incident.priority}
                            </span>
                            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40 hidden sm:inline">
                              POSTGRES NOTIFY
                            </span>
                          </div>
                          <h3 className="text-sm sm:text-base font-bold text-neutral-100 mt-1">
                            {incident.incident_type}
                          </h3>
                        </div>

                        {/* Panic Index Radial / Badge */}
                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-neutral-400">PANIC</span>
                            <span
                              className={`text-base sm:text-lg font-mono font-black ${
                                isCritical ? "text-red-400" : "text-amber-400"
                              }`}
                            >
                              {incident.panic_index}/10
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-neutral-500">
                            {incident.casualties} Casualties
                          </span>
                        </div>
                      </div>

                      {/* Location & Time */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400">
                        <span className="flex items-center gap-1 text-neutral-300">
                          <MapPin className="w-3.5 h-3.5 text-red-400" />
                          {incident.location}
                        </span>
                        <span className="flex items-center gap-1 text-neutral-500 font-mono text-[11px]">
                          <Clock className="w-3 h-3" />
                          {new Date(incident.created_at).toLocaleTimeString()}
                        </span>
                      </div>

                      {/* Caller Transcript Snippet */}
                      {incident.caller_summary && (
                        <p className="text-xs text-neutral-400 line-clamp-2 italic bg-neutral-950/60 p-2 rounded-lg border border-neutral-800/80">
                          "{incident.caller_summary}"
                        </p>
                      )}

                      {/* Recommended units tags */}
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <Truck className="w-3.5 h-3.5 text-neutral-500 mr-1" />
                          {incident.recommended_units.map((u) => (
                            <span
                              key={u}
                              className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800/80 text-neutral-300 border border-neutral-700/80"
                            >
                              {u}
                            </span>
                          ))}
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-300">
                          {incident.status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Selected Incident Triage Command (5 cols on lg) */}
          <div className="lg:col-span-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-200 font-mono flex items-center gap-2">
                <Siren className="w-4 h-4 text-amber-400" />
                <span>Dispatcher Action Console</span>
              </h2>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/30">
                Pydantic Validated
              </span>
            </div>

            {selectedIncident ? (
              <div className="p-5 rounded-2xl bg-neutral-900/90 border border-neutral-800 shadow-2xl space-y-4 sticky top-20">
                {/* Header */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-red-400 font-bold">
                      {selectedIncident.call_id}
                    </span>
                    <span className="text-xs font-mono text-cyan-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      @tool extract_dispatch_data
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-neutral-100 mt-1">
                    {selectedIncident.incident_type}
                  </h3>
                  <div className="text-xs text-neutral-300 flex items-center gap-1.5 mt-1.5">
                    <MapPin className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span>{selectedIncident.location}</span>
                  </div>
                </div>

                {/* Paralinguistic Audio Assessment Metrics */}
                <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800/80 space-y-2">
                  <div className="text-xs font-mono font-bold text-neutral-300 flex items-center justify-between">
                    <span>AUDIO TONE METRICS</span>
                    <span className="text-red-400 font-bold">
                      Distress Index: {selectedIncident.panic_index}/10
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono text-neutral-400">
                    <div>
                      <span className="text-neutral-500 text-[10px] block">Breathing:</span>
                      <span className="text-neutral-200">
                        {selectedIncident.tone_assessment?.breathing_rate || "Elevated"}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 text-[10px] block">Screaming Detection:</span>
                      <span className={selectedIncident.tone_assessment?.screaming_detected ? "text-red-400 font-bold" : "text-neutral-300"}>
                        {selectedIncident.tone_assessment?.screaming_detected ? "CONFIRMED PEAK" : "None"}
                      </span>
                    </div>
                  </div>
                  {selectedIncident.tone_assessment?.background_noise && (
                    <div className="text-[11px] font-mono text-neutral-400 border-t border-neutral-800/80 pt-1.5">
                      <span className="text-neutral-500">Acoustic context: </span>
                      <span className="text-neutral-300">{selectedIncident.tone_assessment.background_noise}</span>
                    </div>
                  )}
                </div>

                {/* Casualties & Caller Statement */}
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between font-mono text-neutral-400">
                    <span>Confirmed Casualties:</span>
                    <span className="text-amber-400 font-bold text-sm">
                      {selectedIncident.casualties}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-neutral-950/70 border border-neutral-800/80 text-neutral-300 leading-relaxed text-xs">
                    <span className="text-neutral-500 font-mono text-[10px] block mb-1">CALLER STATEMENT:</span>
                    "{selectedIncident.caller_summary || "Automated intake synthesized by AURA ADK agent."}"
                  </div>
                </div>

                {/* Assigned Units */}
                <div className="space-y-2">
                  <div className="text-xs font-mono font-bold text-neutral-400 flex items-center justify-between">
                    <span>RECOMMENDED EMERGENCY UNITS</span>
                    <span className="text-[10px] text-emerald-400 font-normal">Auto-Assigned</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedIncident.recommended_units.map((unit) => (
                      <span
                        key={unit}
                        className="px-2.5 py-1 rounded-md bg-neutral-800 text-neutral-200 font-mono text-xs border border-neutral-700 flex items-center gap-1.5"
                      >
                        <Truck className="w-3 h-3 text-red-400" />
                        {unit}
                      </span>
                    ))}
                  </div>
                </div>

                {/* AI Suggested Response Section (Situational Caller Questions) */}
                {(() => {
                  const baseQuestions = generateSituationalQuestions(
                    selectedIncident.incident_type,
                    selectedIncident.panic_index,
                    selectedIncident.casualties,
                    selectedIncident.location
                  );
                  const userAdded = customQuestions[selectedIncident.id] || [];
                  const combined = [...userAdded, ...baseQuestions];
                  const filtered = combined.filter((q) => {
                    if (selectedQuestionCategory === "ALL") return true;
                    return q.category === selectedQuestionCategory;
                  });

                  return (
                    <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800/90 space-y-3">
                      {/* Header */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                            <MessageSquareQuote className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-mono font-bold text-neutral-200 flex items-center gap-1.5">
                              <span>AI SUGGESTED RESPONSES</span>
                              <span className="text-[10px] text-emerald-400 font-normal px-1.5 py-0.2 rounded bg-emerald-950/60 border border-emerald-500/30">
                                Situational
                              </span>
                            </div>
                            <p className="text-[10px] text-neutral-500 font-mono">
                              Tailored for {selectedIncident.incident_type}
                            </p>
                          </div>
                        </div>

                        {/* Category Filter Tabs */}
                        <div className="flex items-center gap-1 bg-neutral-900 p-0.5 rounded-lg border border-neutral-800">
                          {(["ALL", "SAFETY", "TACTICAL", "GROUNDING"] as const).map((cat) => (
                            <button
                              key={cat}
                              onClick={() => setSelectedQuestionCategory(cat)}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                                selectedQuestionCategory === cat
                                  ? "bg-neutral-800 text-white font-bold"
                                  : "text-neutral-500 hover:text-neutral-300"
                              }`}
                            >
                              {cat === "SAFETY" ? "SAFETY" : cat === "TACTICAL" ? "INTEL" : cat === "GROUNDING" ? "CALM" : "ALL"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Questions Scrollable List */}
                      <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                        {filtered.length === 0 ? (
                          <div className="p-4 text-center text-neutral-500 text-xs font-mono">
                            No suggested questions in this category.
                          </div>
                        ) : (
                          filtered.map((item) => {
                            const isCopied = copiedQuestionId === item.id;
                            const isTransmitted = transmittedQuestionId === item.id;
                            const isSafety = item.category === "SAFETY";
                            const isGrounding = item.category === "GROUNDING";
                            const isHazard = item.category === "HAZARD";

                            return (
                              <div
                                key={item.id}
                                className="p-3 rounded-xl bg-neutral-900/70 border border-neutral-800/80 hover:border-neutral-700 transition-all space-y-2 group"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                                        isSafety
                                          ? "bg-red-500/20 text-red-300 border border-red-500/30"
                                          : isGrounding
                                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                                          : isHazard
                                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                          : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                      }`}
                                    >
                                      {item.category}
                                    </span>
                                    <span className="text-[9px] font-mono text-neutral-500">
                                      {item.urgency} PRIORITY
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    {/* Copy Button */}
                                    <button
                                      onClick={() => handleCopyQuestion(item.id, item.question)}
                                      title="Copy exact question text"
                                      className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-mono flex items-center gap-1 transition-colors border border-neutral-700"
                                    >
                                      {isCopied ? (
                                        <>
                                          <Check className="w-3 h-3 text-emerald-400" />
                                          <span className="text-emerald-400">Copied</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3 text-neutral-400" />
                                          <span>Copy</span>
                                        </>
                                      )}
                                    </button>

                                    {/* Transmit to Caller Button */}
                                    <button
                                      onClick={() => handleTransmitQuestion(item)}
                                      title="Speak/transmit this prompt directly to live caller stream"
                                      className={`px-2 py-1 rounded text-[10px] font-mono font-bold flex items-center gap-1 transition-all ${
                                        isTransmitted
                                          ? "bg-emerald-600 text-white"
                                          : "bg-red-600/80 hover:bg-red-500 text-white shadow-sm"
                                      }`}
                                    >
                                      {isTransmitted ? (
                                        <>
                                          <Check className="w-3 h-3" />
                                          <span>Transmitted</span>
                                        </>
                                      ) : (
                                        <>
                                          <Send className="w-3 h-3" />
                                          <span>Transmit</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>

                                {/* Verbatim Question Text */}
                                <p className="text-xs text-neutral-100 font-medium leading-relaxed bg-black/40 p-2.5 rounded-lg border border-neutral-800/80">
                                  "{item.question}"
                                </p>

                                {/* Tactical Rationale */}
                                <div className="flex items-start gap-1.5 text-[10px] font-mono text-neutral-400">
                                  <Lightbulb className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                                  <span className="leading-snug">
                                    <strong className="text-neutral-300">Rationale:</strong> {item.rationale}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Custom Situational Observation Input */}
                      <div className="pt-2 border-t border-neutral-800/80 space-y-1.5">
                        <span className="text-[10px] font-mono text-neutral-400 block uppercase">
                          Synthesize Situational Follow-Up:
                        </span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="e.g. Caller mentions sulfur smell / stairs collapsed..."
                            value={customQuestionPrompt}
                            onChange={(e) => setCustomQuestionPrompt(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleGenerateCustomQuestion()}
                            className="flex-1 px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs font-mono text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-red-500/50"
                          />
                          <button
                            onClick={handleGenerateCustomQuestion}
                            disabled={!customQuestionPrompt.trim() || isGeneratingCustom}
                            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200 text-xs font-mono font-semibold transition-all border border-neutral-700 flex items-center gap-1.5"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            <span>{isGeneratingCustom ? "Synthesizing..." : "Ask AI"}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Tactical Dispatch Action Buttons */}
                <div className="space-y-2 pt-2 border-t border-neutral-800">
                  <button
                    onClick={() => handleDeployUnits(selectedIncident.id)}
                    className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-950/60 active:scale-[0.98]"
                  >
                    <Truck className="w-4 h-4" />
                    <span>DISPATCH ALL RECOMMENDED SQUADS</span>
                  </button>

                  <button
                    onClick={() => handleEvacAlert(selectedIncident)}
                    className="w-full py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-mono text-xs transition-colors flex items-center justify-center gap-2 border border-neutral-700"
                  >
                    <BellRing className="w-3.5 h-3.5 text-amber-400" />
                    <span>BROADCAST CELLULAR EVACUATION ALERT</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center rounded-2xl bg-neutral-900/40 border border-neutral-800 text-neutral-500 font-mono text-xs space-y-2">
                <ShieldAlert className="w-8 h-8 text-neutral-600 mx-auto" />
                <p>Select an incoming 911 incident from the live feed to inspect triage data and dispatch units.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Code & Architecture Inspector Modal */}
      {showCodeInspector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-5xl h-[85vh] bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/60">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
                  <FileCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-100 font-mono uppercase tracking-wider">
                    AURA Core Architecture & File Inspector
                  </h3>
                  <p className="text-xs text-neutral-400">
                    ADK LiveClient • Pydantic Schema Tools • Postgres LISTEN/NOTIFY • SSE Pipeline
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCodeInspector(false)}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-mono transition-colors"
              >
                Close (ESC)
              </button>
            </div>

            {/* File Switcher Tabs */}
            <div className="flex border-b border-neutral-800 bg-neutral-900/30 overflow-x-auto text-xs font-mono">
              {[
                { id: "adk_client", label: "adk_client.py", path: "/backend/app/agent/adk_client.py" },
                { id: "tools", label: "tools.py", path: "/backend/app/agent/tools.py" },
                { id: "prompts", label: "prompts.py", path: "/backend/app/agent/prompts.py" },
                { id: "ws_audio", label: "ws_audio.py", path: "/backend/app/api/ws_audio.py" },
                { id: "sse_dashboard", label: "sse_dashboard.py", path: "/backend/app/api/sse_dashboard.py" },
                { id: "init_sql", label: "init.sql", path: "/db/init.sql" },
                { id: "dashboard_page", label: "page.tsx", path: "/frontend/src/app/dashboard/page.tsx" }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedCodeFile(tab.id)}
                  className={`px-4 py-2.5 whitespace-nowrap transition-colors border-b-2 flex items-center gap-2 ${
                    selectedCodeFile === tab.id
                      ? "border-red-500 text-red-400 bg-red-500/5 font-bold"
                      : "border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50"
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Code Content Viewer */}
            <div className="flex-1 p-6 overflow-auto bg-neutral-950 font-mono text-xs leading-relaxed text-neutral-300">
              <pre className="whitespace-pre overflow-x-auto">
                {selectedCodeFile === "adk_client" && `"""
AURA Crisis Dispatch Co-Pilot - Google ADK LiveClient Initialization
Configured for 'gemini-3.8-live' with bidirectional voice, interruption (barge-in),
paralinguistic tone analysis, and automated dispatch tool execution.
"""

from google.adk.live import LiveClient, LiveConfig, Modality, VoiceConfig
from app.agent.prompts import SYSTEM_INSTRUCTION
from app.agent.tools import extract_dispatch_data

def build_live_config() -> LiveConfig:
    return LiveConfig(
        model="gemini-3.8-live",
        system_instruction=SYSTEM_INSTRUCTION,
        modalities=[Modality.AUDIO],
        voice_config=VoiceConfig(prebuilt_voice_name="Aoede"),
        enable_interruption=True,  # STRICT BARGE-IN: Audio pauses immediately when caller interrupts
        tools=[extract_dispatch_data]
    )`}

                {selectedCodeFile === "tools" && `"""
AURA Crisis Dispatch Co-Pilot - Pydantic Tools & Dispatch Report Schema
"""
from pydantic import BaseModel, Field
from google.adk.tools import tool
from app.database import get_db_pool

class DispatchReport(BaseModel):
    incident_type: str = Field(..., description="Crisis classification")
    location: str = Field(..., description="Exact street address, cross streets, or landmark")
    panic_index: int = Field(..., ge=1, le=10, description="Paralinguistic distress assessment")
    casualties: int = Field(..., ge=0, description="Number of injured or trapped individuals")

@tool
async def extract_dispatch_data(report: DispatchReport) -> dict:
    pool = await get_db_pool()
    async with pool.acquire() as connection:
        query = """
            INSERT INTO incidents (incident_type, location, panic_index, casualties)
            VALUES ($1, $2, $3, $4)
            RETURNING id, call_id;
        """
        record = await connection.fetchrow(
            query, report.incident_type, report.location, report.panic_index, report.casualties
        )
        # PostgreSQL trigger immediately fires pg_notify('dispatch_events', row_to_json(NEW)::text)
        return {"status": "SUCCESS", "incident_id": str(record["id"])}`}

                {selectedCodeFile === "prompts" && `SYSTEM_INSTRUCTION = (
    "You are AURA, an emergency intake AI. Stay calm, grounded, and concise. "
    "Your goal is to extract the LOCATION, INCIDENT TYPE, and NUMBER OF CASUALTIES from panicked callers. "
    "If the caller interrupts, stop speaking. If they are hyperventilating, use grounding techniques. "
    "Execute the extract_dispatch_data tool immediately once you have the facts. Do not announce tool usage."
)`}

                {selectedCodeFile === "ws_audio" && `@router.websocket("/ws/audio/{call_id}")
async def websocket_audio_endpoint(websocket: WebSocket, call_id: str):
    await websocket.accept()
    session = AuraLiveSession(
        call_id=call_id,
        on_barge_in=lambda: websocket.send_json({"type": "BARGE_IN_TRIGGERED"})
    )
    await session.start()
    while True:
        message = await websocket.receive()
        if "bytes" in message:
            await session.send_audio_chunk(message["bytes"])`}

                {selectedCodeFile === "sse_dashboard" && `@router.get("/api/events/dashboard")
async def sse_dashboard_endpoint(request: Request):
    async def event_generator():
        client_queue = asyncio.Queue()
        register_sse_subscriber(client_queue)
        try:
            while True:
                event_data = await client_queue.get()
                yield f"event: NEW_DISPATCH_REPORT\\ndata: {json.dumps(event_data)}\\n\\n"
        finally:
            unregister_sse_subscriber(client_queue)
    return StreamingResponse(event_generator(), media_type="text/event-stream")`}

                {selectedCodeFile === "init_sql" && `-- PostgreSQL Schema & Native Pub/Sub Trigger
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id VARCHAR(64) NOT NULL,
    incident_type VARCHAR(100) NOT NULL,
    location TEXT NOT NULL,
    panic_index INT NOT NULL CHECK (panic_index BETWEEN 1 AND 10),
    casualties INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION notify_dispatch_incident()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('dispatch_events', json_build_object(
        'event', 'NEW_DISPATCH_REPORT',
        'data', row_to_json(NEW)
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_dispatch_incident
AFTER INSERT ON incidents
FOR EACH ROW EXECUTE FUNCTION notify_dispatch_incident();`}

                {selectedCodeFile === "dashboard_page" && `// Next.js App Router Crisis Dispatch Dashboard
export default function DashboardPage() {
  const { isConnected, incidents, latencyMs } = useSSE("/api/events/dashboard");
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Real-time incident feed reflecting Postgres NOTIFY without page reload */}
      {incidents.map((incident) => (
        <IncidentCard key={incident.id} incident={incident} />
      ))}
    </div>
  );
}`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
