begin;

create or replace function public.voiceup_read_public_campaign_journey(
  p_referral_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_code text := upper(btrim(coalesce(p_referral_code, '')));
  v_match_count integer;
  v_journey jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'voiceup:service_role_required';
  end if;
  if v_code !~ '^VU-[A-Z0-9]{6,64}$' then
    return null;
  end if;

  with matches as (
    select campaign_index.campaign, signer, workspace.data as workspace_data
    from public.voiceup_public_campaign_index campaign_index
    join public.voiceup_workspaces workspace on workspace.id = campaign_index.workspace_id
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(workspace.data -> 'signers') = 'array'
        then workspace.data -> 'signers' else '[]'::jsonb end
    ) signer
    where campaign_index.status = 'Published'
      and signer ->> 'campaignId' = campaign_index.campaign_id
      and upper(btrim(coalesce(signer ->> 'referralCode', ''))) = v_code
  )
  select count(*), (
    jsonb_agg(jsonb_build_object(
      'supporterCode', v_code,
      'displayName', left(coalesce(nullif(btrim(signer ->> 'name'), ''), 'VoiceUp supporter'), 120),
      'campaignTitle', left(coalesce(campaign ->> 'title', ''), 200),
      'campaignSlug', campaign ->> 'slug',
      'joinedDate', nullif(left(coalesce(signer ->> 'signedAt', signer ->> 'supportSubmittedAt', ''), 10), ''),
      'state', nullif(left(btrim(coalesce(signer ->> 'state', '')), 120), ''),
      'district', nullif(left(btrim(coalesce(signer ->> 'district', '')), 120), ''),
      'status', case
        when signer ->> 'status' = 'verified' or coalesce(signer ->> 'otpVerified', '') = 'true' then 'verified'
        else 'pending'
      end,
      'referralCount', (
        select count(*)
        from jsonb_array_elements(
          case when jsonb_typeof(workspace_data -> 'signers') = 'array'
            then workspace_data -> 'signers' else '[]'::jsonb end
        ) referred
        where referred ->> 'campaignId' = signer ->> 'campaignId'
          and upper(btrim(coalesce(referred ->> 'referredBy', referred ->> 'referredByPhoneOrCode', ''))) = v_code
      )
    )) -> 0
  )
    into v_match_count, v_journey
  from matches;

  if v_match_count <> 1 then
    return null;
  end if;
  return v_journey;
end;
$$;

revoke all on function public.voiceup_read_public_campaign_journey(text)
  from public, anon, authenticated;
grant execute on function public.voiceup_read_public_campaign_journey(text) to service_role;

comment on function public.voiceup_read_public_campaign_journey(text) is
  'Returns a minimal public campaign-journey projection for one uniquely matched persisted supporter referral code.';

notify pgrst, 'reload schema';

commit;
