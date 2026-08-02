begin;

create table public.resource_location_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  application_key text not null,
  resource_type text not null,
  resource_id text not null,
  resource_slug text not null,
  actor_user_id uuid not null references auth.users(id),
  idempotency_key text not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('validating', 'validation_failed', 'ready', 'importing', 'completed', 'failed')),
  total_rows integer not null default 0 check (total_rows between 0 and 2000),
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  duplicate_in_file_rows integer not null default 0,
  existing_rows integer not null default 0,
  reactivation_rows integer not null default 0,
  master_conflict_rows integer not null default 0,
  error_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(error_summary) = 'object' and octet_length(error_summary::text) <= 4096),
  configuration_version bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, application_key, resource_type, resource_id, actor_user_id, idempotency_key)
);

create table public.resource_location_import_rows (
  import_id uuid not null references public.resource_location_imports(id) on delete cascade,
  row_number integer not null check (row_number between 1 and 2000),
  country text,
  state text,
  district text,
  block text,
  panchayat text,
  village text,
  postal_code text,
  normalized_path text,
  leaf_level text,
  classification text not null check (classification in ('valid', 'invalid', 'duplicate_in_file', 'existing', 'reactivate', 'master_conflict')),
  error_code text,
  primary key (import_id, row_number)
);

alter table public.resource_location_imports enable row level security;
alter table public.resource_location_import_rows enable row level security;
revoke all on public.resource_location_imports, public.resource_location_import_rows from public, anon, authenticated;

create or replace function public.validate_resource_location_import(
  p_actor_user_id uuid, p_workspace_id text, p_application_key text, p_resource_type text, p_resource_id text, p_resource_slug text,
  p_idempotency_key text, p_content_hash text, p_rows jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare authorization_code text; import_record public.resource_location_imports%rowtype; item jsonb; row_index integer := 0;
  valid_count integer := 0; invalid_count integer := 0; duplicate_count integer := 0; existing_count integer := 0; reactivation_count integer := 0; master_count integer := 0;
  classification text; error_code text; normalized text; existing_active boolean;
begin
  if auth.role() <> 'service_role' then return jsonb_build_object('code','forbidden'); end if;
  authorization_code := public.vboss_resource_location_authorization(p_actor_user_id,p_workspace_id,p_application_key,p_resource_type,p_resource_id,p_resource_slug);
  if authorization_code <> 'authorized' then return jsonb_build_object('code',authorization_code); end if;
  if p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,160}$' or p_content_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then return jsonb_build_object('code','validation_failed'); end if;
  select * into import_record from public.resource_location_imports where workspace_id=p_workspace_id and application_key=p_application_key and resource_type=p_resource_type and resource_id=p_resource_id and actor_user_id=p_actor_user_id and idempotency_key=p_idempotency_key for update;
  if found and import_record.content_hash <> p_content_hash then return jsonb_build_object('code','idempotency_conflict'); end if;
  if found and import_record.status in ('ready','completed') then return jsonb_build_object('code','ok','importId',import_record.id,'status',import_record.status); end if;
  if not found then
    insert into public.resource_location_imports(workspace_id,application_key,resource_type,resource_id,resource_slug,actor_user_id,idempotency_key,content_hash,status,total_rows)
    values(p_workspace_id,p_application_key,p_resource_type,p_resource_id,p_resource_slug,p_actor_user_id,p_idempotency_key,p_content_hash,'validating',jsonb_array_length(p_rows)) returning * into import_record;
  else
    delete from public.resource_location_import_rows where import_id=import_record.id;
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    row_index := row_index + 1; normalized := item->>'normalizedPath'; classification := coalesce(item->>'classification','invalid'); error_code := item->>'errorCode';
    if classification = 'valid' then
      select active into existing_active from public.vboss_resource_location_paths where workspace_id=p_workspace_id and application_key=p_application_key and resource_type=p_resource_type and resource_id=p_resource_id and normalized_path=normalized;
      if found then classification := case when existing_active then 'existing' else 'reactivate' end; end if;
    end if;
    insert into public.resource_location_import_rows(import_id,row_number,country,state,district,block,panchayat,village,postal_code,normalized_path,leaf_level,classification,error_code)
    values(import_record.id,row_index,item->>'country',nullif(item->>'state',''),nullif(item->>'district',''),nullif(item->>'block',''),nullif(item->>'panchayat',''),nullif(item->>'village',''),nullif(item->>'postalCode',''),normalized,item->>'leafLevel',classification,error_code);
    if classification='valid' then valid_count:=valid_count+1; elsif classification='existing' then existing_count:=existing_count+1; valid_count:=valid_count+1; elsif classification='reactivate' then reactivation_count:=reactivation_count+1; valid_count:=valid_count+1; elsif classification='duplicate_in_file' then duplicate_count:=duplicate_count+1; invalid_count:=invalid_count+1; elsif classification='master_conflict' then master_count:=master_count+1; invalid_count:=invalid_count+1; else invalid_count:=invalid_count+1; end if;
  end loop;
  update public.resource_location_imports set status=case when invalid_count>0 then 'validation_failed' else 'ready' end,valid_rows=valid_count,invalid_rows=invalid_count,duplicate_in_file_rows=duplicate_count,existing_rows=existing_count,reactivation_rows=reactivation_count,master_conflict_rows=master_count,error_summary=jsonb_build_object('invalidRows',invalid_count),updated_at=now() where id=import_record.id returning * into import_record;
  return jsonb_build_object('code','ok','importId',import_record.id,'status',import_record.status,'totalRows',import_record.total_rows,'validRows',valid_count,'invalidRows',invalid_count,'duplicateInFileRows',duplicate_count,'existingRows',existing_count,'reactivationRows',reactivation_count,'masterConflictRows',master_count);
