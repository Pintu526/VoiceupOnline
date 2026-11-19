-- GauPoints referral, round-accounting and least-privilege access contracts.
-- DEVELOPMENT ONLY. No function in this migration hooks the signing journey.

begin;

do $guard$
begin
  if to_regclass('public.voiceup_gp_campaign_configuration') is null
     or to_regclass('public.voiceup_gp_wallets') is null
     or to_regclass('public.voiceup_gp_ledger') is null
     or to_regclass('public.voiceup_gp_referral_edges') is null
     or to_regclass('public.voiceup_gp_round_state') is null then
    raise exception using message = 'gaupoints:incomplete_migration_dependencies';
  end if;
end;
$guard$;

create or replace function public.voiceup_gp_can_admin_campaign(
  p_workspace_id text,
  p_campaign_id text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select auth.uid() is not null and (
    exists (
      select 1
      from public.voiceup_workspace_members member
      where member.workspace_id = p_workspace_id
        and member.user_id = auth.uid()
        and member.active
        and member.role in ('platform_owner', 'workspace_admin')
    )
    or exists (
      select 1
      from public.workspace_resource_members assignment
      where assignment.workspace_id = p_workspace_id
        and assignment.application_key = 'voiceup'
        and assignment.resource_type = 'campaign'
        and assignment.resource_id = p_campaign_id
        and assignment.user_id = auth.uid()
        and assignment.role = 'campaign_admin'
        and assignment.active
    )
  );
$function$;

create or replace function public.voiceup_gp_read_campaign_configuration(
  p_workspace_id text,
  p_campaign_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_configuration public.voiceup_gp_campaign_configuration%rowtype;
begin
  if not public.voiceup_gp_can_admin_campaign(p_workspace_id, p_campaign_id) then
    raise exception using errcode = '42501', message = 'gaupoints:campaign_admin_required';
  end if;

  select * into v_configuration
  from public.voiceup_gp_campaign_configuration
  where workspace_id = p_workspace_id and campaign_id = p_campaign_id;

  if not found then
    return jsonb_build_object(
      'enabled', false,
      'verifiedSigningPoints', 500,
      'verifiedRegistrationReferralPoints', 300,
      'branchFactor', 2,
      'maximumRound', 12,
      'roundContributionPercentage', 50,
      'distributionFormula', 'equal',
      'redeemable', false,
      'configured', false
    );
  end if;

  return jsonb_build_object(
    'enabled', v_configuration.enabled,
    'awardsEnabledAt', v_configuration.awards_enabled_at,
    'verifiedSigningPoints', v_configuration.verified_signing_points,
    'verifiedRegistrationReferralPoints', v_configuration.verified_registration_referral_points,
    'branchFactor', v_configuration.branch_factor,
    'maximumRound', v_configuration.maximum_round,
    'roundContributionPercentage', v_configuration.round_contribution_percentage,
    'distributionFormula', v_configuration.distribution_formula,
    'redeemable', v_configuration.redeemable,
    'configured', true
  );
end;
$function$;

create or replace function public.voiceup_gp_save_disabled_campaign_configuration(
  p_workspace_id text,
  p_campaign_id text,
  p_verified_signing_points bigint,
  p_verified_registration_referral_points bigint,
  p_branch_factor integer,
  p_maximum_round integer,
  p_round_contribution_percentage integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_existing public.voiceup_gp_campaign_configuration%rowtype;
begin
  if not public.voiceup_gp_can_admin_campaign(p_workspace_id, p_campaign_id) then
    raise exception using errcode = '42501', message = 'gaupoints:campaign_admin_required';
  end if;
  if p_verified_signing_points < 0
     or p_verified_registration_referral_points < 0
     or p_branch_factor not between 2 and 10
     or p_maximum_round not between 1 and 12
     or p_round_contribution_percentage not between 0 and 100 then
    raise exception using errcode = '22023', message = 'gaupoints:invalid_configuration';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    jsonb_build_array('gaupoints-config', p_workspace_id, p_campaign_id)::text, 0
  ));

  select * into v_existing
  from public.voiceup_gp_campaign_configuration
  where workspace_id = p_workspace_id and campaign_id = p_campaign_id
  for update;

  if found and (v_existing.enabled or v_existing.awards_enabled_at is not null) then
    raise exception using errcode = '55000', message = 'gaupoints:activated_configuration_service_role_only';
  end if;

  insert into public.voiceup_gp_campaign_configuration (
    workspace_id, campaign_id, enabled, verified_signing_points,
    verified_registration_referral_points, branch_factor, maximum_round,
    round_contribution_percentage, distribution_formula, redeemable
  ) values (
    p_workspace_id, p_campaign_id, false, p_verified_signing_points,
    p_verified_registration_referral_points, p_branch_factor, p_maximum_round,
    p_round_contribution_percentage, 'equal', false
  )
  on conflict (workspace_id, campaign_id) do update set
    verified_signing_points = excluded.verified_signing_points,
    verified_registration_referral_points = excluded.verified_registration_referral_points,
    branch_factor = excluded.branch_factor,
    maximum_round = excluded.maximum_round,
    round_contribution_percentage = excluded.round_contribution_percentage,
    updated_at = now();

  return public.voiceup_gp_read_campaign_configuration(p_workspace_id, p_campaign_id);
end;
$function$;

create or replace function public.voiceup_gp_my_wallet(
  p_workspace_id text,
  p_campaign_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_account public.voiceup_supporter_accounts%rowtype;
  v_data jsonb;
  v_referral_code text;
  v_balance bigint := 0;
  v_lifetime bigint := 0;
  v_round integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'gaupoints:authentication_required';
  end if;

  select * into strict v_account
  from public.voiceup_supporter_accounts
  where auth_user_id = auth.uid()
    and workspace_id = p_workspace_id
    and campaign_id = p_campaign_id;

  select coalesce(wallet.balance, 0), coalesce(wallet.lifetime_valid, 0),
         coalesce(state.completed_round, 0)
    into v_balance, v_lifetime, v_round
  from (select 1) seed
  left join public.voiceup_gp_wallets wallet
    on wallet.workspace_id = p_workspace_id
   and wallet.campaign_id = p_campaign_id
   and wallet.supporter_id = v_account.supporter_id
  left join public.voiceup_gp_round_state state
    on state.workspace_id = p_workspace_id
   and state.campaign_id = p_campaign_id
   and state.supporter_id = v_account.supporter_id;

  select workspace.data into v_data
  from public.voiceup_workspaces workspace
  where workspace.id = p_workspace_id;

  select upper(nullif(btrim(signer ->> 'referralCode'), '')) into v_referral_code
  from jsonb_array_elements(coalesce(v_data -> 'signers', '[]'::jsonb)) signer
  where signer ->> 'campaignId' = p_campaign_id
    and signer ->> 'id' = v_account.supporter_id
  limit 1;

  return jsonb_build_object(
    'balance', v_balance,
    'lifetimeValid', v_lifetime,
    'currentRound', v_round,
    'referralCode', v_referral_code
  );
exception
  when no_data_found or too_many_rows then
    raise exception using errcode = '42501', message = 'gaupoints:supporter_scope_not_owned';
end;
$function$;

create or replace function public.voiceup_gp_public_leaderboard(
  p_workspace_id text,
  p_campaign_id text
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank', ranked.rank,
    'alias', 'Supporter ' || upper(substr(public.voiceup_gp_sha256_hex(
      jsonb_build_array(p_workspace_id, p_campaign_id, ranked.supporter_id)::text
    ), 1, 8)),
    'lifetimeValid', ranked.lifetime_valid
  ) order by ranked.rank), '[]'::jsonb)
  from (
    select wallet.supporter_id, wallet.lifetime_valid,
           row_number() over (order by wallet.lifetime_valid desc, wallet.created_at asc) as rank
    from public.voiceup_gp_wallets wallet
    join public.voiceup_gp_campaign_configuration configuration
      on configuration.workspace_id = wallet.workspace_id
     and configuration.campaign_id = wallet.campaign_id
     and configuration.enabled
    where wallet.workspace_id = p_workspace_id
      and wallet.campaign_id = p_campaign_id
      and wallet.lifetime_valid > 0
    order by wallet.lifetime_valid desc, wallet.created_at asc
    limit 100
  ) ranked;
