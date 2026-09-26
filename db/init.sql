-- ============================================================================
-- AURA (Autonomous Urgent Response Agent) - Database Schema & Triggers
-- Crisis Dispatch Co-Pilot Pub/Sub Architecture using native PostgreSQL NOTIFY
-- ============================================================================

-- Ensure uuid-ossp or pgcrypto is enabled for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Incidents table for 911 intake records
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id VARCHAR(64) NOT NULL DEFAULT 'CALL-' || floor(random() * 90000 + 10000)::text,
    incident_type VARCHAR(100) NOT NULL,
    location TEXT NOT NULL,
    panic_index INT NOT NULL CHECK (panic_index >= 1 AND panic_index <= 10),
    casualties INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'NEW_INTAKE',
    priority VARCHAR(20) NOT NULL DEFAULT 'PRIORITY_1',
    caller_summary TEXT,
    tone_assessment JSONB DEFAULT '{"screaming_detected": false, "breathing_rate": "elevated", "background_noise": "chaotic"}'::jsonb,
    recommended_units TEXT[] DEFAULT ARRAY['Engine 4', 'Rescue 1'],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for high-throughput dispatch queries
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_panic_index ON incidents(panic_index DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);

-- ----------------------------------------------------------------------------
-- Trigger Function: notify_dispatch_incident
-- Millisecond notification broadcast on channel 'dispatch_events'
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_dispatch_incident()
RETURNS TRIGGER AS $$
DECLARE
    payload JSONB;
BEGIN
    payload = jsonb_build_object(
        'event', 'NEW_DISPATCH_REPORT',
        'timestamp', EXTRACT(EPOCH FROM NOW()),
        'data', jsonb_build_object(
            'id', NEW.id,
            'call_id', NEW.call_id,
            'incident_type', NEW.incident_type,
            'location', NEW.location,
            'panic_index', NEW.panic_index,
            'casualties', NEW.casualties,
            'status', NEW.status,
            'priority', CASE 
                WHEN NEW.panic_index >= 8 OR NEW.casualties > 0 THEN 'CRITICAL'
                WHEN NEW.panic_index >= 5 THEN 'HIGH'
                ELSE 'ROUTINE'
            END,
            'caller_summary', NEW.caller_summary,
            'tone_assessment', NEW.tone_assessment,
            'recommended_units', NEW.recommended_units,
            'created_at', NEW.created_at
        )
    );

    -- Natively broadcast to listening clients via Postgres pub/sub
    PERFORM pg_notify('dispatch_events', payload::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach AFTER INSERT trigger to incidents table
DROP TRIGGER IF EXISTS trg_notify_dispatch_incident ON incidents;
CREATE TRIGGER trg_notify_dispatch_incident
AFTER INSERT ON incidents
FOR EACH ROW
EXECUTE FUNCTION notify_dispatch_incident();

-- Initial seed data for testing the mission-control dashboard
INSERT INTO incidents (call_id, incident_type, location, panic_index, casualties, status, caller_summary, recommended_units)
VALUES 
('CALL-99124', 'Structure Fire - Trapped Residents', '442 Industrial Parkway, Sector 4', 9, 3, 'UNITS_DISPATCHED', 'Call disconnected after reporting heavy smoke and 3 people on second floor balcony.', ARRAY['Engine 12', 'Ladder 4', 'Medic 2', 'Battalion 1']),
('CALL-99118', 'Flash Flood - Submerged Vehicle', 'Creek Road & 5th Avenue Underpass', 8, 1, 'EN_ROUTE', 'Sedan washed off roadway by rapid floodwaters. Driver on car roof screaming for rescue.', ARRAY['Swiftwater 7', 'Rescue 3', 'Boat 1']),
('CALL-99105', 'Chemical Spill / Vapor Cloud', 'Bay 14 Warehouses, Dock Street', 7, 0, 'CONTAINMENT', 'Pungent chlorine-like odor with visible yellow plume after forklift ruptured drum.', ARRAY['Hazmat 9', 'Engine 8', 'Decon 1'])
ON CONFLICT DO NOTHING;
