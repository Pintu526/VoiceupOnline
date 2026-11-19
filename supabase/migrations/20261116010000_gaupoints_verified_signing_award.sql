-- GauPoints verified-signing award
-- DEVELOPMENT ONLY. Apply only after security review and tests.
-- No automatic awarding or signing-flow modifications.

begin;

do $guard$
begin
    if to_regclass('public.voiceup_gp_campaign_configuration') is null then
        raise exception using message = 'gaupoints:missing_campaign_configuration_dependency';
    end if;
    if to_regclass('public.voiceup_gp_wallets') is null
       or to_regclass('public.voiceup_gp_ledger') is null then
        raise exception using message = 'gaupoints:missing_accounting_foundation_dependency';
    end if;
    if to_regprocedure('public.voiceup_gp_sha256_hex(text)') is null then
        raise exception using message = 'gaupoints:missing_hash_helper_dependency';
    end if;
end;
$guard$;

CREATE OR REPLACE FUNCTION public.voiceup_gp_award_verified_signing(
    p_workspace_id text,
    p_campaign_id text,
    p_supporter_id text,
    p_signing_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_data jsonb;
    v_signer jsonb;
    v_signer_count bigint;
    v_history jsonb;
    v_history_count bigint;
    v_event_key text;
    v_existing public.voiceup_gp_ledger%rowtype;
    v_balance bigint;
    v_lifetime bigint;
    v_signing_completed_at timestamptz;
    v_points bigint;
    v_awards_enabled boolean;
    v_awards_enabled_at timestamptz;
BEGIN
    IF coalesce(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION USING
            errcode = '42501',
            message = 'gaupoints:service_role_required';
    END IF;

    IF nullif(btrim(p_workspace_id), '') IS NULL
       OR nullif(btrim(p_campaign_id), '') IS NULL
       OR nullif(btrim(p_supporter_id), '') IS NULL
       OR nullif(btrim(p_signing_idempotency_key), '') IS NULL
       OR length(p_workspace_id) > 256
       OR length(p_campaign_id) > 256
       OR length(p_supporter_id) > 256
       OR length(p_signing_idempotency_key) > 256
    THEN
        RAISE EXCEPTION 'gaupoints:invalid_request';
    END IF;

    -- Serialize awards against this workspace's signing evidence.
    SELECT data INTO v_data
    FROM public.voiceup_workspaces
    WHERE id = p_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'gaupoints:workspace_not_found';
    END IF;

    SELECT count(*), jsonb_agg(signer)->0
    INTO v_signer_count, v_signer
    FROM jsonb_array_elements(
        coalesce(v_data->'signers', '[]'::jsonb)
    ) signer
    WHERE signer->>'campaignId' = p_campaign_id
      AND signer->>'id' = p_supporter_id;

    IF v_signer_count <> 1
       OR NOT (
           coalesce(v_signer->>'supportSubmittedAt', '') <> ''
           OR (
               v_signer->>'source' = 'online'
               AND v_signer->>'status' = 'verified'
               AND coalesce(v_signer->>'signedAt', '') <> ''
           )
       )
    THEN
        RAISE EXCEPTION 'gaupoints:signing_not_verified';
    END IF;

    SELECT count(*), jsonb_agg(history)->0
    INTO v_history_count, v_history
    FROM jsonb_array_elements(
        coalesce(v_data->'publicParticipationIdempotency', '[]'::jsonb)
    ) history
    WHERE history->>'key' = p_signing_idempotency_key
      AND history->>'campaignId' = p_campaign_id
      AND history->>'action' = 'submit_support'
      AND history#>>'{result,signer,id}' = p_supporter_id;

    IF v_history_count <> 1
       OR nullif(v_history->>'createdAt', '') IS NULL
    THEN
        RAISE EXCEPTION 'gaupoints:signing_evidence_missing';
    END IF;

    BEGIN
        v_signing_completed_at :=
            (v_history->>'createdAt')::timestamptz;
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'gaupoints:invalid_signing_timestamp';
    END;

    IF v_signing_completed_at IS NULL
       OR v_signing_completed_at > now() THEN
        RAISE EXCEPTION 'gaupoints:invalid_signing_timestamp';
    END IF;

    -- Stable event identity without storing the raw signing key.
    v_event_key := 'verified_signing:' || public.voiceup_gp_sha256_hex(
        jsonb_build_array(
            p_workspace_id,
            p_campaign_id,
            p_signing_idempotency_key
        )::text
    );

    -- Prevent two concurrent retries from both observing a missing event.
    perform pg_advisory_xact_lock(hashtextextended(v_event_key, 0));

    SELECT * INTO v_existing
    FROM public.voiceup_gp_ledger
    WHERE workspace_id = p_workspace_id
      AND campaign_id = p_campaign_id
      AND event_key = v_event_key;

    IF FOUND THEN
        -- A previous valid award remains valid if campaign
        -- reward settings subsequently change.
        IF v_existing.supporter_id <> p_supporter_id
           OR v_existing.event_kind <> 'verified_signing'
           OR v_existing.points <= 0
        THEN
            RAISE EXCEPTION 'gaupoints:conflicting_replay';
        END IF;

        RETURN jsonb_build_object(
            'applied', false,
            'code', 'already_awarded'
        );
    END IF;

    -- Trusted campaign-scoped configuration, never client-supplied points.
    SELECT enabled, verified_signing_points, awards_enabled_at
    INTO v_awards_enabled, v_points, v_awards_enabled_at
    FROM public.voiceup_gp_campaign_configuration
    WHERE workspace_id = p_workspace_id
      AND campaign_id = p_campaign_id
    FOR SHARE;

    IF NOT FOUND
       OR v_awards_enabled IS DISTINCT FROM true
       OR v_points IS NULL
       OR v_points <= 0
       OR v_awards_enabled_at IS NULL THEN
        RAISE EXCEPTION 'gaupoints:awarding_disabled';
    END IF;

    IF v_signing_completed_at < v_awards_enabled_at THEN
        RAISE EXCEPTION 'gaupoints:signing_before_reward_activation';
    END IF;


    -- Award only to an existing claimed supporter account.
    IF NOT EXISTS (
        SELECT 1
        FROM public.voiceup_supporter_accounts
        WHERE workspace_id = p_workspace_id
          AND campaign_id = p_campaign_id
          AND supporter_id = p_supporter_id
    ) THEN
        RAISE EXCEPTION 'gaupoints:supporter_account_required';
    END IF;

    INSERT INTO public.voiceup_gp_wallets (
        workspace_id, campaign_id, supporter_id
    )
    VALUES (p_workspace_id, p_campaign_id, p_supporter_id)
    ON CONFLICT (workspace_id, campaign_id, supporter_id)
    DO NOTHING;

    SELECT balance, lifetime_valid INTO v_balance, v_lifetime
    FROM public.voiceup_gp_wallets
    WHERE workspace_id = p_workspace_id
      AND campaign_id = p_campaign_id
      AND supporter_id = p_supporter_id
    FOR UPDATE;

    IF v_balance IS NULL OR v_lifetime IS NULL
       OR v_points <= 0
       OR v_balance > 9223372036854775807 - v_points
       OR v_lifetime > 9223372036854775807 - v_points THEN
        RAISE EXCEPTION 'gaupoints:balance_overflow';
    END IF;

    INSERT INTO public.voiceup_gp_ledger (
        workspace_id, campaign_id, supporter_id,
        event_key, event_kind, points, reference_key, metadata
    )
    VALUES (
        p_workspace_id, p_campaign_id, p_supporter_id,
        v_event_key, 'verified_signing', v_points,
        'signing:' || public.voiceup_gp_sha256_hex(p_signing_idempotency_key),
        jsonb_build_object('signingCompletedAt', v_signing_completed_at)
    );

    UPDATE public.voiceup_gp_wallets
    SET balance = balance + v_points,
        lifetime_valid = lifetime_valid + v_points,
        updated_at = now()
    WHERE workspace_id = p_workspace_id
      AND campaign_id = p_campaign_id
      AND supporter_id = p_supporter_id;

    RETURN jsonb_build_object(
        'applied', true,
        'points', v_points
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.voiceup_gp_award_verified_signing(
    text, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.voiceup_gp_award_verified_signing(
    text, text, text, text
) TO service_role;

commit;