end; $$;

create or replace function public.commit_resource_location_import(
  p_actor_user_id uuid, p_workspace_id text, p_application_key text, p_resource_type text, p_resource_id text, p_resource_slug text,
  p_import_id uuid, p_idempotency_key text, p_content_hash text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare authorization_code text; import_record public.resource_location_imports%rowtype; row_record public.resource_location_import_rows%rowtype; path_record public.vboss_resource_location_paths%rowtype; configuration bigint;
begin
  if auth.role() <> 'service_role' then return jsonb_build_object('code','forbidden'); end if;
  authorization_code := public.vboss_resource_location_authorization(p_actor_user_id,p_workspace_id,p_application_key,p_resource_type,p_resource_id,p_resource_slug);
  if authorization_code <> 'authorized' then return jsonb_build_object('code',authorization_code); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id||'|'||p_application_key||'|'||p_resource_type||'|'||p_resource_id,0));
  select * into import_record from public.resource_location_imports where id=p_import_id and workspace_id=p_workspace_id and application_key=p_application_key and resource_type=p_resource_type and resource_id=p_resource_id and actor_user_id=p_actor_user_id and idempotency_key=p_idempotency_key and content_hash=p_content_hash for update;
  if not found then return jsonb_build_object('code','validation_failed'); end if;
  if import_record.status='completed' then return jsonb_build_object('code','completed','importId',import_record.id,'configurationVersion',import_record.configuration_version); end if;
  if import_record.status <> 'ready' then return jsonb_build_object('code','validation_failed'); end if;
  update public.resource_location_imports set status='importing',updated_at=now() where id=import_record.id;
  insert into public.vboss_resource_location_configurations(workspace_id,application_key,resource_type,resource_id,resource_slug,configuration_version) values(p_workspace_id,p_application_key,p_resource_type,p_resource_id,p_resource_slug,1)
  on conflict(workspace_id,application_key,resource_type,resource_id) do update set configuration_version=public.vboss_resource_location_configurations.configuration_version+1,resource_slug=excluded.resource_slug,updated_at=now() returning configuration_version into configuration;
  for row_record in select * from public.resource_location_import_rows where import_id=import_record.id and classification in ('valid','reactivate') order by row_number loop
    select * into path_record from public.vboss_resource_location_paths where workspace_id=p_workspace_id and application_key=p_application_key and resource_type=p_resource_type and resource_id=p_resource_id and normalized_path=row_record.normalized_path for update;
    if found then update public.vboss_resource_location_paths set active=true,version=version+1,deactivated_by=null,deactivated_at=null,updated_at=now() where id=path_record.id returning * into path_record;
    else insert into public.vboss_resource_location_paths(workspace_id,application_key,resource_type,resource_id,resource_slug,country,state,district,block,panchayat,village,postal_code,normalized_path,leaf_level,source,created_by) values(p_workspace_id,p_application_key,p_resource_type,p_resource_id,p_resource_slug,row_record.country,row_record.state,row_record.district,row_record.block,row_record.panchayat,row_record.village,row_record.postal_code,row_record.normalized_path,row_record.leaf_level,'campaign_import',p_actor_user_id) returning * into path_record; end if;
    insert into public.vboss_resource_location_audit(workspace_id,application_key,resource_type,resource_id,location_path_id,actor_user_id,action,result_code,metadata) values(p_workspace_id,p_application_key,p_resource_type,p_resource_id,path_record.id,p_actor_user_id,case when row_record.classification='reactivate' then 'reactivated' else 'created' end,case when row_record.classification='reactivate' then 'reactivated' else 'created' end,jsonb_build_object('importId',import_record.id,'rowNumber',row_record.row_number));
  end loop;
  update public.resource_location_imports set status='completed',configuration_version=configuration,completed_at=now(),updated_at=now() where id=import_record.id;
  return jsonb_build_object('code','completed','importId',import_record.id,'configurationVersion',configuration);
