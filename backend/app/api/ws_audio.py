"""
AURA Crisis Dispatch Co-Pilot - WebSocket Audio Pipeline (/ws/audio/{call_id})
Pipes raw browser microphone audio into Google ADK LiveClient (gemini-3.8-live),
manages bidirectional PCM streams, and enforces immediate caller barge-in interruption.
"""

import asyncio
import json
import logging
import base64
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.agent.adk_client import AuraLiveSession

logger = logging.getLogger("aura.ws_audio")
router = APIRouter()


@router.websocket("/ws/audio/{call_id}")
async def websocket_audio_endpoint(websocket: WebSocket, call_id: str):
    """
    Bidirectional WebSocket connection for live 911 audio intake:
    1. Client -> Server: Raw 16kHz PCM audio chunks (binary or base64) or control packets.
    2. Server -> Client: 24kHz synthesized AI voice chunks, transcription deltas,
       paralinguistic panic alerts, and barge-in cutoffs.
    """
    await websocket.accept()
    logger.info(f"[{call_id}] 911 Audio stream WebSocket accepted.")

    # Event flag to notify frontend instantly when caller interrupts AI
    async def notify_client_barge_in():
        try:
            await websocket.send_json({
                "type": "BARGE_IN_TRIGGERED",
                "call_id": call_id,
                "message": "Caller voice detected over AI speech. AI output aborted.",
                "action": "HALT_CLIENT_PLAYBACK"
            })
        except Exception as e:
            logger.warning(f"[{call_id}] Failed to send barge-in alert: {e}")

    session = AuraLiveSession(
        call_id=call_id,
        on_barge_in=lambda: asyncio.create_task(notify_client_barge_in())
    )

    try:
        await session.start()
        await websocket.send_json({
            "type": "SESSION_READY",
            "call_id": call_id,
            "model": "gemini-3.8-live",
            "message": "AURA emergency intake agent initialized and standing by."
        })
    except Exception as e:
        logger.error(f"[{call_id}] Failed to launch ADK LiveClient: {e}", exc_info=True)
        await websocket.send_json({
            "type": "ERROR",
            "call_id": call_id,
            "message": f"Could not connect to ADK LiveClient: {str(e)}"
        })
        await websocket.close()
        return

    # Background task: Stream ADK events (AI audio, tool calls, transcripts) back to browser
    async def stream_adk_to_client():
        try:
            async for event in session.receive_events():
                event_type = event.get("type")
                if event_type == "AUDIO_CHUNK":
                    # Send audio either as base64 or raw bytes
                    audio_b64 = base64.b64encode(event["audio"]).decode("utf-8")
                    await websocket.send_json({
                        "type": "AUDIO_RESPONSE",
                        "audio": audio_b64,
                        "sample_rate": event["sample_rate"]
                    })
                elif event_type == "INTERRUPTED":
                    await websocket.send_json({
                        "type": "BARGE_IN_TRIGGERED",
                        "call_id": call_id,
                        "message": "Caller interruption detected. Audio truncated."
                    })
                elif event_type == "TOOL_FIRED":
                    await websocket.send_json({
                        "type": "TOOL_INVOKED",
                        "call_id": call_id,
                        "tool": event["tool_name"],
                        "payload": event["arguments"]
                    })
                elif event_type == "TRANSCRIPT_DELTA":
                    await websocket.send_json({
                        "type": "TRANSCRIPTION",
                        "speaker": event["speaker"],
                        "text": event["text"]
                    })
        except Exception as err:
            logger.warning(f"[{call_id}] ADK reader ended: {err}")

    reader_task = asyncio.create_task(stream_adk_to_client())

    try:
        # Main Loop: Receive raw audio bytes or JSON packets from browser microphone
        while True:
            message = await websocket.receive()

            if "bytes" in message and message["bytes"]:
                # Binary 16kHz PCM audio chunk directly from client AudioWorklet
                pcm_bytes = message["bytes"]
                await session.send_audio_chunk(pcm_bytes)

            elif "text" in message and message["text"]:
                payload = json.loads(message["text"])
                msg_type = payload.get("type")

                if msg_type == "AUDIO_BASE64":
                    raw_bytes = base64.b64decode(payload["data"])
                    await session.send_audio_chunk(raw_bytes)

                elif msg_type == "PARALINGUISTIC_HEURISTIC":
                    # Telemetry from client-side audio analyzer (panic markers, RMS energy)
                    logger.debug(f"[{call_id}] Client paralinguistic tone packet: {payload}")

                elif msg_type == "TERMINATE_CALL":
                    logger.info(f"[{call_id}] Caller or dispatcher terminated the session.")
                    break

    except WebSocketDisconnect:
        logger.info(f"[{call_id}] WebSocket client disconnected.")
    except Exception as exc:
        logger.error(f"[{call_id}] WebSocket audio error: {exc}", exc_info=True)
    finally:
        reader_task.cancel()
        await session.close()
        logger.info(f"[{call_id}] Audio pipeline teardown complete.")
