begin;

alter table public.resource_location_imports
  drop constraint if exists resource_location_imports_total_rows_check;

alter table public.resource_location_imports
  add constraint resource_location_imports_total_rows_check
  check (total_rows between 0 and 50000);

alter table public.resource_location_import_rows
  drop constraint if exists resource_location_import_rows_row_number_check;

alter table public.resource_location_import_rows
  add constraint resource_location_import_rows_row_number_check
  check (row_number between 1 and 50000);

alter table public.resource_location_imports
  drop constraint if exists resource_location_imports_status_check;

alter table public.resource_location_imports
  add constraint resource_location_imports_status_check
  check (status in ('validating', 'validation_failed', 'ready', 'importing', 'completed', 'failed', 'partial'));

alter table public.resource_location_imports
  add column if not exists import_mode text not null default 'legacy'
    check (import_mode in ('legacy', 'chunked'));

alter table public.resource_location_imports
  add column if not exists chunk_size integer
    check (chunk_size is null or chunk_size between 1 and 500);

alter table public.resource_location_imports
  add column if not exists total_chunks integer not null default 0
    check (total_chunks between 0 and 200);

alter table public.resource_location_imports
  add column if not exists completed_chunks integer not null default 0
    check (completed_chunks between 0 and 200);

alter table public.resource_location_imports
  add column if not exists imported_rows integer not null default 0
    check (imported_rows between 0 and 50000);

alter table public.resource_location_imports
  add column if not exists skipped_rows integer not null default 0
    check (skipped_rows between 0 and 50000);

alter table public.resource_location_imports
  add column if not exists failed_rows integer not null default 0
    check (failed_rows between 0 and 50000);

create table if not exists public.resource_location_import_chunks (
  import_id uuid not null references public.resource_location_imports(id) on delete cascade,
  chunk_index integer not null check (chunk_index between 0 and 199),
  chunk_row_count integer not null default 0 check (chunk_row_count between 0 and 500),
  status text not null check (status in ('pending', 'validated', 'ready', 'committing', 'completed', 'failed')),
  valid_rows integer not null default 0 check (valid_rows between 0 and 500),
  invalid_rows integer not null default 0 check (invalid_rows between 0 and 500),
  skipped_rows integer not null default 0 check (skipped_rows between 0 and 500),
  idempotency_key text not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  error_code text,
  first_row_number integer,
  last_row_number integer,
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (import_id, chunk_index),
  unique (import_id, idempotency_key)
);

alter table public.resource_location_import_chunks enable row level security;
revoke all on public.resource_location_import_chunks from public, anon, authenticated;

create index if not exists resource_location_import_chunks_import_status_idx
  on public.resource_location_import_chunks (import_id, status, chunk_index);

create index if not exists resource_location_import_rows_import_classification_idx
  on public.resource_location_import_rows (import_id, classification);

