"""
AURA Crisis Dispatch Co-Pilot - Google ADK LiveClient Initialization
Configured for 'gemini-3.8-live' with bidirectional voice, interruption (barge-in),
paralinguistic tone analysis, and automated dispatch tool execution.
"""

import os
import logging
from typing import AsyncGenerator, Callable, Optional
from google.adk.live import LiveClient, LiveConfig, Modality, VoiceConfig
from google.genai import types
from app.agent.prompts import SYSTEM_INSTRUCTION
from app.agent.tools import extract_dispatch_data

logger = logging.getLogger("aura.adk")


def build_live_config() -> LiveConfig:
    """
    Constructs the LiveConfig for ADK's LiveClient.
    Configures voice characteristics, barge-in / interruption handling,
    and binds the extract_dispatch_data Pydantic tool.
    """
    config = LiveConfig(
        model="gemini-3.8-live",
        system_instruction=SYSTEM_INSTRUCTION,
        modalities=[Modality.AUDIO],
        voice_config=VoiceConfig(
            prebuilt_voice_name="Aoede",  # Authoritative, calm, grounding emergency intake voice
        ),
        # Strict barge-in configuration: AI immediately truncates its output turn
        # the moment caller voice energy or scream threshold is detected.
        enable_interruption=True,
        tools=[extract_dispatch_data],
    )
    return config


class AuraLiveSession:
    """
    Manages an active 911 intake audio session with the Gemini Live API via ADK.
    Streams 16kHz PCM audio from the caller and yields 24kHz synthesized audio
    while listening for paralinguistic tone markers and barge-in interruptions.
    """

    def __init__(
        self,
        call_id: str,
        on_barge_in: Optional[Callable[[], None]] = None,
        on_tone_update: Optional[Callable[[dict], None]] = None
    ):
        self.call_id = call_id
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.config = build_live_config()
        self.client: Optional[LiveClient] = None
        self.on_barge_in = on_barge_in
        self.on_tone_update = on_tone_update
        self.is_active = False

    async def start(self):
        """Initializes connection to gemini-3.8-live via ADK LiveClient."""
        logger.info(f"[{self.call_id}] Initializing ADK LiveClient session on gemini-3.8-live...")
        self.client = LiveClient(
            api_key=self.api_key,
            config=self.config
        )
        await self.client.connect()
        self.is_active = True
        logger.info(f"[{self.call_id}] ADK LiveClient connected successfully. Ready for raw PCM streaming.")

    async def send_audio_chunk(self, pcm_data: bytes):
        """
        Pipes raw 16kHz PCM audio chunk received from browser microphone into ADK Live session.
        """
        if not self.is_active or not self.client:
            raise RuntimeError("LiveClient session is not active")
        
        await self.client.send_realtime_audio(
            pcm_bytes=pcm_data,
            mime_type="audio/pcm;rate=16000"
        )

    async def receive_events(self) -> AsyncGenerator[dict, None]:
        """
        Receives streaming events from ADK LiveClient:
        - Audio chunks (24kHz PCM for browser playback)
        - Barge-in interruption triggers (caller spoke over AI)
        - Tool execution notifications
        - Paralinguistic tone & text transcripts
        """
        if not self.client:
            return

        async for message in self.client.listen():
            # 1. Native Interruption / Barge-in detection
            if getattr(message, "interrupted", False):
                logger.info(f"[{self.call_id}] [BARGE-IN] Caller interrupted AI speech. Halting playback.")
                if self.on_barge_in:
                    self.on_barge_in()
                yield {
                    "type": "INTERRUPTED",
                    "call_id": self.call_id,
                    "message": "AI speech aborted by caller barge-in"
                }
                continue

            # 2. Synthesized Audio Response Turn
            if hasattr(message, "audio_bytes") and message.audio_bytes:
                yield {
                    "type": "AUDIO_CHUNK",
                    "call_id": self.call_id,
                    "audio": message.audio_bytes,
                    "sample_rate": 24000
                }

            # 3. Model Text / Transcription Turn
            if hasattr(message, "text") and message.text:
                yield {
                    "type": "TRANSCRIPT_DELTA",
                    "call_id": self.call_id,
                    "speaker": "AURA",
                    "text": message.text
                }

            # 4. Tool Invocation Result
            if hasattr(message, "tool_calls") and message.tool_calls:
                for call in message.tool_calls:
                    logger.info(f"[{self.call_id}] [TOOL EXECUTED] {call.name} with args: {call.args}")
                    yield {
                        "type": "TOOL_FIRED",
                        "call_id": self.call_id,
                        "tool_name": call.name,
                        "arguments": call.args
                    }

    async def close(self):
        """Gracefully closes ADK LiveClient session."""
        self.is_active = False
        if self.client:
            await self.client.close()
            logger.info(f"[{self.call_id}] ADK LiveClient session closed.")
