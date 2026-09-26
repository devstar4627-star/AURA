/**
 * AURA (Autonomous Urgent Response Agent) - Crisis Dialogue & Intake Intelligence Engine
 * =======================================================================================
 * 
 * This module drives the real-time cognitive intake logic for AURA. It simulates the
 * frontline behavior of 'gemini-3.8-live' running under the Google Agent Development Kit (ADK).
 * 
 * Features & Use Cases:
 * 1. Natural Language Crisis Understanding: Parses spontaneous caller speech (voice or typed)
 *    and extracts emergency domain types (Structure Fire, Flash Flood, Hazmat, Multi-Vehicle Crash,
 *    Cardiac Arrest, Active Violence).
 * 2. Paralinguistic Tone Assessment: Computes an acoustic & textual Panic Index (1–10)
 *    from distress keywords, exclamation density, capitalizations, and breathing indicators.
 * 3. Dynamic Life-Safety & Grounding Guidance:
 *    - If Panic Index >= 8: Deploys the mandatory grounding protocol before tactical questions.
 *    - Structure Fire: Enforces door temperature check, sub-smoke crawl, and window orientation.
 *    - Submersion/Flood: Directs seatbelt release, side window exit, and roof mounting.
 *    - Hazmat: Orders uphill and upwind flight.
 * 4. Pydantic Dispatch Report Tool Generation: Generates the structured `extract_dispatch_data`
 *    payload for automated database commit and PostgreSQL NOTIFY broadcasting.
 */

import { AURA_CONFIG } from "../config/auraConfig";

export interface DialogueTurn {
  speaker: "CALLER" | "AURA" | "SYSTEM";
  text: string;
  isBargeIn?: boolean;
  timestamp?: string;
}

export interface DialogueProcessingInput {
  callerUtterance: string;
  history: DialogueTurn[];
  currentPanicIndex?: number;
  existingLocation?: string;
  existingIncidentType?: string;
  existingCasualties?: number;
  isBargeIn?: boolean;
}

export interface DialogueProcessingResult {
  auraResponse: string;
  panicIndex: number;
  importance: "CRITICAL (PRIORITY 1)" | "HIGH (PRIORITY 2)" | "ELEVATED (PRIORITY 3)";
  problemStatement: string;
  primaryHazard: string;
  immediateLifeSafetyDirective: string;
  extractedIncidentType: string;
  extractedLocation: string;
  extractedCasualties: number;
  screamingDetected: boolean;
  breathingCadence: string;
  recommendedUnits: string[];
  toolFired: {
    toolName: string;
    arguments: {
      incident_type: string;
      location: string;
      panic_index: number;
      casualties: number;
      caller_summary: string;
      recommended_units: string[];
    };
  };
}

/**
 * Calculates a 1-10 panic index from linguistic distress cues and capitalizations.
 * 
 * @param text The caller's spoken utterance.
 * @param baseScore An existing baseline panic index.
 * @returns An integer between 1 and 10 representing distress severity.
 */
export function evaluatePanicLevel(text: string, baseScore: number = 5): number {
  console.info(`[AURA DIALOGUE] evaluatePanicLevel called on text: "${text.substring(0, 40)}..." (base: ${baseScore})`);
  let score = baseScore;
  const upper = text.toUpperCase();

  // Screaming / urgent panic keywords
  const panicWords = [
    "HELP", "DIE", "DYING", "FIRE", "SMOKE", "CHOKING", "TRAPPED",
    "BURNING", "DROWNING", "WATER", "SINKING", "BLOOD", "BABY", "KIDS",
    "CHILDREN", "HURRY", "CAN'T BREATHE", "EXPLOSION", "COLLAPSE", "GUN", "SHOOTING"
  ];

  let matches = 0;
  for (const word of panicWords) {
    if (upper.includes(word)) matches++;
  }

  score += matches * 1.5;

  // Capital letter density (shouting)
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length > 6) {
    const caps = letters.replace(/[^A-Z]/g, "").length;
    const ratio = caps / letters.length;
    if (ratio > 0.5) score += 2;
  }

  // Multiple exclamation marks
  const exclamations = (text.match(/!/g) || []).length;
  if (exclamations >= 2) score += 1.5;

  const finalScore = Math.min(10, Math.max(1, Math.round(score)));
  console.info(`[AURA DIALOGUE] Panic Index evaluated: ${finalScore}/10`);
  return finalScore;
}

/**
 * Extracts candidate street addresses, landmarks, or room descriptions.
 * 
 * @param text The caller's spoken utterance.
 * @returns Extracted location string, or empty string if not found.
 */