create or replace function public.begin_resource_location_large_import(
  p_actor_user_id uuid, p_workspace_id text, p_application_key text, p_resource_type text, p_resource_id text, p_resource_slug text,
  p_idempotency_key text, p_content_hash text, p_total_rows integer, p_chunk_size integer, p_total_chunks integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare authorization_code text; import_record public.resource_location_imports%rowtype; chunk_index integer;
begin
  if auth.role() <> 'service_role' then return jsonb_build_object('code','forbidden'); end if;
  authorization_code := public.vboss_resource_location_authorization(p_actor_user_id,p_workspace_id,p_application_key,p_resource_type,p_resource_id,p_resource_slug);
  if authorization_code <> 'authorized' then return jsonb_build_object('code',authorization_code); end if;
  if p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,160}$' or p_content_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('code','validation_failed'); end if;
  if p_total_rows < 1 or p_total_rows > 50000 or p_chunk_size < 1 or p_chunk_size > 500 or p_total_chunks < 1 or p_total_chunks > 200 then return jsonb_build_object('code','validation_failed'); end if;

  select * into import_record from public.resource_location_imports
  where workspace_id=p_workspace_id and application_key=p_application_key and resource_type=p_resource_type and resource_id=p_resource_id
    and actor_user_id=p_actor_user_id and idempotency_key=p_idempotency_key for update;

  if found and import_record.content_hash <> p_content_hash then return jsonb_build_object('code','idempotency_conflict'); end if;
  if found and import_record.status in ('ready','importing','completed','partial') then
    return jsonb_build_object('code','ok','importId',import_record.id,'status',import_record.status,'totalRows',import_record.total_rows,'totalChunks',import_record.total_chunks,'completedChunks',import_record.completed_chunks);
  end if;

  if not found then
    insert into public.resource_location_imports(
      workspace_id,application_key,resource_type,resource_id,resource_slug,actor_user_id,idempotency_key,content_hash,
      status,total_rows,import_mode,chunk_size,total_chunks
    ) values (
      p_workspace_id,p_application_key,p_resource_type,p_resource_id,p_resource_slug,p_actor_user_id,p_idempotency_key,p_content_hash,
      'validating',p_total_rows,'chunked',p_chunk_size,p_total_chunks
    ) returning * into import_record;
  else
    delete from public.resource_location_import_rows where import_id=import_record.id;
    delete from public.resource_location_import_chunks where import_id=import_record.id;
    update public.resource_location_imports set
      status='validating', total_rows=p_total_rows, import_mode='chunked', chunk_size=p_chunk_size, total_chunks=p_total_chunks,
      valid_rows=0, invalid_rows=0, duplicate_in_file_rows=0, existing_rows=0, reactivation_rows=0, master_conflict_rows=0,
      imported_rows=0, skipped_rows=0, failed_rows=0, completed_chunks=0, updated_at=now()
    where id=import_record.id returning * into import_record;
  end if;

  for chunk_index in 0..(p_total_chunks - 1) loop
    insert into public.resource_location_import_chunks(import_id,chunk_index,status,idempotency_key,content_hash)
    values(import_record.id,chunk_index,'pending',p_idempotency_key||':chunk:'||chunk_index,p_content_hash)
    on conflict (import_id, chunk_index) do nothing;
  end loop;

  return jsonb_build_object('code','ok','importId',import_record.id,'status',import_record.status,'totalRows',import_record.total_rows,'totalChunks',import_record.total_chunks,'completedChunks',import_record.completed_chunks);
end; $$;

