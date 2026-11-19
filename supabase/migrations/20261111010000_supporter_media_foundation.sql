begin;

create table public.voiceup_supporter_media (
  id uuid primary key default gen_random_uuid(),

  supporter_account_id uuid not null
    references public.voiceup_supporter_accounts(id)
    on delete cascade,

  workspace_id text not null,
  campaign_id text not null,
  supporter_id text not null,

  storage_bucket text not null default 'campaign-private',
  storage_path text,

  media_type text not null
    check (media_type in ('photo', 'video')),

  caption text not null default '',

  consent_given boolean not null default false,
  consent_at timestamptz,

  moderation_status text not null default 'pending'
    check (moderation_status in (
      'pending',
      'approved',
      'rejected'
    )),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (storage_bucket = 'campaign-private'),

  check (
    (consent_given = true and consent_at is not null)
    or
    (consent_given = false and consent_at is null)
  )
);

create index voiceup_supporter_media_owner_idx
on public.voiceup_supporter_media (
  supporter_account_id,
  created_at desc
);

alter table public.voiceup_supporter_media
enable row level security;

create policy "Supporters read own media"
on public.voiceup_supporter_media
for select
to authenticated
using (
  exists (
    select 1
    from public.voiceup_supporter_accounts account
    where account.id = supporter_account_id
      and account.auth_user_id = auth.uid()
      and account.workspace_id = voiceup_supporter_media.workspace_id
      and account.campaign_id = voiceup_supporter_media.campaign_id
      and account.supporter_id = voiceup_supporter_media.supporter_id
  )
);

revoke all on public.voiceup_supporter_media
from public, anon, authenticated;

grant select on public.voiceup_supporter_media
to authenticated;

commit;