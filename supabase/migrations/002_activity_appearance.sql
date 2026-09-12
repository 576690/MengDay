-- MengDay 1.1: apply AFTER 001. Safe to rerun; preserves all existing records.
begin;
create or replace function public.validate_mengday(d jsonb) returns void language plpgsql set search_path=public as $$
declare a jsonb; e jsonb; s numeric; ending numeric; previous_end numeric := -1; active_count int:=0;
begin
  if jsonb_typeof(d->'activities') is distinct from 'array' or jsonb_typeof(d->'entries') is distinct from 'array'
    or jsonb_typeof(d->'settings') is distinct from 'object' then raise exception 'Invalid data structure'; end if;
  if jsonb_array_length(d->'activities')>1000 or jsonb_array_length(d->'entries')>100000 or octet_length(d::text)>12000000 then raise exception 'Data exceeds limits'; end if;
  if coalesce(d->'settings'->>'theme','') not in ('light','dark','system') or not exists(select 1 from pg_timezone_names where name=d->'settings'->>'timezone') then raise exception 'Invalid settings'; end if;
  for a in select value from jsonb_array_elements(d->'activities') loop
    if jsonb_typeof(a->'id') is distinct from 'string' or jsonb_typeof(a->'name') is distinct from 'string'
      or coalesce(a->>'id','')='' or coalesce(length(trim(a->>'name')),0) not between 1 and 80
      or coalesce(a->>'color','') !~ '^#[0-9a-fA-F]{6}$' or coalesce(a->>'icon','') not in ('BriefcaseBusiness','BookOpen','Dumbbell','Coffee','Headphones','Moon','Code2','Heart','Pencil','Bike','Leaf','Music','Circle','Square','Triangle','Diamond','Star','Sun','Home','Laptop','GraduationCap','Utensils','ShoppingBag','Car','TrainFront','Plane','Camera','Palette','Gamepad2','BedDouble','Flower2','Mountain','Dog','Baby','Users','CookingPot','None')
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


commit;