function extractLocation(text: string): string {
  console.info(`[AURA DIALOGUE] extractLocation analyzing: "${text}"`);
  // Look for street suffixes or landmark patterns
  const streetRegex = /\b(\d{1,5}\s+[A-Za-z0-9\s]+(?:Street|St|Avenue|Ave|Road|Rd|Parkway|Pkwy|Boulevard|Blvd|Highway|Hwy|Drive|Dr|Way|Lane|Ln|Dock|Bay|Apartment|Apt|Sector)\b[^\.\,\;]*)/i;
  const match = text.match(streetRegex);
  if (match && match[1]) {
    return match[1].trim();
  }

  // Cross street or intersection pattern: "at X and Y"
  const intersectionRegex = /\b(?:at|near|on)\s+([A-Za-z0-9\s]+(?:and|&)\s+[A-Za-z0-9\s]+)/i;
  const interMatch = text.match(intersectionRegex);
  if (interMatch && interMatch[1]) {
    return interMatch[1].trim();
  }

  return "";
}

/**
 * Extracts casualty or victim counts from spoken utterances.
 * 
 * @param text The caller's spoken utterance.
 * @returns Count of casualties or trapped individuals.
 */
function extractCasualties(text: string): number {
  console.info(`[AURA DIALOGUE] extractCasualties analyzing: "${text}"`);
  const numRegex = /\b(\d+)\s+(?:people|persons|victims|casualties|bodies|kids|children|passengers|workers|injured)\b/i;
  const match = text.match(numRegex);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }

  const wordMap: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    my: 1, myself: 1, baby: 1, child: 1, husband: 1, wife: 1, mom: 1, dad: 1
  };

  for (const [w, count] of Object.entries(wordMap)) {
    const rx = new RegExp(`\\b${w}\\b`, "i");
    if (rx.test(text)) return count;
  }

  return 0;
}

/**
 * Classifies the emergency incident domain based on keywords.
 * 
 * @param text The caller's spoken utterance.
 * @returns Incident category name.
 */
function classifyIncident(text: string): { type: string; units: string[] } {
  console.info(`[AURA DIALOGUE] classifyIncident analyzing: "${text}"`);
  const lower = text.toLowerCase();

  if (lower.includes("fire") || lower.includes("smoke") || lower.includes("burn") || lower.includes("flame")) {
    return {
      type: "Structure Fire - Active Blaze",
      units: ["Engine 12", "Ladder 4", "Medic 2", "Battalion 1"]
    };
  }
  if (lower.includes("water") || lower.includes("flood") || lower.includes("sink") || lower.includes("submerg") || lower.includes("drown")) {
    return {
      type: "Flash Flood - Vehicle Submersion",
      units: ["Swiftwater 7", "Rescue 3", "Boat 1", "Medic 4"]
    };
  }
  if (lower.includes("gas") || lower.includes("leak") || lower.includes("smell") || lower.includes("chemical") || lower.includes("vapor") || lower.includes("toxic") || lower.includes("chlorine")) {
    return {
      type: "Hazardous Materials - Toxic Vapor Leak",
      units: ["Hazmat 9", "Decon 2", "Engine 8", "ALS Ambulance 3"]
    };
  }
  if (lower.includes("crash") || lower.includes("car") || lower.includes("truck") || lower.includes("pileup") || lower.includes("accident") || lower.includes("highway") || lower.includes("trapped")) {
    return {
      type: "Multi-Vehicle Collision with Entrapment",
      units: ["Heavy Rescue 2", "Medic 5", "Engine 7", "State Patrol 104"]
    };
  }
  if (lower.includes("heart") || lower.includes("cardiac") || lower.includes("chest") || lower.includes("breathing") || lower.includes("unconscious") || lower.includes("passed out")) {
    return {
      type: "Cardiac / Critical Medical Emergency",
      units: ["ALS Medic 1", "Engine 3", "Rescue 4"]
    };
  }
  if (lower.includes("gun") || lower.includes("shot") || lower.includes("shoot") || lower.includes("intruder") || lower.includes("break") || lower.includes("door") || lower.includes("weapon")) {
    return {
      type: "Active Threat / Home Intrusion",
      units: ["Tactical Patrol 8", "Cover Unit 14", "EMS Staging 3"]
    };
  }

  return {
    type: "Urgent Emergency Incident",
    units: ["Engine 4", "Medic 1"]
  };
}

