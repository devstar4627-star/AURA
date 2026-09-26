"""
AURA Crisis Dispatch Co-Pilot - Pydantic Tools & Dispatch Report Schema
"""

from typing import Optional, List
from pydantic import BaseModel, Field
import json
import logging
from google.adk.tools import tool  # Google ADK tool decorator
from app.database import get_db_pool

logger = logging.getLogger("aura.tools")


class ToneMetrics(BaseModel):
    screaming_detected: bool = Field(
        default=False, 
        description="Whether high-frequency screaming or vocal shrieking was detected in the audio stream."
    )
    breathing_rate: str = Field(
        default="elevated", 
        description="Assessed breathing pattern: 'normal', 'elevated', 'hyperventilating', or 'agonal'."
    )
    background_noise: str = Field(
        default="chaotic", 
        description="Acoustic environmental context (e.g. fire roar, storm wind, sirens, alarms, rushing water)."
    )


class DispatchReport(BaseModel):
    """
    Structured emergency intake report extracted by AURA during live 911 intake.
    """
    incident_type: str = Field(
        ...,
        description="Categorized crisis classification (e.g. 'Structure Fire - Trapped Occupants', 'Flash Flood - Vehicle Submersion', 'Multi-Vehicle Collision', 'Active Shooter / Violence', 'Severe Medical - Cardiac Arrest')."
    )
    location: str = Field(
        ...,
        description="Exact street address, cross streets, mile marker, or geospatial landmark identified from the caller."
    )
    panic_index: int = Field(
        ...,
        ge=1,
        le=10,
        description="Paralinguistic distress assessment score (1 = Calm, 5 = High Anxiety, 8 = Severe Panic, 10 = Hysterical/Critical Shock) derived from speech rate, pitch variance, and breathing."
    )
    casualties: int = Field(
        ...,
        ge=0,
        description="Number of confirmed or estimated injured, trapped, or unconscious persons requiring immediate rescue or EMS triage."
    )
    caller_summary: Optional[str] = Field(
        default="Emergency intake recorded by AURA AI dispatcher.",
        description="Brief concise summary of the caller's immediate threat and situational hazards."
    )
    tone_assessment: Optional[ToneMetrics] = Field(
        default_factory=ToneMetrics,
        description="Acoustic and paralinguistic tone analysis extracted from raw caller voice."
    )
    recommended_units: Optional[List[str]] = Field(
        default_factory=lambda: ["Engine 1", "Medic 1"],
        description="Recommended emergency first-responder units to deploy immediately."
    )


@tool
async def extract_dispatch_data(report: DispatchReport) -> dict:
    """
    Extracts structured crisis dispatch data from the live 911 audio session 
    and inserts it into PostgreSQL. 
    The database trigger IMMEDIATELY fires a pg_notify event on 'dispatch_events'
    which streams via SSE to the human dispatcher command center.
    """
    logger.info(
        f"[AURA DISPATCH TOOL FIRED] Incident: {report.incident_type} | "
        f"Location: {report.location} | Panic: {report.panic_index}/10 | Casualties: {report.casualties}"
    )

    try:
        pool = await get_db_pool()
        async with pool.acquire() as connection:
            # Automatic unit assignment recommendation based on incident type & panic
            units = report.recommended_units or []
            if not units or units == ["Engine 1", "Medic 1"]:
                inc_lower = report.incident_type.lower()
                if "fire" in inc_lower:
                    units = ["Engine 4", "Ladder 12", "Medic 3", "Battalion 1"]
                elif "flood" in inc_lower or "water" in inc_lower:
                    units = ["Swiftwater 7", "Rescue 3", "Medic 5", "Boat 2"]
                elif "crash" in inc_lower or "vehicle" in inc_lower or "collision" in inc_lower:
                    units = ["Heavy Rescue 2", "Engine 9", "Medic 1", "Traffic Patrol"]
                elif "medical" in inc_lower or "cardiac" in inc_lower:
                    units = ["Medic 4", "ALS Unit 2", "Engine 1"]
                else:
                    units = ["Patrol 104", "Engine 3", "Medic 2"]

            # Insert into incidents table - Postgres AFTER INSERT trigger fires notify_dispatch_incident()
            query = """
                INSERT INTO incidents (
                    incident_type, location, panic_index, casualties, 
                    caller_summary, tone_assessment, recommended_units, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id, call_id, created_at;
            """

            tone_json = report.tone_assessment.model_dump_json() if report.tone_assessment else "{}"

            record = await connection.fetchrow(
                query,
                report.incident_type,
                report.location,
                report.panic_index,
                report.casualties,
                report.caller_summary,
                tone_json,
                units,
                "UNITS_REQUESTED"
            )

            result = {
                "status": "SUCCESS",
                "incident_id": str(record["id"]),
                "call_id": record["call_id"],
                "message": "Dispatch report validated and committed to PostgreSQL. Real-time NOTIFY broadcast initiated.",
                "dispatched_units": units
            }
            logger.info(f"[AURA DISPATCH STORED] ID={record['id']} Broadcast sent to SSE dashboard.")
            return result

    except Exception as e:
        logger.error(f"[AURA DISPATCH ERROR] Failed to store dispatch report: {e}", exc_info=True)
        return {
            "status": "ERROR",
            "message": f"Database insertion failed: {str(e)}",
            "fallback_payload": report.model_dump()
        }
