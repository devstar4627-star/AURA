"""
AURA (Autonomous Urgent Response Agent) - FastAPI Server Entrypoint
Crisis Dispatch Co-Pilot Backend
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db_pool, start_postgres_listener, stop_postgres_listener
from app.api.ws_audio import router as audio_router
from app.api.sse_dashboard import router as sse_router

# Configure production logging format
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("aura.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages application startup and shutdown lifecycle.
    Initializes PostgreSQL connection pool and the native LISTEN worker.
    """
    logger.info("Initializing AURA Dispatch Co-Pilot Backend...")
    try:
        await init_db_pool()
        await start_postgres_listener()
        logger.info("AURA core services initialized and ready for emergency traffic.")
    except Exception as e:
        logger.warning(f"Database init warning (will retry on connect): {e}")

    yield

    logger.info("Gracefully shutting down AURA backend...")
    await stop_postgres_listener()
    logger.info("AURA backend shutdown complete.")


app = FastAPI(
    title="AURA - Autonomous Urgent Response Agent",
    description="Emergency 911 intake AI with Gemini 3.8 Live bidirectional voice, barge-in detection, and Postgres NOTIFY pub/sub streaming.",
    version="1.0.0",
    lifespan=lifespan
)

# Cross-Origin Resource Sharing for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Attach API routes
app.include_router(audio_router)
app.include_router(sse_router)


@app.get("/healthz")
async def health_check():
    """Liveness probe for deployment checks."""
    return {
        "status": "HEALTHY",
        "service": "AURA Crisis Dispatch Co-Pilot",
        "model": "gemini-3.8-live",
        "framework": "google-adk",
        "pubsub": "PostgreSQL LISTEN/NOTIFY"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
