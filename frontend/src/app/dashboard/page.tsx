"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  Flame,
  Radio,
  Activity,
  AlertTriangle,
  Volume2,
  Users,
  MapPin,
  Clock,
  Sparkles,
  CheckCircle2,
  Database,
  Truck,
  ArrowUpRight,
  RefreshCw,
  PhoneCall,
  Mic,
  MicOff,
  BellRing,
  Bot,
  MessageSquareQuote,
  Lightbulb,
  Copy,
  Check,
  Send
} from "lucide-react";
import { useSSE, IncidentRecord } from "./use-sse";

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
  casualties: number
): SuggestedQuestion[] {
  const inc = (incidentType || "").toLowerCase();
  const questions: SuggestedQuestion[] = [];

  if (panicIndex >= 8) {
    questions.push({
      id: "ground-01",
      category: "GROUNDING",
      urgency: "CRITICAL",
      question: "Take one breath with me right now. You are doing great. Keep the phone to your ear. Rescue crews have their sirens on right now.",
      rationale: "Stabilizes hyperventilation and cognitive tunnel vision; keeps caller conscious and compliant.",
      recommendedAction: "Speak slowly with firm, calm downward inflection."
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
        rationale: "Guides Ladder aerial platform directly to the target window, eliminating exterior recon delay.",
        recommendedAction: "Relay exact window side and floor height to inbound Battalion Chief."
      },
      {
        id: "fire-03",
        category: "HAZARD",
        urgency: "HIGH",
        question: "Are there propane barbecue tanks, home oxygen cylinders, or solar battery arrays near the fire?",
        rationale: "Alerts interior fire attack crews to explosive BLEVE hazards before breach.",
        recommendedAction: "Flag secondary explosive hazard on tactical CAD dispatch screen."
      }
    );
  } else if (inc.includes("flood") || inc.includes("water") || inc.includes("submerg") || inc.includes("drown")) {
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
        recommendedAction: "Alert Swiftwater Rescue to deploy tethered rescue boat and throw bags."
      }
    );
  } else if (inc.includes("chem") || inc.includes("vapor") || inc.includes("toxic") || inc.includes("gas") || inc.includes("leak") || inc.includes("hazmat")) {
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
      }
    );
  } else {
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

export default function DashboardPage() {
  const { isConnected, incidents, latencyMs, lastEventTime } = useSSE("/api/events/dashboard");
  const [selectedIncident, setSelectedIncident] = useState<IncidentRecord | null>(null);
  const [filterPriority, setFilterPriority] = useState<string>("ALL");
  const [activeCallSimulating, setActiveCallSimulating] = useState(false);
  const [copiedQuestionId, setCopiedQuestionId] = useState<string | null>(null);
  const [transmittedQuestionId, setTransmittedQuestionId] = useState<string | null>(null);
  const [selectedQuestionCategory, setSelectedQuestionCategory] = useState<string>("ALL");
  const [customQuestionPrompt, setCustomQuestionPrompt] = useState<string>("");

  const activeIncidents = incidents.filter((inc) => {
    if (filterPriority === "ALL") return true;
    return inc.priority === filterPriority;
  });

  const criticalCount = incidents.filter((i) => i.panic_index >= 8 || i.priority === "CRITICAL").length;
  const totalCasualties = incidents.reduce((acc, curr) => acc + (curr.casualties || 0), 0);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans antialiased selection:bg-red-500/30 selection:text-red-200">
      {/* Top Mission Control Status Bar */}
      <header className="border-b border-neutral-800 bg-neutral-900/90 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-red-950/80 border border-red-500/40 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.25)]">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-wider uppercase text-neutral-100">
                  AURA <span className="text-red-500 font-mono text-xs px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20">CO-PILOT</span>
                </h1>
                <span className="text-neutral-500 text-xs font-mono">• CRISIS DISPATCH INTAKE</span>
              </div>
              <p className="text-xs text-neutral-400 font-mono flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-ping" />
                ADK LiveClient (gemini-3.8-live) Active | Native Postgres Pub/Sub
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            {/* Live SSE Status Pill */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${
              isConnected 
                ? "bg-emerald-950/50 border-emerald-500/30 text-emerald-300"
                : "bg-red-950/50 border-red-500/30 text-red-400"
            }`}>
              <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-red-400 animate-pulse"}`} />
              <span>{isConnected ? "SSE CONNECTED" : "RECONNECTING"}</span>
              <span className="text-neutral-500">|</span>
              <span className="text-neutral-400">{latencyMs}ms latency</span>
            </div>

            {/* Postgres Pub/Sub Indicator */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-300">
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <span>NOTIFY: dispatch_events</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Mission Control Grid */}
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Top Telemetry KPIs */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-2">
              <span>ACTIVE 911 INTAKES</span>
              <Radio className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-neutral-100 flex items-baseline gap-2">
              {incidents.length}
              <span className="text-xs text-emerald-400 font-sans font-normal">Streaming Live</span>
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">Direct from WebSockets raw audio</p>
          </div>

          <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-2">
              <span>CRITICAL PANIC (8-10)</span>
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-red-400 flex items-baseline gap-2">
              {criticalCount}
              <span className="text-xs text-red-500/80 font-sans font-normal">Immediate Response</span>
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">Paralinguistic scream & breath triage</p>
          </div>

          <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-2">
              <span>TOTAL CASUALTIES</span>
              <Users className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-amber-300 flex items-baseline gap-2">
              {totalCasualties}
              <span className="text-xs text-amber-500/80 font-sans font-normal">Trapped / Injured</span>
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">Extracted via Pydantic tool call</p>
          </div>

          <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-2">
              <span>POSTGRES NOTIFY LATENCY</span>
              <Activity className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-cyan-300 flex items-baseline gap-2">
              {latencyMs} <span className="text-sm font-sans font-normal text-neutral-400">ms</span>
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">Zero Redis • Native DB trigger</p>
          </div>
        </section>

        {/* Live Audio / Call Simulation & Paralinguistic Monitor Banner */}
        <section className="p-5 rounded-2xl bg-neutral-900/80 border border-neutral-800 shadow-xl relative overflow-hidden">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-red-500/20 text-red-300 border border-red-500/30">
                  LIVE CALL SIMULATOR & BARGE-IN ENGINE
                </span>
                <span className="text-xs text-neutral-400 font-mono">Channel: ws/audio/CALL-CURRENT</span>
              </div>
              <p className="text-sm text-neutral-300">
                Bidirectional voice streaming with gemini-3.8-live. Simulates panicked screams and instantaneous AI interruption.
              </p>
            </div>

            <div className="flex items-center gap-3 w-full lg:w-auto">
              <button
                onClick={() => setActiveCallSimulating(!activeCallSimulating)}
                className={`flex-1 lg:flex-none px-4 py-2.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center justify-center gap-2 shadow-lg ${
                  activeCallSimulating
                    ? "bg-red-600 hover:bg-red-500 text-white shadow-red-900/40"
                    : "bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700"
                }`}
              >
                {activeCallSimulating ? (
                  <>
                    <PhoneCall className="w-4 h-4 animate-bounce" />
                    <span>TERMINATE SIMULATED CALL</span>
                  </>
                ) : (
                  <>
                    <PhoneCall className="w-4 h-4 text-emerald-400" />
                    <span>TRIGGER PANICKED 911 CALL</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Real-time Waveform & Barge-In Visualizer Bar */}
          {activeCallSimulating && (
            <div className="mt-4 pt-4 border-t border-neutral-800/80 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
              <div className="p-3 rounded-lg bg-neutral-950/80 border border-neutral-800">
                <div className="text-neutral-400 mb-1 flex items-center justify-between">
                  <span>CALLER AUDIO WAVEFORM</span>
                  <span className="text-red-400">16kHz PCM</span>
                </div>
                <div className="flex items-center gap-1 h-8">
                  {[40, 75, 95, 80, 60, 90, 100, 85, 45, 70, 95, 85, 60, 40].map((h, i) => (
                    <div
                      key={i}
                      style={{ height: `${h}%` }}
                      className="flex-1 bg-red-500/80 rounded-full animate-pulse"
                    />
                  ))}
                </div>
                <div className="mt-1 text-[10px] text-red-300">Screaming detected (+82dB peak)</div>
              </div>

              <div className="p-3 rounded-lg bg-neutral-950/80 border border-neutral-800">
                <div className="text-neutral-400 mb-1 flex items-center justify-between">
                  <span>PARALINGUISTIC ASSESSMENT</span>
                  <span className="text-amber-400 font-bold">PANIC: 9/10</span>
                </div>
                <div className="space-y-1 text-[11px] text-neutral-300">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Breathing Rate:</span>
                    <span className="text-red-400 font-semibold">Hyperventilating (38 BPM)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Acoustic Noise:</span>
                    <span className="text-amber-300">Heavy Smoke / Alarms</span>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-neutral-950/80 border border-red-500/30 bg-red-950/10">
                <div className="text-red-300 mb-1 flex items-center justify-between font-bold">
                  <span>BARGE-IN STATUS</span>
                  <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px]">ACTIVE</span>
                </div>
                <p className="text-[11px] text-neutral-300 leading-snug">
                  AI paused speech instantly upon caller scream. Full audio channel ceded to caller distress stream.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Incidents Feed & Selected Detail Split View */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Live Incident Stream (2 Cols on lg) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-200">
                  Live Dispatch Feed
                </h2>
                <span className="text-xs font-mono text-neutral-500">
                  ({activeIncidents.length} Records)
                </span>
              </div>

              {/* Priority Filter Tabs */}
              <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-900 border border-neutral-800 text-xs font-mono">
                {["ALL", "CRITICAL", "HIGH"].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setFilterPriority(lvl)}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      filterPriority === lvl
                        ? "bg-neutral-800 text-white font-semibold"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* Incident Cards */}
            <div className="space-y-3">
              {activeIncidents.length === 0 ? (
                <div className="p-8 text-center rounded-xl bg-neutral-900/40 border border-neutral-800 text-neutral-500 font-mono text-xs">
                  No active incidents matching criteria. Standby for live intake.
                </div>
              ) : (
                activeIncidents.map((inc) => {
                  const isSelected = selectedIncident?.id === inc.id;
                  const isPanicHigh = inc.panic_index >= 8;

                  return (
                    <div
                      key={inc.id || inc.call_id}
                      onClick={() => setSelectedIncident(inc)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
                        isSelected
                          ? "bg-neutral-850 border-neutral-600 shadow-lg"
                          : "bg-neutral-900/70 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900"
                      }`}
                    >
                      {/* Priority left stripe */}
                      <div
                        className={`absolute top-0 left-0 bottom-0 w-1.5 ${
                          isPanicHigh ? "bg-red-500" : inc.panic_index >= 5 ? "bg-amber-500" : "bg-blue-500"
                        }`}
                      />

                      <div className="pl-2 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-neutral-400">
                                {inc.call_id}
                              </span>
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                                  isPanicHigh
                                    ? "bg-red-500/20 text-red-300 border border-red-500/30"
                                    : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                }`}
                              >
                                {inc.priority || (isPanicHigh ? "CRITICAL" : "HIGH")}
                              </span>
                              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
                                POSTGRES NOTIFY
                              </span>
                            </div>
                            <h3 className="text-base font-bold text-neutral-100 mt-1">
                              {inc.incident_type}
                            </h3>
                          </div>

                          {/* Panic Index Gauge */}
                          <div className="flex flex-col items-end">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-neutral-400">PANIC</span>
                              <span
                                className={`text-lg font-mono font-black ${
                                  isPanicHigh ? "text-red-400" : "text-amber-400"
                                }`}
                              >
                                {inc.panic_index}/10
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-neutral-500">
                              {inc.casualties} Casualties
                            </span>
                          </div>
                        </div>

                        {/* Location & Details */}
                        <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-neutral-400">
                          <span className="flex items-center gap-1 text-neutral-300">
                            <MapPin className="w-3.5 h-3.5 text-red-400" />
                            {inc.location}
                          </span>
                          <span className="flex items-center gap-1 text-neutral-400 font-mono text-[11px]">
                            <Clock className="w-3 h-3" />
                            {new Date(inc.created_at).toLocaleTimeString()}
                          </span>
                        </div>

                        {inc.caller_summary && (
                          <p className="text-xs text-neutral-400 line-clamp-2 italic bg-neutral-950/50 p-2 rounded border border-neutral-800/60">
                            "{inc.caller_summary}"
                          </p>
                        )}

                        {/* Units tags */}
                        {inc.recommended_units && inc.recommended_units.length > 0 && (
                          <div className="flex items-center gap-1.5 pt-1">
                            <Truck className="w-3.5 h-3.5 text-neutral-500" />
                            <div className="flex flex-wrap gap-1">
                              {inc.recommended_units.map((unit) => (
                                <span
                                  key={unit}
                                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700"
                                >
                                  {unit}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Selected Incident Triage & Actions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-200">
                Incident Triage Command
              </h2>
              <span className="text-xs font-mono text-neutral-500">ADK Tool Data</span>
            </div>

            {selectedIncident ? (
              <div className="p-5 rounded-2xl bg-neutral-900/90 border border-neutral-800 space-y-5 sticky top-24 shadow-2xl">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-red-400 font-bold">
                      {selectedIncident.call_id}
                    </span>
                    <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      EXTRACT_DISPATCH_DATA
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-neutral-100 mt-1">
                    {selectedIncident.incident_type}
                  </h3>
                  <p className="text-xs text-neutral-400 flex items-center gap-1.5 mt-1">
                    <MapPin className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    <span>{selectedIncident.location}</span>
                  </p>
                </div>

                {/* Paralinguistic Audio Assessment Details */}
                <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800/80 space-y-2">
                  <div className="text-xs font-mono font-bold text-neutral-300 flex items-center justify-between">
                    <span>PARALINGUISTIC TONE</span>
                    <span className="text-red-400 font-bold">
                      Panic Index: {selectedIncident.panic_index}/10
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
                      <span className="text-neutral-500 text-[10px] block">Vocal Screaming:</span>
                      <span className="text-red-400">
                        {selectedIncident.tone_assessment?.screaming_detected ? "DETECTED" : "None"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Summary & Casualty Count */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between font-mono text-neutral-400">
                    <span>Casualties Reported:</span>
                    <span className="text-amber-400 font-bold text-sm">
                      {selectedIncident.casualties}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/60 text-neutral-300 leading-relaxed text-xs">
                    {selectedIncident.caller_summary || "Automated intake synthesized by AURA ADK agent."}
                  </div>
                </div>

                {/* Recommended First Responders */}
                <div className="space-y-2">
                  <div className="text-xs font-mono font-bold text-neutral-400">
                    ASSIGNED RESCUE UNITS
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(selectedIncident.recommended_units || ["Engine 4", "Rescue 1"]).map((u) => (
                      <span
                        key={u}
                        className="px-2.5 py-1 rounded bg-neutral-800 text-neutral-200 font-mono text-xs border border-neutral-700 flex items-center gap-1.5"
                      >
                        <Truck className="w-3 h-3 text-red-400" />
                        {u}
                      </span>
                    ))}
                  </div>
                </div>

                {/* AI Suggested Response Section (Situational Caller Questions) */}
                {(() => {
                  const questions = generateSituationalQuestions(
                    selectedIncident.incident_type,
                    selectedIncident.panic_index,
                    selectedIncident.casualties
                  );
                  const filtered = questions.filter((q) => {
                    if (selectedQuestionCategory === "ALL") return true;
                    return q.category === selectedQuestionCategory;
                  });

                  return (
                    <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
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

                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {filtered.map((item) => {
                          const isCopied = copiedQuestionId === item.id;
                          const isTransmitted = transmittedQuestionId === item.id;

                          return (
                            <div
                              key={item.id}
                              className="p-3 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase bg-red-500/20 text-red-300 border border-red-500/30">
                                  {item.category} • {item.urgency}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      if (navigator?.clipboard) {
                                        navigator.clipboard.writeText(item.question);
                                        setCopiedQuestionId(item.id);
                                        setTimeout(() => setCopiedQuestionId(null), 2000);
                                      }
                                    }}
                                    className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-mono flex items-center gap-1 border border-neutral-700"
                                  >
                                    {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-neutral-400" />}
                                    <span>{isCopied ? "Copied" : "Copy"}</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setTransmittedQuestionId(item.id);
                                      setTimeout(() => setTransmittedQuestionId(null), 2500);
                                    }}
                                    className={`px-2 py-1 rounded text-[10px] font-mono font-bold flex items-center gap-1 ${
                                      isTransmitted ? "bg-emerald-600 text-white" : "bg-red-600 hover:bg-red-500 text-white"
                                    }`}
                                  >
                                    {isTransmitted ? <Check className="w-3 h-3" /> : <Send className="w-3 h-3" />}
                                    <span>{isTransmitted ? "Transmitted" : "Transmit"}</span>
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-neutral-100 font-medium leading-relaxed bg-black/40 p-2 rounded border border-neutral-800">
                                "{item.question}"
                              </p>
                              <div className="flex items-start gap-1.5 text-[10px] font-mono text-neutral-400">
                                <Lightbulb className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                                <span><strong>Rationale:</strong> {item.rationale}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Action Buttons */}
                <div className="space-y-2 pt-2 border-t border-neutral-800">
                  <button className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-950/50">
                    <Truck className="w-4 h-4" />
                    <span>DISPATCH ALL RECOMMENDED UNITS</span>
                  </button>

                  <button className="w-full py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-mono text-xs transition-colors flex items-center justify-center gap-2 border border-neutral-700">
                    <BellRing className="w-3.5 h-3.5 text-amber-400" />
                    <span>BROADCAST EVACUATION GEO-ALERT</span>
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
    </div>
  );
}