create or replace function public.validate_resource_location_import_chunk(
  p_actor_user_id uuid, p_workspace_id text, p_application_key text, p_resource_type text, p_resource_id text, p_resource_slug text,
  p_import_id uuid, p_chunk_index integer, p_idempotency_key text, p_content_hash text, p_rows jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare authorization_code text; import_record public.resource_location_imports%rowtype; chunk_record public.resource_location_import_chunks%rowtype;
  item jsonb; row_number integer; classification text; error_code text; normalized text; existing_active boolean;
  valid_count integer := 0; invalid_count integer := 0; duplicate_count integer := 0; existing_count integer := 0; reactivation_count integer := 0; master_count integer := 0; skipped_count integer := 0;
  first_row integer := null; last_row integer := null;
begin
  if auth.role() <> 'service_role' then return jsonb_build_object('code','forbidden'); end if;
  authorization_code := public.vboss_resource_location_authorization(p_actor_user_id,p_workspace_id,p_application_key,p_resource_type,p_resource_id,p_resource_slug);
  if authorization_code <> 'authorized' then return jsonb_build_object('code',authorization_code); end if;
  if p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,160}$' or p_content_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then return jsonb_build_object('code','validation_failed'); end if;

  select * into import_record from public.resource_location_imports
  where id=p_import_id and workspace_id=p_workspace_id and application_key=p_application_key and resource_type=p_resource_type and resource_id=p_resource_id
    and actor_user_id=p_actor_user_id and import_mode='chunked' for update;
  if not found then return jsonb_build_object('code','validation_failed'); end if;
  if import_record.content_hash <> p_content_hash then return jsonb_build_object('code','idempotency_conflict'); end if;

  select * into chunk_record from public.resource_location_import_chunks
  where import_id=p_import_id and chunk_index=p_chunk_index for update;
  if not found then return jsonb_build_object('code','validation_failed'); end if;
  if chunk_record.status in ('validated','ready','completed') and chunk_record.idempotency_key = p_idempotency_key then
    return jsonb_build_object('code','ok','importId',import_record.id,'chunkIndex',p_chunk_index,'status',chunk_record.status,'validRows',chunk_record.valid_rows,'invalidRows',chunk_record.invalid_rows,'skippedRows',chunk_record.skipped_rows);
  end if;

  delete from public.resource_location_import_rows where import_id=p_import_id and row_number in (
    select (value->>'rowNumber')::integer from jsonb_array_elements(p_rows)
  );

  for item in select value from jsonb_array_elements(p_rows) loop
    row_number := (item->>'rowNumber')::integer;
    if first_row is null or row_number < first_row then first_row := row_number; end if;
    if last_row is null or row_number > last_row then last_row := row_number; end if;
    normalized := item->>'normalizedPath';
    classification := coalesce(item->>'classification','invalid');
    error_code := item->>'errorCode';

    if classification = 'valid' and normalized is not null then
      if exists (select 1 from public.resource_location_import_rows where import_id=p_import_id and normalized_path=normalized and row_number <> row_number) then
        classification := 'duplicate_in_file'; error_code := 'duplicate';
      else
        select active into existing_active from public.vboss_resource_location_paths
        where workspace_id=p_workspace_id and application_key=p_application_key and resource_type=p_resource_type and resource_id=p_resource_id and normalized_path=normalized;
        if found then classification := case when existing_active then 'existing' else 'reactivate' end; error_code := null; end if;
      end if;
    end if;

    insert into public.resource_location_import_rows(import_id,row_number,country,state,district,block,panchayat,village,postal_code,normalized_path,leaf_level,classification,error_code)
    values(import_record.id,row_number,item->>'country',nullif(item->>'state',''),nullif(item->>'district',''),nullif(item->>'block',''),nullif(item->>'panchayat',''),nullif(item->>'village',''),nullif(item->>'postalCode',''),normalized,item->>'leafLevel',classification,error_code);

    if classification='valid' then valid_count:=valid_count+1;
    elsif classification='existing' then existing_count:=existing_count+1; valid_count:=valid_count+1;
    elsif classification='reactivate' then reactivation_count:=reactivation_count+1; valid_count:=valid_count+1;
    elsif classification='duplicate_in_file' then duplicate_count:=duplicate_count+1; skipped_count:=skipped_count+1;
    elsif classification='master_conflict' then master_count:=master_count+1; skipped_count:=skipped_count+1;
    else invalid_count:=invalid_count+1; end if;
  end loop;

  update public.resource_location_import_chunks set
    status='validated', chunk_row_count=jsonb_array_length(p_rows), valid_rows=valid_count, invalid_rows=invalid_count, skipped_rows=skipped_count,
    idempotency_key=p_idempotency_key, content_hash=p_content_hash, first_row_number=first_row, last_row_number=last_row, updated_at=now()
  where import_id=p_import_id and chunk_index=p_chunk_index returning * into chunk_record;

  update public.resource_location_imports set
    valid_rows = (select count(*) from public.resource_location_import_rows where import_id=p_import_id and classification in ('valid','existing','reactivate')),
    invalid_rows = (select count(*) from public.resource_location_import_rows where import_id=p_import_id and classification='invalid'),
    duplicate_in_file_rows = (select count(*) from public.resource_location_import_rows where import_id=p_import_id and classification='duplicate_in_file'),
    existing_rows = (select count(*) from public.resource_location_import_rows where import_id=p_import_id and classification='existing'),
    reactivation_rows = (select count(*) from public.resource_location_import_rows where import_id=p_import_id and classification='reactivate'),
    master_conflict_rows = (select count(*) from public.resource_location_import_rows where import_id=p_import_id and classification='master_conflict'),
    skipped_rows = (select count(*) from public.resource_location_import_rows where import_id=p_import_id and classification in ('duplicate_in_file','master_conflict','existing')),
    failed_rows = (select count(*) from public.resource_location_import_rows where import_id=p_import_id and classification='invalid'),
    status = case when (select count(*) from public.resource_location_import_rows where import_id=p_import_id and classification='valid') > 0 then 'ready' else 'validation_failed' end,
    updated_at=now()
  where id=p_import_id returning * into import_record;

  return jsonb_build_object('code','ok','importId',import_record.id,'chunkIndex',p_chunk_index,'status',chunk_record.status,'validRows',valid_count,'invalidRows',invalid_count,'skippedRows',skipped_count,'importStatus',import_record.status,'totalValidRows',import_record.valid_rows,'totalInvalidRows',import_record.invalid_rows,'totalSkippedRows',import_record.skipped_rows);
