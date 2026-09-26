"""
AURA (Autonomous Urgent Response Agent) - Centralized Backend Configuration
===========================================================================

This module serves as the single source of truth for all configurable runtime parameters,
model aliases, network endpoints, acoustic thresholds, and database connection strings
used throughout the AURA Crisis Dispatch Co-Pilot backend service.

Use Cases:
1. Environment-driven configuration for local development, staging, and high-availability production.
2. Centralized definition of the Google Agent Development Kit (ADK) Gemini Live model alias ('gemini-3.8-live').
3. Audio DSP parameter synchronization (16kHz PCM intake, 24kHz synthesized output).
4. Paralinguistic distress assessment bounds and barge-in audio energy cutoffs.
"""

import os
from typing import List
from pydantic import BaseModel, Field


class AudioConfig(BaseModel):
    """Configuration for raw audio input/output streaming pipelines."""
    input_sample_rate: int = Field(default=16000, description="Caller microphone sampling rate (16kHz PCM).")
    output_sample_rate: int = Field(default=24000, description="ADK synthesized voice output sampling rate (24kHz).")
    input_mime_type: str = Field(default="audio/pcm;rate=16000", description="MIME format for ADK realtime audio.")
    barge_in_energy_threshold_db: float = Field(default=42.0, description="Minimum dB threshold to trigger barge-in cutoff.")
    chunk_buffer_ms: int = Field(default=100, description="Audio buffering window in milliseconds.")


class AgentModelConfig(BaseModel):
    """Centralized definition of AI models and Google ADK session parameters."""
    live_model: str = Field(
        default="gemini-3.8-live",
        description="Standard frontline Gemini model for real-time bidirectional audio and tool execution."
    )
    voice_name: str = Field(
        default="Aoede",
        description="Prebuilt voice persona tuned for calm, grounded emergency intake."
    )
    enable_interruption: bool = Field(
        default=True,
        description="Mandatory barge-in support enabling the caller to interrupt AI speech instantaneously."
    )
    api_key: str = Field(
        default_factory=lambda: os.getenv("GEMINI_API_KEY", ""),
        description="Google GenAI API key injected via runtime secrets."
    )


class DatabaseConfig(BaseModel):
    """PostgreSQL native Pub/Sub and connection pool configuration."""
    database_url: str = Field(
        default_factory=lambda: os.getenv(
            "DATABASE_URL",
            "postgresql://postgres:postgres@localhost:5432/aura_dispatch"
        ),
        description="PostgreSQL asyncpg connection DSN."
    )
    pubsub_channel: str = Field(
        default="dispatch_events",
        description="PostgreSQL native LISTEN/NOTIFY channel name."
    )
    pool_min_size: int = Field(default=2, description="Minimum asyncpg connection pool size.")
    pool_max_size: int = Field(default=10, description="Maximum asyncpg connection pool size.")
    command_timeout_sec: float = Field(default=60.0, description="Query execution timeout limit in seconds.")


class ServerSettings(BaseModel):
    """Global application settings and CORS configurations."""
    app_name: str = "AURA - Crisis Dispatch Co-Pilot"
    version: str = "1.0.0"
    debug: bool = Field(default_factory=lambda: os.getenv("DEBUG", "false").lower() == "true")
    cors_origins: List[str] = ["*"]
    audio: AudioConfig = Field(default_factory=AudioConfig)
    agent: AgentModelConfig = Field(default_factory=AgentModelConfig)
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)


# Singleton settings instance
settings = ServerSettings()