exception when others then
  raise;
end; $$;

create or replace function public.read_resource_location_import(
  p_actor_user_id uuid,p_workspace_id text,p_application_key text,p_resource_type text,p_resource_id text,p_resource_slug text,p_import_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare authorization_code text;
begin
  if auth.role() <> 'service_role' then return jsonb_build_object('code','forbidden'); end if;
  authorization_code := public.vboss_resource_location_authorization(p_actor_user_id,p_workspace_id,p_application_key,p_resource_type,p_resource_id,p_resource_slug);
  if authorization_code <> 'authorized' then return jsonb_build_object('code',authorization_code); end if;
  return coalesce((select jsonb_build_object('code','ok','importId',i.id,'status',i.status,'totalRows',i.total_rows,'validRows',i.valid_rows,'invalidRows',i.invalid_rows,'duplicateInFileRows',i.duplicate_in_file_rows,'existingRows',i.existing_rows,'reactivationRows',i.reactivation_rows,'masterConflictRows',i.master_conflict_rows,'configurationVersion',i.configuration_version,'rows',coalesce((select jsonb_agg(jsonb_build_object('rowNumber',r.row_number,'country',r.country,'state',r.state,'district',r.district,'block',r.block,'panchayat',r.panchayat,'village',r.village,'postalCode',r.postal_code,'normalizedPath',r.normalized_path,'classification',r.classification,'errorCode',r.error_code) order by r.row_number) from public.resource_location_import_rows r where r.import_id=i.id),'[]'::jsonb)) from public.resource_location_imports i where i.id=p_import_id and i.workspace_id=p_workspace_id and i.application_key=p_application_key and i.resource_type=p_resource_type and i.resource_id=p_resource_id and i.actor_user_id=p_actor_user_id),jsonb_build_object('code','validation_failed'));
end; $$;

revoke all on function public.validate_resource_location_import(uuid,text,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.commit_resource_location_import(uuid,text,text,text,text,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.read_resource_location_import(uuid,text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.validate_resource_location_import(uuid,text,text,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.commit_resource_location_import(uuid,text,text,text,text,text,uuid,text,text) to service_role;
grant execute on function public.read_resource_location_import(uuid,text,text,text,text,text,uuid) to service_role;
commit;