end; $$;

create or replace function public.commit_resource_location_import_chunk(
  p_actor_user_id uuid, p_workspace_id text, p_application_key text, p_resource_type text, p_resource_id text, p_resource_slug text,
  p_import_id uuid, p_chunk_index integer, p_idempotency_key text, p_content_hash text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare authorization_code text; import_record public.resource_location_imports%rowtype; chunk_record public.resource_location_import_chunks%rowtype;
  row_record public.resource_location_import_rows%rowtype; path_record public.vboss_resource_location_paths%rowtype; configuration bigint; imported_count integer := 0;
begin
  if auth.role() <> 'service_role' then return jsonb_build_object('code','forbidden'); end if;
  authorization_code := public.vboss_resource_location_authorization(p_actor_user_id,p_workspace_id,p_application_key,p_resource_type,p_resource_id,p_resource_slug);
  if authorization_code <> 'authorized' then return jsonb_build_object('code',authorization_code); end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id||'|'||p_application_key||'|'||p_resource_type||'|'||p_resource_id,0));

  select * into import_record from public.resource_location_imports
  where id=p_import_id and workspace_id=p_workspace_id and application_key=p_application_key and resource_type=p_resource_type and resource_id=p_resource_id
    and actor_user_id=p_actor_user_id and import_mode='chunked' and content_hash=p_content_hash for update;
  if not found then return jsonb_build_object('code','validation_failed'); end if;

  select * into chunk_record from public.resource_location_import_chunks
  where import_id=p_import_id and chunk_index=p_chunk_index and idempotency_key=p_idempotency_key for update;
  if not found then return jsonb_build_object('code','validation_failed'); end if;
  if chunk_record.status='completed' then
    return jsonb_build_object('code','completed','importId',import_record.id,'chunkIndex',p_chunk_index,'configurationVersion',import_record.configuration_version,'importedRows',chunk_record.valid_rows);
  end if;
  if chunk_record.status not in ('validated','ready') then return jsonb_build_object('code','validation_failed'); end if;

  update public.resource_location_import_chunks set status='committing', updated_at=now() where import_id=p_import_id and chunk_index=p_chunk_index;
  update public.resource_location_imports set status='importing', updated_at=now() where id=p_import_id;

  insert into public.vboss_resource_location_configurations(workspace_id,application_key,resource_type,resource_id,resource_slug,configuration_version)
  values(p_workspace_id,p_application_key,p_resource_type,p_resource_id,p_resource_slug,1)
  on conflict(workspace_id,application_key,resource_type,resource_id) do update set configuration_version=public.vboss_resource_location_configurations.configuration_version+1,resource_slug=excluded.resource_slug,updated_at=now()
  returning configuration_version into configuration;

  for row_record in select * from public.resource_location_import_rows where import_id=p_import_id and row_number between chunk_record.first_row_number and chunk_record.last_row_number and classification in ('valid','reactivate') order by row_number loop
    select * into path_record from public.vboss_resource_location_paths where workspace_id=p_workspace_id and application_key=p_application_key and resource_type=p_resource_type and resource_id=p_resource_id and normalized_path=row_record.normalized_path for update;
    if found then
      update public.vboss_resource_location_paths set active=true,version=version+1,deactivated_by=null,deactivated_at=null,updated_at=now() where id=path_record.id returning * into path_record;
    else
      insert into public.vboss_resource_location_paths(workspace_id,application_key,resource_type,resource_id,resource_slug,country,state,district,block,panchayat,village,postal_code,normalized_path,leaf_level,source,created_by)
      values(p_workspace_id,p_application_key,p_resource_type,p_resource_id,p_resource_slug,row_record.country,row_record.state,row_record.district,row_record.block,row_record.panchayat,row_record.village,row_record.postal_code,row_record.normalized_path,row_record.leaf_level,'campaign_import',p_actor_user_id)
      returning * into path_record;
    end if;
    insert into public.vboss_resource_location_audit(workspace_id,application_key,resource_type,resource_id,location_path_id,actor_user_id,action,result_code,metadata)
    values(p_workspace_id,p_application_key,p_resource_type,p_resource_id,path_record.id,p_actor_user_id,case when row_record.classification='reactivate' then 'reactivated' else 'created' end,case when row_record.classification='reactivate' then 'reactivated' else 'created' end,jsonb_build_object('importId',import_record.id,'rowNumber',row_record.row_number,'chunkIndex',p_chunk_index));
    imported_count := imported_count + 1;
  end loop;

  update public.resource_location_import_chunks set status='completed', committed_at=now(), updated_at=now() where import_id=p_import_id and chunk_index=p_chunk_index;
  update public.resource_location_imports set
    completed_chunks = completed_chunks + 1,
    imported_rows = imported_rows + imported_count,
    configuration_version = configuration,
    status = case when completed_chunks + 1 >= total_chunks then 'completed' else 'partial' end,
    completed_at = case when completed_chunks + 1 >= total_chunks then now() else completed_at end,
    updated_at = now()
  where id=p_import_id returning * into import_record;

  return jsonb_build_object('code','completed','importId',import_record.id,'chunkIndex',p_chunk_index,'configurationVersion',configuration,'importedRows',imported_count,'importStatus',import_record.status,'completedChunks',import_record.completed_chunks,'totalChunks',import_record.total_chunks);
