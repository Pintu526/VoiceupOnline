begin;

create unique index if not exists
  voiceup_supporter_accounts_media_identity_idx
on public.voiceup_supporter_accounts (
  id, workspace_id, campaign_id, supporter_id
);

alter table public.voiceup_supporter_media
add constraint voiceup_supporter_media_account_identity_fk
foreign key (
  supporter_account_id,
  workspace_id,
  campaign_id,
  supporter_id
)
references public.voiceup_supporter_accounts (
  id,
  workspace_id,
  campaign_id,
  supporter_id
)
on delete cascade;

alter table public.voiceup_supporter_media
add constraint voiceup_supporter_media_consent_before_approval
check (
  moderation_status <> 'approved'
  or consent_given = true
);

commit;