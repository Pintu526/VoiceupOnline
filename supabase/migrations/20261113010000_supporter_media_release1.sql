begin;
alter table public.voiceup_supporter_media add column if not exists deleted_at timestamptz;
create or replace function public.voiceup_moderate_supporter_media(
 p_workspace_id text, p_campaign_id text, p_campaign_slug text,
 p_action text, p_media_id uuid default null, p_reason text default ''
) returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare v_item public.voiceup_supporter_media%rowtype;
begin
 if auth.uid() is null then
   raise exception using errcode='28000',message='voiceup:authentication_required';
 end if;
 if not public.voiceup_is_exact_campaign_admin(p_workspace_id,p_campaign_id,p_campaign_slug,auth.uid()) then
   raise exception using errcode='42501',message='voiceup:campaign_admin_required';
 end if;
 if p_action='list' then
   return jsonb_build_object('items',coalesce((
     select jsonb_agg(to_jsonb(t) order by t.created_at desc)
     from (select id,media_type,caption,moderation_status,created_at,storage_path
           from public.voiceup_supporter_media
           where workspace_id=p_workspace_id and campaign_id=p_campaign_id
             and moderation_status='pending' and deleted_at is null
           order by created_at desc limit 100) t
   ),'[]'::jsonb));
 end if;
 if p_action not in ('approved','rejected') or p_media_id is null
    or length(coalesce(p_reason,''))>500 then
   raise exception using errcode='22023',message='voiceup:invalid_moderation_request';
 end if;
 select * into v_item from public.voiceup_supporter_media
 where id=p_media_id and workspace_id=p_workspace_id and campaign_id=p_campaign_id and deleted_at is null
 for update;
 if not found then
   raise exception using errcode='02000',message='voiceup:media_not_found';
 end if;
 if v_item.moderation_status<>'pending' then
   raise exception using errcode='23514',message='voiceup:media_already_moderated';
 end if;
 if p_action='rejected' and length(trim(coalesce(p_reason,'')))=0 then
   raise exception using errcode='22023',message='voiceup:rejection_reason_required';
 end if;
 if p_action='approved' and (v_item.storage_path is null or not v_item.consent_given) then
   raise exception using errcode='23514',message='voiceup:media_not_ready';
 end if;
 update public.voiceup_supporter_media set moderation_status=p_action,updated_at=now()
 where id=v_item.id;
 insert into public.voiceup_supporter_media_moderation_audit
 (media_id,workspace_id,campaign_id,actor_id,old_status,new_status,reason)
 values (v_item.id,p_workspace_id,p_campaign_id,auth.uid(),v_item.moderation_status,p_action,coalesce(p_reason,''));
 return jsonb_build_object('status',p_action,'mediaId',v_item.id);
end;
$$;
revoke all on function public.voiceup_moderate_supporter_media(text,text,text,text,uuid,text) from public,anon;
grant execute on function public.voiceup_moderate_supporter_media(text,text,text,text,uuid,text) to authenticated;
commit;
