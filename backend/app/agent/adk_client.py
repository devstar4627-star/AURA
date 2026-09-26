"""
AURA (Autonomous Urgent Response Agent) - Google ADK LiveClient Manager
=======================================================================

This module initializes and manages full-duplex, low-latency bidirectional voice
intake sessions using the Google Agent Development Kit (ADK) connected to 'gemini-3.8-live'.

Use Cases:
1. Intake live raw 16kHz PCM audio streaming over WebSockets from emergency callers in distress.
2. Intercept audio and trigger instantaneous barge-in cutoffs (<45ms) when caller shrieks or speaks over AI.
3. Transmit synthesized 24kHz audio guidance, grounding protocols, and conversational transcripts.
4. Execute ADK `@tool` calls (`extract_dispatch_data`) with Pydantic validated arguments.

Architecture:
- AI Framework: google-adk (LiveClient)
- Model: 'gemini-3.8-live'
- Tool: extract_dispatch_data
"""

import os
import logging
from typing import AsyncGenerator, Callable, Optional
from google.adk.live import LiveClient, LiveConfig, Modality, VoiceConfig
from app.config import settings
from app.agent.prompts import SYSTEM_INSTRUCTION
from app.agent.tools import extract_dispatch_data

logger = logging.getLogger("aura.adk")


def build_live_config() -> LiveConfig:
    """
    Constructs the LiveConfig for ADK's LiveClient using centralized settings.

    Returns:
        LiveConfig: The fully configured session object with 'gemini-3.8-live',
                    Aoede calm voice persona, barge-in enabled, and dispatch tools bound.
    """
    logger.info(
        f"[AURA GENAI INIT] Configuring ADK LiveClient: "
        f"model='{settings.agent.live_model}', voice='{settings.agent.voice_name}', "
        f"interruption={settings.agent.enable_interruption}, tools=['extract_dispatch_data']"
    )

    config = LiveConfig(
        model=settings.agent.live_model,
        system_instruction=SYSTEM_INSTRUCTION,
        modalities=[Modality.AUDIO],
        voice_config=VoiceConfig(
            prebuilt_voice_name=settings.agent.voice_name,
        ),
        # Strict barge-in configuration: AI immediately truncates its output turn
        # the moment caller voice energy or scream threshold is detected.
        enable_interruption=settings.agent.enable_interruption,
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
        """
        Initializes an AURA Live session instance.

        Args:
            call_id: Unique emergency call identifier (e.g. CALL-99124).
            on_barge_in: Optional callback invoked immediately when caller barge-in occurs.
            on_tone_update: Optional callback for paralinguistic audio telemetry.
        """
        logger.info(f"[{call_id}] AuraLiveSession.__init__ called with call_id='{call_id}'")
        self.call_id = call_id
        self.api_key = settings.agent.api_key
        self.config = build_live_config()
        self.client: Optional[LiveClient] = None
        self.on_barge_in = on_barge_in
        self.on_tone_update = on_tone_update
        self.is_active = False

    async def start(self):
        """
        Initializes the connection to gemini-3.8-live via ADK LiveClient.

        Raises:
            Exception: If ADK LiveClient fails to authenticate or open the websocket.
        """
        logger.info(f"[{self.call_id}] AuraLiveSession.start: Connecting to {settings.agent.live_model} via ADK...")
        self.client = LiveClient(
            api_key=self.api_key,
            config=self.config
        )
        await self.client.connect()
        self.is_active = True
        logger.info(f"[{self.call_id}] AuraLiveSession.start: ADK LiveClient session established successfully.")

    async def send_audio_chunk(self, pcm_data: bytes):
        """
        Pipes a raw 16kHz PCM audio chunk received from the browser microphone into ADK.

        Args:
            pcm_data: Raw byte array of 16-bit 16kHz mono PCM samples.
        """
        if not self.is_active or not self.client:
            raise RuntimeError("LiveClient session is not active")

        # Strip inline data when logging
        logger.debug(f"[{self.call_id}] AuraLiveSession.send_audio_chunk: {len(pcm_data)} bytes piped to ADK.")
        await self.client.send_realtime_audio(
            pcm_bytes=pcm_data,
            mime_type=settings.audio.input_mime_type
        )

    async def receive_events(self) -> AsyncGenerator[dict, None]:
        """
        Receives streaming events from the ADK LiveClient:
        - Audio chunks (24kHz PCM for browser playback)
        - Barge-in interruption triggers (caller spoke over AI)
        - Tool execution notifications
        - Paralinguistic tone & text transcripts

        Yields:
            dict: Event objects dispatched to client WebSockets.
        """
        if not self.client:
            return

        async for message in self.client.listen():
            # 1. Native Interruption / Barge-in detection
            if getattr(message, "interrupted", False):
                logger.info(f"[{self.call_id}] [BARGE-IN TRIGGERED] Caller spoke over AI turn. Aborting speech playback.")
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
                    "sample_rate": settings.audio.output_sample_rate
                }

            # 3. Model Text / Transcription Turn
            if hasattr(message, "text") and message.text:
                logger.info(f"[{self.call_id}] [AURA SPEECH OUTPUT]: {message.text}")
                yield {
                    "type": "TRANSCRIPT_DELTA",
                    "call_id": self.call_id,
                    "speaker": "AURA",
                    "text": message.text
                }

            # 4. Tool Invocation Result
            if hasattr(message, "tool_calls") and message.tool_calls:
                for call in message.tool_calls:
                    logger.info(f"[{self.call_id}] [ADK TOOL FIRED] function='{call.name}', args={call.args}")
                    yield {
                        "type": "TOOL_FIRED",
                        "call_id": self.call_id,
                        "tool_name": call.name,
                        "arguments": call.args
                    }

    async def close(self):
        """Gracefully closes ADK LiveClient session."""
        logger.info(f"[{self.call_id}] AuraLiveSession.close: Closing LiveClient connection.")
        self.is_active = False
        if self.client:
            await self.client.close()
            logger.info(f"[{self.call_id}] AuraLiveSession.close: LiveClient connection terminated.")