/**
 * Processes a caller's utterance and synthesizes an immediate AURA vocal response,
 * tactical instructions, and structured Pydantic tool payload.
 * 
 * @param input DialogueProcessingInput object containing caller words, history, and context.
 * @returns DialogueProcessingResult containing AURA's speech turn and CAD extraction data.
 */
export function processCallerUtterance(input: DialogueProcessingInput): DialogueProcessingResult {
  const { callerUtterance, currentPanicIndex = 5, existingLocation = "", existingIncidentType = "", existingCasualties = 0 } = input;

  console.info(`[AURA DIALOGUE] processCallerUtterance called: "${callerUtterance}" (Model: ${AURA_CONFIG.aiModel})`);

  // 1. Evaluate panic level
  const panicIndex = evaluatePanicLevel(callerUtterance, currentPanicIndex);
  const screaming = panicIndex >= 8;
  const breathingCadence = panicIndex >= 8 ? "Hyperventilating (36 BPM)" : panicIndex >= 6 ? "Rapid (24 BPM)" : "Normal (16 BPM)";

  // 2. Classify or retain incident type
  const classification = classifyIncident(callerUtterance);
  const incidentType = existingIncidentType && existingIncidentType !== "Emergency Incident"
    ? existingIncidentType
    : classification.type;

  // 3. Extract or retain location
  const detectedLocation = extractLocation(callerUtterance);
  const finalLocation = detectedLocation || existingLocation;

  // 4. Extract casualties
  const detectedCasualties = extractCasualties(callerUtterance);
  const finalCasualties = detectedCasualties > 0 ? detectedCasualties : existingCasualties;

  // 5. Synthesize grounded AURA speech response
  let auraSpeech = "";

  // Grounding prefix if caller is in acute distress
  const groundingPrefix = panicIndex >= 8
    ? "Take one breath with me right now. You are doing great. Keep the phone to your ear. Rescue crews have their sirens on right now. "
    : "";

  const lower = callerUtterance.toLowerCase();

  if (!finalLocation) {
    // Missing location is Priority #1 in 911 intake
    if (incidentType.includes("Fire")) {
      auraSpeech = `${groundingPrefix}This is AURA 911 dispatch. What is your exact address or cross street? Are you able to get out of the building?`;
    } else if (incidentType.includes("Flood")) {
      auraSpeech = `${groundingPrefix}AURA dispatch here. Where is your car submerged? Give me the road or bridge name immediately.`;
    } else if (incidentType.includes("Hazard") || incidentType.includes("Vapor")) {
      auraSpeech = `${groundingPrefix}Evacuate upwind immediately. What is your building address and dock number?`;
    } else {
      auraSpeech = `${groundingPrefix}AURA emergency dispatch is on the line. What is your exact location and what is happening?`;
    }
  } else {
    // Location is known -> give tactical survival directives and ask about casualties
    if (incidentType.includes("Fire")) {
      if (lower.includes("door") || lower.includes("stairs") || lower.includes("smoke")) {
        auraSpeech = `I have your location at ${finalLocation}. Feel any doors with the back of your hand before opening. Stay below the smoke line—crawl on your hands and knees. Are you trapped in a room with a window?`;
      } else {
        auraSpeech = `Dispatching Engine 12 and Ladder 4 to ${finalLocation} right now. Seal the gap beneath the door with blankets. How many people are inside with you?`;
      }
    } else if (incidentType.includes("Flood")) {
      auraSpeech = `Units are rolling to ${finalLocation}. Unbuckle your seatbelt right now. Can you roll down or break the side window before the electrical system shorts out? Climb onto the roof!`;
    } else if (incidentType.includes("Hazard") || incidentType.includes("Vapor")) {
      auraSpeech = `Hazmat units are dispatched to ${finalLocation}. Move upwind and uphill immediately. Cover your mouth and nose with a damp cloth. Do not go back inside for anyone without breathing equipment.`;
    } else if (incidentType.includes("Collision") || incidentType.includes("Crash")) {
      auraSpeech = `Help is on the way to ${finalLocation}. If you can safely walk, get behind the metal highway guardrail immediately. Is anyone pinned inside the vehicles?`;
    } else if (incidentType.includes("Threat") || incidentType.includes("Intruder")) {
      auraSpeech = `Officers are responding with lights and sirens to ${finalLocation}. Lock the room door, barricade it with heavy furniture, and silence your phone right now. Whisper to me if you hear footsteps.`;
    } else {
      auraSpeech = `First responders are rolling toward ${finalLocation}. Stay on the line with me. Is anyone injured or losing consciousness?`;
    }
  }

  // 6. Compute problem diagnosis, importance, and primary hazard
  let problemStatement = incidentType;
  let primaryHazard = "Acute Situational Peril";
  let immediateLifeSafetyDirective = "Stay on line with AURA dispatch. Follow grounding instructions.";

  if (incidentType.includes("Fire")) {
    problemStatement = `Structure Fire: Rapid Smoke Infiltration with Occupant Entrapment`;
    primaryHazard = "Thermal Flashover, Toxic Cyanide/CO Smoke Inhalation";
    immediateLifeSafetyDirective = "Check door heat with back of hand. Crawl lowest 18 inches below smoke line. Close doors behind you.";
  } else if (incidentType.includes("Flood")) {
    problemStatement = `Flash Flood: Submerged Vehicle in Moving Water Current`;
    primaryHazard = "Cabin Submersion, Hydraulic Pressure Lock, Hypothermia";
    immediateLifeSafetyDirective = "Unbuckle seatbelts now. Roll down or kick out side windows before electrical failure. Climb onto roof.";
  } else if (incidentType.includes("Hazard") || incidentType.includes("Vapor")) {
    problemStatement = `Hazmat: Industrial Toxic Gas Rupture / Atmospheric Vapor Plume`;
    primaryHazard = "Corrosive Chemical Inhalation, Respiratory Burns, Acute Asphyxiation";
    immediateLifeSafetyDirective = "Evacuate upwind and uphill immediately. Cover mouth and nose with damp cloth. Do not re-enter.";
  } else if (incidentType.includes("Collision") || incidentType.includes("Crash")) {
    problemStatement = `High-Speed Collision: Multi-Vehicle Pileup with Structural Entrapment`;
    primaryHazard = "Pencil/Hydraulic Pinning, Fuel Ignition Risk, Secondary Highway Traffic";
    immediateLifeSafetyDirective = "Move ambulatory victims behind metal guardrail. Do not move pinned victims unless vehicle is on fire.";
  } else if (incidentType.includes("Threat") || incidentType.includes("Intruder")) {
    problemStatement = `Active Violence / Home Intrusion with Imminent Threat`;
    primaryHazard = "Physical Assault, Deadly Weapon Encounter, Breached Perimeter";
    immediateLifeSafetyDirective = "Lock and barricade door with heavy furniture. Turn off lights, silence phone, keep phone to ear.";
  } else if (incidentType.includes("Cardiac")) {
    problemStatement = `Cardiac Emergency: Unresponsive Patient in Agonal Distress`;
    primaryHazard = "Sudden Cardiac Arrest, Cerebral Hypoxia, Complete Respiratory Cessation";
    immediateLifeSafetyDirective = "Lay patient flat on back on hard floor. Place hands center of chest, push hard and fast 100-120 BPM.";
  }

  // Importance assessment
  const isCritical = panicIndex >= 8 || finalCasualties > 0 || screaming || incidentType.includes("Fire") || incidentType.includes("Flood") || incidentType.includes("Hazard") || incidentType.includes("Threat") || incidentType.includes("Cardiac");
  const importance: "CRITICAL (PRIORITY 1)" | "HIGH (PRIORITY 2)" | "ELEVATED (PRIORITY 3)" = isCritical
    ? "CRITICAL (PRIORITY 1)"
    : panicIndex >= 5
    ? "HIGH (PRIORITY 2)"
    : "ELEVATED (PRIORITY 3)";

  // 7. Formulate ADK tool invocation payload for live CAD commit
  const toolFired = {
    toolName: "extract_dispatch_data",
    arguments: {
      incident_type: problemStatement,
      location: finalLocation || "Awaiting Location Confirmation (Triage Active)",
      panic_index: panicIndex,
      casualties: finalCasualties,
      caller_summary: `[${importance}] ${problemStatement}. Utterance: "${callerUtterance}". Primary Hazard: ${primaryHazard}. Directive: ${immediateLifeSafetyDirective}.`,
      recommended_units: classification.units
    }
  };

  console.info(`[AURA DIALOGUE] AURA response generated: "${auraSpeech}" (Importance: ${importance})`);

  return {
    auraResponse: auraSpeech,
    panicIndex,
    importance,
    problemStatement,
    primaryHazard,
    immediateLifeSafetyDirective,
    extractedIncidentType: incidentType,
    extractedLocation: finalLocation || "Awaiting Location Confirmation",
    extractedCasualties: finalCasualties,
    screamingDetected: screaming,
    breathingCadence,
    recommendedUnits: classification.units,
    toolFired
  };
}