exception when others then
  update public.resource_location_import_chunks set status='failed', error_code='persistence_failed', updated_at=now() where import_id=p_import_id and chunk_index=p_chunk_index;
  update public.resource_location_imports set status='failed', updated_at=now() where id=p_import_id;
  return jsonb_build_object('code','persistence_failed');
end; $$;

create or replace function public.read_resource_location_large_import(
  p_actor_user_id uuid,p_workspace_id text,p_application_key text,p_resource_type text,p_resource_id text,p_resource_slug text,p_import_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare authorization_code text;
begin
  if auth.role() <> 'service_role' then return jsonb_build_object('code','forbidden'); end if;
  authorization_code := public.vboss_resource_location_authorization(p_actor_user_id,p_workspace_id,p_application_key,p_resource_type,p_resource_id,p_resource_slug);
  if authorization_code <> 'authorized' then return jsonb_build_object('code',authorization_code); end if;
  return coalesce((
    select jsonb_build_object(
      'code','ok','importId',i.id,'status',i.status,'importMode',i.import_mode,'totalRows',i.total_rows,'validRows',i.valid_rows,'invalidRows',i.invalid_rows,
      'duplicateInFileRows',i.duplicate_in_file_rows,'existingRows',i.existing_rows,'reactivationRows',i.reactivation_rows,'masterConflictRows',i.master_conflict_rows,
      'importedRows',i.imported_rows,'skippedRows',i.skipped_rows,'failedRows',i.failed_rows,'chunkSize',i.chunk_size,'totalChunks',i.total_chunks,'completedChunks',i.completed_chunks,
      'configurationVersion',i.configuration_version,
      'chunks',coalesce((
        select jsonb_agg(jsonb_build_object('chunkIndex',c.chunk_index,'status',c.status,'validRows',c.valid_rows,'invalidRows',c.invalid_rows,'skippedRows',c.skipped_rows,'chunkRowCount',c.chunk_row_count) order by c.chunk_index)
        from public.resource_location_import_chunks c where c.import_id=i.id
      ),'[]'::jsonb)
    )
    from public.resource_location_imports i
    where i.id=p_import_id and i.workspace_id=p_workspace_id and i.application_key=p_application_key and i.resource_type=p_resource_type and i.resource_id=p_resource_id and i.actor_user_id=p_actor_user_id and i.import_mode='chunked'
  ), jsonb_build_object('code','validation_failed'));
end; $$;

create or replace function public.read_resource_location_import_errors(
  p_actor_user_id uuid,p_workspace_id text,p_application_key text,p_resource_type text,p_resource_id text,p_resource_slug text,p_import_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare authorization_code text;
begin
  if auth.role() <> 'service_role' then return jsonb_build_object('code','forbidden'); end if;
  authorization_code := public.vboss_resource_location_authorization(p_actor_user_id,p_workspace_id,p_application_key,p_resource_type,p_resource_id,p_resource_slug);
  if authorization_code <> 'authorized' then return jsonb_build_object('code',authorization_code); end if;
  return coalesce((
    select jsonb_build_object(
      'code','ok','rows',coalesce((
        select jsonb_agg(jsonb_build_object(
          'rowNumber',r.row_number,'country',r.country,'state',r.state,'district',r.district,'block',r.block,'panchayat',r.panchayat,'village',r.village,'postalCode',r.postal_code,
          'classification',r.classification,'errorCode',r.error_code
        ) order by r.row_number)
        from public.resource_location_import_rows r
        where r.import_id=i.id and r.classification not in ('valid','reactivate')
      ),'[]'::jsonb)
    )
    from public.resource_location_imports i
    where i.id=p_import_id and i.workspace_id=p_workspace_id and i.application_key=p_application_key and i.resource_type=p_resource_type and i.resource_id=p_resource_id and i.actor_user_id=p_actor_user_id
  ), jsonb_build_object('code','validation_failed'));
end; $$;

revoke all on function public.begin_resource_location_large_import(uuid,text,text,text,text,text,text,text,integer,integer,integer) from public,anon,authenticated;
revoke all on function public.validate_resource_location_import_chunk(uuid,text,text,text,text,text,uuid,integer,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.commit_resource_location_import_chunk(uuid,text,text,text,text,text,uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.read_resource_location_large_import(uuid,text,text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.read_resource_location_import_errors(uuid,text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.begin_resource_location_large_import(uuid,text,text,text,text,text,text,text,integer,integer,integer) to service_role;
grant execute on function public.validate_resource_location_import_chunk(uuid,text,text,text,text,text,uuid,integer,text,text,jsonb) to service_role;
grant execute on function public.commit_resource_location_import_chunk(uuid,text,text,text,text,text,uuid,integer,text,text) to service_role;
grant execute on function public.read_resource_location_large_import(uuid,text,text,text,text,text,uuid) to service_role;
grant execute on function public.read_resource_location_import_errors(uuid,text,text,text,text,text,uuid) to service_role;

commit;
