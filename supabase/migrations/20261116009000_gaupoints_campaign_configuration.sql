-- GauPoints campaign configuration
-- DEVELOPMENT MIGRATION - NOT YET APPLIED
-- Separate from existing campaign JSON and signing journey.

begin;

do $guard$
begin
    if to_regclass('public.voiceup_gp_wallets') is null
       or to_regclass('public.voiceup_gp_ledger') is null then
        raise exception using message = 'gaupoints:missing_accounting_foundation_dependency';
    end if;
end;
$guard$;

CREATE TABLE public.voiceup_gp_campaign_configuration (
    workspace_id text NOT NULL REFERENCES public.voiceup_workspaces(id) ON DELETE CASCADE,
    campaign_id text NOT NULL,
    enabled boolean NOT NULL DEFAULT false,
    awards_enabled_at timestamptz,
    CONSTRAINT voiceup_gp_enabled_at_required
        CHECK (enabled = false OR awards_enabled_at IS NOT NULL),
    verified_signing_points bigint NOT NULL DEFAULT 500,
    verified_registration_referral_points bigint NOT NULL DEFAULT 300,
    branch_factor integer NOT NULL DEFAULT 2,
    maximum_round integer NOT NULL DEFAULT 12,
    round_contribution_percentage integer NOT NULL DEFAULT 50,
    distribution_formula text NOT NULL DEFAULT 'equal',
    redeemable boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT voiceup_gp_campaign_configuration_pk
        PRIMARY KEY (workspace_id, campaign_id),

    CONSTRAINT voiceup_gp_config_signing_points_check
        CHECK (verified_signing_points >= 0),

    CONSTRAINT voiceup_gp_config_referral_points_check
        CHECK (verified_registration_referral_points >= 0),

    CONSTRAINT voiceup_gp_config_branch_factor_check
        CHECK (branch_factor BETWEEN 2 AND 10),

    CONSTRAINT voiceup_gp_config_maximum_round_check
        CHECK (maximum_round BETWEEN 1 AND 12),

    CONSTRAINT voiceup_gp_config_contribution_check
        CHECK (round_contribution_percentage BETWEEN 0 AND 100),

    CONSTRAINT voiceup_gp_config_distribution_check
        CHECK (distribution_formula = 'equal'),

    CONSTRAINT voiceup_gp_config_noncash_check
        CHECK (redeemable = false),

    CONSTRAINT voiceup_gp_config_scope_check
        CHECK (
            length(btrim(workspace_id)) > 0
            AND length(btrim(campaign_id)) > 0
        )
);

ALTER TABLE public.voiceup_gp_campaign_configuration
    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.voiceup_gp_campaign_configuration
    FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.voiceup_gp_campaign_configuration
    TO service_role;

-- Preserve the first reward activation timestamp permanently.
-- A disabled campaign may be re-enabled, but its eligibility
-- start date cannot be moved backwards or forwards.

CREATE OR REPLACE FUNCTION public.voiceup_gp_protect_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.awards_enabled_at IS NOT NULL THEN
            RAISE EXCEPTION 'gaupoints:activated_configuration_cannot_be_deleted';
        END IF;

        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.enabled = true THEN
            RAISE EXCEPTION 'gaupoints:initial_activation_must_be_separate';
        END IF;

        IF NEW.awards_enabled_at IS NOT NULL THEN
            RAISE EXCEPTION 'gaupoints:activation_requires_enable';
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
           OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id THEN
            RAISE EXCEPTION 'gaupoints:campaign_scope_immutable';
        END IF;

        IF OLD.awards_enabled_at IS NOT NULL
           AND NEW.awards_enabled_at IS DISTINCT FROM OLD.awards_enabled_at THEN
            RAISE EXCEPTION 'gaupoints:activation_timestamp_immutable';
        END IF;

        IF OLD.awards_enabled_at IS NULL THEN
            IF OLD.enabled IS DISTINCT FROM false THEN
                RAISE EXCEPTION 'gaupoints:invalid_previous_activation_state';
            END IF;

            IF NEW.enabled IS TRUE THEN
                -- Ignore caller-provided timestamp.
                -- PostgreSQL establishes the first activation time.
                NEW.awards_enabled_at := statement_timestamp();

            ELSIF NEW.awards_enabled_at IS NOT NULL THEN
                RAISE EXCEPTION 'gaupoints:activation_requires_enable';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER voiceup_gp_protect_activation_trigger
BEFORE INSERT OR UPDATE OR DELETE
ON public.voiceup_gp_campaign_configuration
FOR EACH ROW
EXECUTE FUNCTION public.voiceup_gp_protect_activation();

REVOKE ALL ON FUNCTION public.voiceup_gp_protect_activation()
FROM PUBLIC, anon, authenticated;

-- No public configuration mutations.
-- No automatic reward awarding.
-- No changes to existing GSAA signing functions.

commit;
