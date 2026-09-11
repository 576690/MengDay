-- Run once using the Supabase SQL editor. State documents are private per user;
-- commit_state is the only client write interface and serializes every mutation.
create table public.user_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.sync_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  revision bigint not null,
  created_at timestamptz not null default now(),
  primary key(user_id, operation_id)
);
alter table public.user_states enable row level security;
alter table public.sync_operations enable row level security;
create function public.account_ready() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from auth.users where id=auth.uid() and coalesce(raw_app_meta_data->>'force_password_change','false')<>'true')
$$;
revoke all on function public.account_ready() from public;
grant execute on function public.account_ready() to authenticated;
create policy own_state on public.user_states for select to authenticated
  using (auth.uid()=user_id and (select public.account_ready()));
revoke all on public.user_states,public.sync_operations from anon,authenticated;
grant select on public.user_states to authenticated;

create function public.validate_mengday(d jsonb) returns void language plpgsql set search_path=public as $$
declare a jsonb; e jsonb; s numeric; ending numeric; previous_end numeric := -1; active_count int:=0;
begin
  if jsonb_typeof(d->'activities') is distinct from 'array' or jsonb_typeof(d->'entries') is distinct from 'array'
    or jsonb_typeof(d->'settings') is distinct from 'object' then raise exception 'Invalid data structure'; end if;
  if jsonb_array_length(d->'activities')>1000 or jsonb_array_length(d->'entries')>100000 or octet_length(d::text)>12000000 then raise exception 'Data exceeds limits'; end if;
  if coalesce(d->'settings'->>'theme','') not in ('light','dark','system') or not exists(select 1 from pg_timezone_names where name=d->'settings'->>'timezone') then raise exception 'Invalid settings'; end if;
  for a in select value from jsonb_array_elements(d->'activities') loop
    if jsonb_typeof(a->'id') is distinct from 'string' or jsonb_typeof(a->'name') is distinct from 'string'
      or coalesce(a->>'id','')='' or coalesce(length(trim(a->>'name')),0) not between 1 and 80
      or coalesce(a->>'color','') !~ '^#[0-9a-fA-F]{6}$' or coalesce(a->>'icon','') not in ('BriefcaseBusiness','BookOpen','Dumbbell','Coffee','Headphones','Moon','Code2','Heart','Pencil','Bike','Leaf','Music')
      or jsonb_typeof(a->'archived') is distinct from 'boolean' or jsonb_typeof(a->'category') is distinct from 'string' or length(a->>'category')>80
      or jsonb_typeof(a->'order') is distinct from 'number' or jsonb_typeof(a->'lastUsed') is distinct from 'number'
      or jsonb_typeof(a->'goalMinutes') is distinct from 'number' or (a->>'goalMinutes')::numeric not between 0 and 10080 or coalesce(a->>'goalPeriod','') not in ('day','week') then raise exception 'Invalid activity'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(d->'activities') item group by item->>'id' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(d->'activities') item group by lower(trim(item->>'name')) having count(*)>1)
    or exists(select 1 from jsonb_array_elements(d->'entries') item group by item->>'id' having count(*)>1) then raise exception 'Duplicate name or ID'; end if;
  for e in select value from jsonb_array_elements(d->'entries') order by (value->>'start')::numeric loop
    if jsonb_typeof(e->'id') is distinct from 'string' or jsonb_typeof(e->'activityId') is distinct from 'string'
      or coalesce(e->>'id','')='' or jsonb_typeof(e->'start') is distinct from 'number'
      or (jsonb_typeof(e->'end') is distinct from 'number' and jsonb_typeof(e->'end') is distinct from 'null')
      or jsonb_typeof(e->'note') is distinct from 'string' or length(e->>'note')>10000
      or not exists(select 1 from jsonb_array_elements(d->'activities') item where item->>'id'=e->>'activityId') then raise exception 'Invalid entry'; end if;
    s:=(e->>'start')::numeric; ending:=(e->>'end')::numeric;
    if s<0 or s>8640000000000000 or (ending is not null and (ending<=s or ending>8640000000000000)) then raise exception 'Invalid time range'; end if;
    if s<previous_end then raise exception 'Overlapping entries'; end if;
    if ending is null then active_count:=active_count+1; end if;
    previous_end:=coalesce(ending,8640000000000001);
  end loop;
  if active_count>1 then raise exception 'Only one active timer allowed'; end if;
end $$;

create function public.commit_state(p_operation_id uuid,p_expected_revision bigint,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); current_row public.user_states; old_revision bigint; new_revision bigint;
begin
  if u is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null or p_expected_revision is null or p_expected_revision<0 then raise exception 'Operation ID and expected revision are required'; end if;
  -- Query current metadata, rather than trusting a potentially stale JWT.
  if exists(select 1 from auth.users where id=u and raw_app_meta_data->>'force_password_change'='true') then raise exception 'Change temporary password first'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  select * into current_row from public.user_states where user_id=u;
  select revision into old_revision from public.sync_operations where user_id=u and operation_id=p_operation_id;
  if old_revision is not null then
    -- Return a conflict if another device has committed since this operation;
    -- otherwise a retried operation is acknowledged without a second write.
    if current_row.revision<>old_revision then return jsonb_build_object('conflict',true,'revision',current_row.revision,'data',current_row.data); end if;
    return jsonb_build_object('conflict',false,'revision',old_revision);
  end if;
  if coalesce(current_row.revision,0)<>p_expected_revision then return jsonb_build_object('conflict',true,'revision',current_row.revision,'data',current_row.data); end if;
  perform public.validate_mengday(p_data);
  new_revision:=coalesce(current_row.revision,0)+1;
  insert into public.user_states(user_id,revision,data) values(u,new_revision,p_data)
    on conflict(user_id) do update set revision=excluded.revision,data=excluded.data,updated_at=now();
  insert into public.sync_operations(user_id,operation_id,revision) values(u,p_operation_id,new_revision);
  return jsonb_build_object('conflict',false,'revision',new_revision);
end $$;
revoke all on function public.commit_state(uuid,bigint,jsonb) from public;
grant execute on function public.commit_state(uuid,bigint,jsonb) to authenticated;
revoke all on function public.validate_mengday(jsonb) from public;

-- Supabase updateUser({password}) updates encrypted_password. This trigger clears
-- the admin-owned first-login flag only when the actual password hash changes.
create function public.finish_password_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    new.raw_app_meta_data:=coalesce(new.raw_app_meta_data,'{}'::jsonb)||'{"force_password_change":false}'::jsonb;
  end if;
  return new;
end $$;
revoke all on function public.finish_password_change() from public;
create trigger mengday_password_changed before update of encrypted_password on auth.users for each row execute function public.finish_password_change();
alter publication supabase_realtime add table public.user_states;
