begin;

create or replace function public.voiceup_can_manage_workspace_storage(target_workspace_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.voiceup_workspace_members member
    where member.workspace_id = target_workspace_id
      and member.user_id = auth.uid()
      and member.active
      and member.role in ('platform_owner', 'workspace_admin', 'campaign_admin', 'field_officer')
  );
$$;

revoke all on function public.voiceup_can_manage_workspace_storage(text) from public;
grant execute on function public.voiceup_can_manage_workspace_storage(text) to authenticated;

create policy "Campaign private approved roles select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'campaign-private'
    and public.voiceup_can_manage_workspace_storage(
      coalesce((storage.foldername(name))[1], '')
    )
  );

create policy "Campaign public media approved roles insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id in ('campaign-public', 'voiceup-campaign-media')
    and public.voiceup_can_manage_workspace_storage(
      coalesce((storage.foldername(name))[1], '')
    )
  );

create policy "Campaign public media approved roles update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id in ('campaign-public', 'voiceup-campaign-media')
    and public.voiceup_can_manage_workspace_storage(
      coalesce((storage.foldername(name))[1], '')
    )
  )
  with check (
    bucket_id in ('campaign-public', 'voiceup-campaign-media')
    and public.voiceup_can_manage_workspace_storage(
      coalesce((storage.foldername(name))[1], '')
    )
  );

create policy "Campaign public media approved roles delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id in ('campaign-public', 'voiceup-campaign-media')
    and public.voiceup_can_manage_workspace_storage(
      coalesce((storage.foldername(name))[1], '')
    )
  );

drop policy if exists "Authenticated can manage campaign storage"
  on storage.objects;
drop policy if exists "Authenticated can read private campaign assets"
  on storage.objects;
drop policy if exists "Authenticated can upload campaign assets"
  on storage.objects;
drop policy if exists "Authenticated can update campaign assets"
  on storage.objects;
drop policy if exists "Authenticated can delete campaign assets"
  on storage.objects;
drop policy if exists "Campaign private members select"
  on storage.objects;
drop policy if exists "Public can read campaign public storage"
  on storage.objects;

comment on function public.voiceup_can_manage_workspace_storage(text) is
  'Returns true only for active, approved storage managers in the exact workspace path prefix.';

commit;
