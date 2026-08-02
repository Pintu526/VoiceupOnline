begin;

select plan(14);

select has_table('public', 'vboss_resource_location_configurations', 'resource configuration table exists');
select has_table('public', 'vboss_resource_location_paths', 'resource path table exists');
select has_table('public', 'vboss_resource_location_audit', 'append-only audit table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.vboss_resource_location_paths'::regclass),
  'location paths have RLS enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.vboss_resource_location_paths', 'insert'),
  'authenticated callers cannot insert location paths directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.vboss_resource_location_paths', 'update'),
  'authenticated callers cannot update location paths directly'
);

select ok(
  (select prosecdef from pg_proc where oid = to_regprocedure('public.read_resource_locations(uuid,text,text,text,text,text,boolean,text)')),
  'read RPC is SECURITY DEFINER'
);
select ok(
  (select prosecdef from pg_proc where oid = to_regprocedure('public.add_resource_location(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text)')),
  'add RPC is SECURITY DEFINER'
);
select ok(
  (select prosecdef from pg_proc where oid = to_regprocedure('public.deactivate_resource_location(uuid,text,text,text,text,text,uuid,integer)')),
  'deactivate RPC is SECURITY DEFINER'
);
select ok(
  has_function_privilege('service_role', 'public.read_resource_locations(uuid,text,text,text,text,text,boolean,text)', 'EXECUTE'),
  'service role can execute read RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.read_resource_locations(uuid,text,text,text,text,text,boolean,text)', 'EXECUTE'),
  'authenticated callers cannot execute read RPC directly'
);

select col_is_unique(
  'public',
  'vboss_resource_location_paths',
  array['workspace_id', 'application_key', 'resource_type', 'resource_id', 'normalized_path'],
  'exact resource paths are unique'
);
select col_has_check(
  'public',
  'vboss_resource_location_paths',
  'leaf_level',
  'leaf level has a check constraint'
);
select col_has_check(
  'public',
  'vboss_resource_location_audit',
  'action',
  'audit action has a check constraint'
);

select * from finish();
rollback;
