begin;

-- Only finalized, consented media can receive approval.
alter table public.voiceup_supporter_media
add constraint voiceup_supporter_media_approved_requires_file
check (
  moderation_status <> 'approved'
  or (
    storage_path is not null
    and length(trim(storage_path)) > 0
    and consent_given = true
    and consent_at is not null
  )
);

-- Prevent two metadata records from claiming the same private file.
create unique index voiceup_supporter_media_unique_storage_path
on public.voiceup_supporter_media (storage_bucket, storage_path)
where storage_path is not null;

commit;