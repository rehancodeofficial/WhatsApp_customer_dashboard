-- Migration 2: Functions and triggers

-- set_ai_mode function (Atomic, race-safe with SELECT ... FOR UPDATE)
CREATE OR REPLACE FUNCTION set_ai_mode(
    p_conversation_id UUID,
    p_mode conversation_mode,
    p_user_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_resume_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS conversations
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_conversation conversations;
    v_prev_mode conversation_mode;
    v_ai_enabled BOOLEAN;
    v_paused_at TIMESTAMPTZ;
BEGIN
    -- Acquire exclusive row lock to avoid race conditions
    SELECT * INTO v_conversation
    FROM conversations
    WHERE id = p_conversation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conversation % not found', p_conversation_id;
    END IF;

    v_prev_mode := v_conversation.mode;
    v_ai_enabled := (p_mode = 'ai');
    v_paused_at := CASE WHEN p_mode != 'ai' THEN now() ELSE NULL END;

    -- Update conversation
    UPDATE conversations
    SET
        mode = p_mode,
        ai_enabled = v_ai_enabled,
        paused_by = CASE WHEN p_mode != 'ai' THEN p_user_id ELSE NULL END,
        paused_at = v_paused_at,
        resume_at = CASE WHEN p_mode != 'ai' THEN p_resume_at ELSE NULL END,
        updated_at = now()
    WHERE id = p_conversation_id
    RETURNING * INTO v_conversation;

    -- Insert audit log event
    INSERT INTO ai_mode_events (
        conversation_id,
        from_mode,
        to_mode,
        changed_by,
        reason
    ) VALUES (
        p_conversation_id,
        v_prev_mode,
        p_mode,
        p_user_id,
        p_reason
    );

    RETURN v_conversation;
END;
$$;

-- Auto-resume expired pauses function (can be invoked by pg_cron or scheduled endpoint)
CREATE OR REPLACE FUNCTION check_and_resume_ai_modes()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER := 0;
    r RECORD;
BEGIN
    FOR r IN
        SELECT id FROM conversations
        WHERE mode != 'ai'
          AND resume_at IS NOT NULL
          AND resume_at <= now()
        FOR UPDATE SKIP LOCKED
    LOOP
        PERFORM set_ai_mode(r.id, 'ai', NULL, 'Auto-resumed after scheduled pause time elapsed');
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;
