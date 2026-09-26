"""
AURA Crisis Dispatch Co-Pilot - Server-Sent Events (SSE) Route (/api/events/dashboard)
Streams live 911 incidents to human dispatcher dashboards directly from PostgreSQL NOTIFY triggers.
"""

import asyncio
import json
import logging
from typing import AsyncGenerator
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from app.database import (
    register_sse_subscriber,
    unregister_sse_subscriber,
    fetch_recent_incidents
)

logger = logging.getLogger("aura.sse")
router = APIRouter()


async def event_generator(request: Request) -> AsyncGenerator[str, None]:
    """
    Subscribes to native Postgres NOTIFY channel 'dispatch_events' via an async queue
    and formats incoming incident data into the standard Server-Sent Events format.
    """
    client_queue = asyncio.Queue(maxsize=100)
    register_sse_subscriber(client_queue)

    try:
        # Initial greeting and ping
        yield f"event: CONNECTED\ndata: {json.dumps({'status': 'ONLINE', 'channel': 'dispatch_events'})}\n\n"

        # Hydrate dashboard with initial recent incidents
        initial_records = await fetch_recent_incidents(limit=10)
        yield f"event: INITIAL_STATE\ndata: {json.dumps(initial_records, default=str)}\n\n"

        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                logger.info("SSE client disconnected by client.")
                break

            try:
                # Wait for next NOTIFY event broadcasted from PostgreSQL
                event_data = await asyncio.wait_for(client_queue.get(), timeout=15.0)
                event_name = event_data.get("event", "DISPATCH_UPDATE")
                formatted_sse = f"event: {event_name}\ndata: {json.dumps(event_data, default=str)}\n\n"
                yield formatted_sse
            except asyncio.TimeoutError:
                # Send heartbeat keep-alive comment every 15s to keep proxy connection warm
                yield ": heartbeat ping\n\n"

    except asyncio.CancelledError:
        logger.info("SSE client connection cancelled.")
    finally:
        unregister_sse_subscriber(client_queue)


@router.get("/api/events/dashboard")
async def sse_dashboard_endpoint(request: Request):
    """
    SSE endpoint for the Next.js Crisis Dispatch Command Center.
    Pushes sub-millisecond dispatch updates triggered by PostgreSQL AFTER INSERT triggers.
    """
    return StreamingResponse(
        event_generator(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disables proxy buffering (nginx / Cloudflare)
        }
    )


@router.get("/api/incidents/recent")
async def get_recent_incidents():
    """HTTP fallback to retrieve recent incident records."""
    records = await fetch_recent_incidents(limit=25)
    return {"incidents": records}
