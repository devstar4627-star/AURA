"""
AURA Crisis Dispatch Co-Pilot - PostgreSQL Database & Native Pub/Sub (LISTEN/NOTIFY)
Natively listens to Postgres channel 'dispatch_events' triggered by AFTER INSERT on incidents.
Zero Redis dependency.
"""

import os
import asyncio
import json
import logging
from typing import Optional, AsyncGenerator, Callable, Set
import asyncpg

logger = logging.getLogger("aura.database")

# Database connection settings
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://postgres:postgres@localhost:5432/aura_dispatch"
)

# Global asyncpg connection pool
_db_pool: Optional[asyncpg.Pool] = None

# Dedicated listener connection for LISTEN dispatch_events
_listener_conn: Optional[asyncpg.Connection] = None

# Set of active SSE queues subscribed to Postgres NOTIFY events
_sse_subscribers: Set[asyncio.Queue] = set()


async def init_db_pool() -> asyncpg.Pool:
    """Initializes the asyncpg connection pool."""
    global _db_pool
    if _db_pool is None:
        logger.info("Initializing asyncpg connection pool...")
        _db_pool = await asyncpg.create_pool(
            dsn=DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=60
        )
        logger.info("asyncpg connection pool established.")
    return _db_pool


async def get_db_pool() -> asyncpg.Pool:
    """Returns or initializes the active asyncpg connection pool."""
    global _db_pool
    if _db_pool is None:
        await init_db_pool()
    return _db_pool


def _handle_postgres_notify(connection, pid: int, channel: str, payload: str):
    """
    Direct callback triggered by PostgreSQL whenever pg_notify('dispatch_events', ...) runs.
    Pushes the raw JSON event payload to all active SSE dispatcher queues with sub-millisecond latency.
    """
    logger.info(f"[POSTGRES NOTIFY] Channel: {channel} (PID {pid}) -> Broadcast to {len(_sse_subscribers)} dispatcher clients")
    try:
        event_data = json.loads(payload)
    except Exception:
        event_data = {"event": "RAW_NOTIFY", "payload": payload}

    # Broadcast to all active SSE queues
    for queue in list(_sse_subscribers):
        try:
            queue.put_nowait(event_data)
        except asyncio.QueueFull:
            logger.warning("Subscriber SSE queue full; skipping message.")


async def start_postgres_listener():
    """
    Maintains a dedicated PostgreSQL connection in LISTEN mode on channel 'dispatch_events'.
    """
    global _listener_conn
    logger.info("Starting PostgreSQL LISTEN worker on channel 'dispatch_events'...")
    try:
        _listener_conn = await asyncpg.connect(DATABASE_URL)
        await _listener_conn.add_listener('dispatch_events', _handle_postgres_notify)
        logger.info("[PUB/SUB ACTIVE] Listening to 'dispatch_events' directly on PostgreSQL.")
    except Exception as e:
        logger.error(f"Failed to bind PostgreSQL LISTEN worker: {e}", exc_info=True)


async def stop_postgres_listener():
    """Cleans up the listener connection and connection pool."""
    global _listener_conn, _db_pool
    if _listener_conn:
        try:
            await _listener_conn.remove_listener('dispatch_events', _handle_postgres_notify)
            await _listener_conn.close()
        except Exception:
            pass
        _listener_conn = None

    if _db_pool:
        await _db_pool.close()
        _db_pool = None
    logger.info("PostgreSQL connections and listeners released.")


def register_sse_subscriber(queue: asyncio.Queue):
    """Registers an SSE client queue to receive Postgres notifications."""
    _sse_subscribers.add(queue)
    logger.info(f"New SSE dispatcher connected. Total active subscribers: {len(_sse_subscribers)}")


def unregister_sse_subscriber(queue: asyncio.Queue):
    """Unregisters an SSE client queue upon disconnection."""
    _sse_subscribers.discard(queue)
    logger.info(f"SSE dispatcher disconnected. Remaining active subscribers: {len(_sse_subscribers)}")


async def fetch_recent_incidents(limit: int = 20) -> list:
    """Retrieves recent emergency intake records for initial dashboard hydration."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        records = await conn.fetch(
            """
            SELECT 
                id::text,
                call_id,
                incident_type,
                location,
                panic_index,
                casualties,
                status,
                caller_summary,
                tone_assessment,
                recommended_units,
                created_at
            FROM incidents
            ORDER BY created_at DESC
            LIMIT $1
            """,
            limit
        )
        return [dict(r) for r in records]