$function$;

create or replace function public.voiceup_gp_award_verified_referral(
  p_workspace_id text,
  p_campaign_id text,
  p_child_supporter_id text,
  p_signing_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_data jsonb;
  v_child jsonb;
  v_parent jsonb;
  v_history jsonb;
  v_count bigint;
  v_code text;
  v_parent_id text;
  v_edge public.voiceup_gp_referral_edges%rowtype;
  v_edge_found boolean := false;
  v_event_key text;
  v_points bigint;
  v_enabled boolean;
  v_enabled_at timestamptz;
  v_completed_at timestamptz;
  v_balance bigint;
  v_lifetime bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'gaupoints:service_role_required';
  end if;
  if nullif(btrim(p_workspace_id), '') is null
     or nullif(btrim(p_campaign_id), '') is null
     or nullif(btrim(p_child_supporter_id), '') is null
     or nullif(btrim(p_signing_idempotency_key), '') is null then
    raise exception using errcode = '22023', message = 'gaupoints:invalid_request';
  end if;

  select data into v_data from public.voiceup_workspaces
  where id = p_workspace_id for update;
  if not found then raise exception 'gaupoints:workspace_not_found'; end if;

  select count(*), jsonb_agg(signer) -> 0 into v_count, v_child
  from jsonb_array_elements(coalesce(v_data -> 'signers', '[]'::jsonb)) signer
  where signer ->> 'campaignId' = p_campaign_id
    and signer ->> 'id' = p_child_supporter_id;
  if v_count <> 1 or not (
    coalesce(v_child ->> 'supportSubmittedAt', '') <> ''
    or (v_child ->> 'source' = 'online' and v_child ->> 'status' = 'verified'
        and coalesce(v_child ->> 'signedAt', '') <> '')
  ) then raise exception 'gaupoints:registration_not_verified'; end if;

  v_code := upper(nullif(btrim(v_child ->> 'referredBy'), ''));
  if v_code is null then
    return jsonb_build_object('applied', false, 'code', 'no_referral');
  end if;

  select count(*), jsonb_agg(signer) -> 0 into v_count, v_parent
  from jsonb_array_elements(coalesce(v_data -> 'signers', '[]'::jsonb)) signer
  where signer ->> 'campaignId' = p_campaign_id
    and upper(btrim(coalesce(signer ->> 'referralCode', ''))) = v_code
    and (
      coalesce(signer ->> 'supportSubmittedAt', '') <> ''
      or (signer ->> 'source' = 'online' and signer ->> 'status' = 'verified'
          and coalesce(signer ->> 'signedAt', '') <> '')
    );
  if v_count <> 1 then raise exception 'gaupoints:referrer_not_verified'; end if;
  v_parent_id := v_parent ->> 'id';
  if v_parent_id = p_child_supporter_id then raise exception 'gaupoints:self_referral'; end if;

  select count(*), jsonb_agg(history) -> 0 into v_count, v_history
  from jsonb_array_elements(coalesce(v_data -> 'publicParticipationIdempotency', '[]'::jsonb)) history
  where history ->> 'key' = p_signing_idempotency_key
    and history ->> 'campaignId' = p_campaign_id
    and history ->> 'action' = 'submit_support'
    and history #>> '{result,signer,id}' = p_child_supporter_id;
  if v_count <> 1 then raise exception 'gaupoints:signing_evidence_missing'; end if;
  begin
    v_completed_at := (v_history ->> 'createdAt')::timestamptz;
  exception when others then
    raise exception 'gaupoints:invalid_signing_timestamp';
  end;

  if not exists (select 1 from public.voiceup_supporter_accounts
    where workspace_id = p_workspace_id and campaign_id = p_campaign_id
      and supporter_id = p_child_supporter_id)
     or not exists (select 1 from public.voiceup_supporter_accounts
    where workspace_id = p_workspace_id and campaign_id = p_campaign_id
      and supporter_id = v_parent_id) then
    raise exception 'gaupoints:supporter_accounts_required';
  end if;

  v_event_key := 'verified_referral:' || public.voiceup_gp_sha256_hex(
    jsonb_build_array(p_workspace_id, p_campaign_id, p_child_supporter_id, p_signing_idempotency_key)::text
  );
  perform pg_advisory_xact_lock(hashtextextended(v_event_key, 0));

  select * into v_edge from public.voiceup_gp_referral_edges
  where workspace_id = p_workspace_id and campaign_id = p_campaign_id
    and child_supporter_id = p_child_supporter_id for update;
  v_edge_found := found;
  if v_edge_found and v_edge.parent_supporter_id <> v_parent_id then
    raise exception 'gaupoints:conflicting_referral_parent';
  end if;
  if exists (select 1 from public.voiceup_gp_ledger
    where workspace_id = p_workspace_id and campaign_id = p_campaign_id
      and event_key = v_event_key and event_kind = 'verified_referral'
      and supporter_id = v_parent_id) then
    return jsonb_build_object('applied', false, 'code', 'already_awarded');
  end if;

  select enabled, verified_registration_referral_points, awards_enabled_at
    into v_enabled, v_points, v_enabled_at
  from public.voiceup_gp_campaign_configuration
  where workspace_id = p_workspace_id and campaign_id = p_campaign_id for share;
  if not found or not v_enabled or v_enabled_at is null or v_points <= 0 then
    raise exception 'gaupoints:awarding_disabled';
  end if;
  if v_completed_at < v_enabled_at then raise exception 'gaupoints:registration_before_reward_activation'; end if;

  if not v_edge_found then
    insert into public.voiceup_gp_referral_edges(
      workspace_id, campaign_id, child_supporter_id, parent_supporter_id, evidence_key
    ) values (p_workspace_id, p_campaign_id, p_child_supporter_id, v_parent_id, v_event_key);
  end if;

  insert into public.voiceup_gp_wallets(workspace_id, campaign_id, supporter_id)
  values (p_workspace_id, p_campaign_id, v_parent_id) on conflict do nothing;
  select balance, lifetime_valid into v_balance, v_lifetime
  from public.voiceup_gp_wallets where workspace_id = p_workspace_id
    and campaign_id = p_campaign_id and supporter_id = v_parent_id for update;
  if v_balance > 9223372036854775807 - v_points
     or v_lifetime > 9223372036854775807 - v_points then
    raise exception 'gaupoints:balance_overflow';
  end if;

  insert into public.voiceup_gp_ledger(
    workspace_id, campaign_id, supporter_id, event_key, event_kind, points, reference_key, metadata
  ) values (
    p_workspace_id, p_campaign_id, v_parent_id, v_event_key, 'verified_referral', v_points,
    'registration:' || public.voiceup_gp_sha256_hex(p_signing_idempotency_key),
    jsonb_build_object('childEvidence', public.voiceup_gp_sha256_hex(p_child_supporter_id))
  );
  update public.voiceup_gp_wallets set balance = balance + v_points,
    lifetime_valid = lifetime_valid + v_points, updated_at = now()
  where workspace_id = p_workspace_id and campaign_id = p_campaign_id and supporter_id = v_parent_id;
  return jsonb_build_object('applied', true, 'points', v_points);
end;
$function$;

create or replace function public.voiceup_gp_settle_qualified_round(
  p_workspace_id text,
  p_campaign_id text,
  p_supporter_id text,
  p_round integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_config public.voiceup_gp_campaign_configuration%rowtype;
  v_state public.voiceup_gp_round_state%rowtype;
  v_balance bigint;
  v_lifetime bigint;
  v_required numeric;
  v_verified bigint;
  v_contribution bigint;
  v_base bigint;
  v_remainder bigint;
  v_share bigint;
  v_level integer;
  v_current text;
  v_parent text;
  v_event_prefix text;
  v_allocated bigint := 0;
  v_pending bigint := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'gaupoints:service_role_required';
  end if;
  if p_round is null or p_round < 1 then raise exception 'gaupoints:invalid_round'; end if;

  v_event_prefix := 'round:' || public.voiceup_gp_sha256_hex(
    jsonb_build_array(p_workspace_id, p_campaign_id, p_supporter_id, p_round)::text
  );
  perform pg_advisory_xact_lock(hashtextextended(v_event_prefix, 0));

  select * into v_config from public.voiceup_gp_campaign_configuration
  where workspace_id = p_workspace_id and campaign_id = p_campaign_id for share;
  if not found or not v_config.enabled or v_config.awards_enabled_at is null then
    raise exception 'gaupoints:awarding_disabled';
  end if;
  if p_round > v_config.maximum_round then raise exception 'gaupoints:round_above_campaign_limit'; end if;

  select balance, lifetime_valid into v_balance, v_lifetime
  from public.voiceup_gp_wallets where workspace_id = p_workspace_id
    and campaign_id = p_campaign_id and supporter_id = p_supporter_id for update;
  if not found then raise exception 'gaupoints:wallet_not_found'; end if;

  insert into public.voiceup_gp_round_state(workspace_id, campaign_id, supporter_id)
  values (p_workspace_id, p_campaign_id, p_supporter_id) on conflict do nothing;
  select * into v_state from public.voiceup_gp_round_state
  where workspace_id = p_workspace_id and campaign_id = p_campaign_id
    and supporter_id = p_supporter_id for update;
  if v_state.completed_round >= p_round then
    return jsonb_build_object('applied', false, 'code', 'round_already_completed');
  end if;
  if v_state.completed_round <> p_round - 1 then raise exception 'gaupoints:round_sequence_violation'; end if;

  with recursive descendants(supporter_id, depth, path) as (
    select edge.child_supporter_id, 1, array[p_supporter_id, edge.child_supporter_id]
    from public.voiceup_gp_referral_edges edge
    where edge.workspace_id = p_workspace_id and edge.campaign_id = p_campaign_id
      and edge.parent_supporter_id = p_supporter_id
    union all
    select edge.child_supporter_id, descendants.depth + 1,
           descendants.path || edge.child_supporter_id
    from descendants
    join public.voiceup_gp_referral_edges edge
      on edge.workspace_id = p_workspace_id and edge.campaign_id = p_campaign_id
     and edge.parent_supporter_id = descendants.supporter_id
    where descendants.depth < p_round
      and not edge.child_supporter_id = any(descendants.path)
  )
  select count(distinct supporter_id) into v_verified
  from descendants where depth = p_round;
  v_required := power(v_config.branch_factor::numeric, p_round);
  if v_verified < v_required then raise exception 'gaupoints:round_not_qualified'; end if;

  v_contribution := floor((v_balance::numeric * v_config.round_contribution_percentage) / 100)::bigint;
  v_base := v_contribution / p_round;
  v_remainder := v_contribution % p_round;

  insert into public.voiceup_gp_ledger(
    workspace_id, campaign_id, supporter_id, event_key, event_kind, points, reference_key, metadata
  ) values (
    p_workspace_id, p_campaign_id, p_supporter_id, v_event_prefix || ':debit',
    case when v_contribution = 0 then 'round_completion' else 'round_contribution' end,
    -v_contribution, v_event_prefix,
    jsonb_build_object('round', p_round, 'openingBalance', v_balance,
      'percentage', v_config.round_contribution_percentage)
  );
  if v_contribution > 0 then
    update public.voiceup_gp_wallets set balance = balance - v_contribution, updated_at = now()
    where workspace_id = p_workspace_id and campaign_id = p_campaign_id and supporter_id = p_supporter_id;
  end if;

  v_current := p_supporter_id;
  for v_level in 1..p_round loop
    v_share := v_base + case when v_level <= v_remainder then 1 else 0 end;
    select edge.parent_supporter_id into v_parent
    from public.voiceup_gp_referral_edges edge
    where edge.workspace_id = p_workspace_id and edge.campaign_id = p_campaign_id
      and edge.child_supporter_id = v_current;
    if found then v_current := v_parent; else v_parent := null; end if;

    if v_share > 0 and v_parent is not null then
      insert into public.voiceup_gp_wallets(workspace_id, campaign_id, supporter_id)
      values (p_workspace_id, p_campaign_id, v_parent) on conflict do nothing;
      perform 1 from public.voiceup_gp_wallets where workspace_id = p_workspace_id
        and campaign_id = p_campaign_id and supporter_id = v_parent for update;
      insert into public.voiceup_gp_ledger(
        workspace_id, campaign_id, supporter_id, event_key, event_kind, points, reference_key, metadata
      ) values (
        p_workspace_id, p_campaign_id, v_parent, v_event_prefix || ':share:' || v_level,
        'upstream_receipt', v_share, v_event_prefix, jsonb_build_object('round', p_round, 'level', v_level)
      );
      update public.voiceup_gp_wallets set balance = balance + v_share,
        lifetime_valid = lifetime_valid + v_share, updated_at = now()
      where workspace_id = p_workspace_id and campaign_id = p_campaign_id and supporter_id = v_parent;
      v_allocated := v_allocated + v_share;
    elsif v_share > 0 then
      insert into public.voiceup_gp_ledger(
        workspace_id, campaign_id, supporter_id, event_key, event_kind, points, reference_key, metadata
      ) values (
        p_workspace_id, p_campaign_id, p_supporter_id, v_event_prefix || ':share:' || v_level,
        'pending_contribution', v_share, v_event_prefix,
        jsonb_build_object('round', p_round, 'level', v_level, 'custody', 'unallocated')
      );
      v_pending := v_pending + v_share;
    end if;
  end loop;

  update public.voiceup_gp_round_state set completed_round = p_round, updated_at = now()
  where workspace_id = p_workspace_id and campaign_id = p_campaign_id and supporter_id = p_supporter_id;
  return jsonb_build_object('applied', true, 'round', p_round,
    'contributedPoints', v_contribution, 'allocatedPoints', v_allocated, 'pendingPoints', v_pending);
end;
$function$;

revoke all on function public.voiceup_gp_can_admin_campaign(text, text) from public, anon;
revoke all on function public.voiceup_gp_read_campaign_configuration(text, text) from public, anon;
revoke all on function public.voiceup_gp_save_disabled_campaign_configuration(text, text, bigint, bigint, integer, integer, integer) from public, anon;
revoke all on function public.voiceup_gp_my_wallet(text, text) from public, anon;
revoke all on function public.voiceup_gp_public_leaderboard(text, text) from public;
revoke all on function public.voiceup_gp_award_verified_referral(text, text, text, text) from public, anon, authenticated;
revoke all on function public.voiceup_gp_settle_qualified_round(text, text, text, integer) from public, anon, authenticated;

grant execute on function public.voiceup_gp_can_admin_campaign(text, text) to authenticated;
grant execute on function public.voiceup_gp_read_campaign_configuration(text, text) to authenticated;
grant execute on function public.voiceup_gp_save_disabled_campaign_configuration(text, text, bigint, bigint, integer, integer, integer) to authenticated;
grant execute on function public.voiceup_gp_my_wallet(text, text) to authenticated;
grant execute on function public.voiceup_gp_public_leaderboard(text, text) to anon, authenticated;
grant execute on function public.voiceup_gp_award_verified_referral(text, text, text, text) to service_role;
grant execute on function public.voiceup_gp_settle_qualified_round(text, text, text, integer) to service_role;

commit;
