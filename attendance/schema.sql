-- ============================================================
-- Waffle Castle — Staff attendance (punch in / punch out)
-- Run once in Supabase → SQL Editor → New query → Run.
-- Safe to re-run: every statement is idempotent.
--
-- Who can do what:
--   • Anyone with the page (the counter kiosk) can only call kiosk_staff()
--     and kiosk_punch(); a correct PIN is required to punch.
--   • Anyone can call att_presence() — Present / Absent per day only, never punch times.
--   • Only the owner account (same login as the menu) can read or edit
--     the staff and attendance tables (incl. Aadhaar, address, salary).
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.staff (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  role            text not null default '',
  phone           text not null default '',
  pin_hash        text not null,
  active          boolean not null default true,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now()
);
-- Staff profile fields (added after the first version — safe on an existing table)
alter table public.staff add column if not exists shift       text not null default '';   -- 'morning' | 'evening' | 'full' | ''
alter table public.staff add column if not exists shift_start time;
alter table public.staff add column if not exists shift_end   time;
alter table public.staff add column if not exists aadhaar     text not null default '';   -- 12 digits
alter table public.staff add column if not exists address     text not null default '';
alter table public.staff add column if not exists salary      numeric(10,2);              -- monthly, ₹
alter table public.staff add column if not exists joined_on   date;                       -- absences count from this day
alter table public.staff add column if not exists work_days   smallint[] not null default '{1,2,3,4,5,6,7}';  -- ISO weekdays, 1 = Mon … 7 = Sun; other days are a weekly holiday
update public.staff set joined_on = (created_at at time zone 'Asia/Kolkata')::date where joined_on is null;
alter table public.staff alter column joined_on set default ((now() at time zone 'Asia/Kolkata')::date);
alter table public.staff alter column joined_on set not null;
alter table public.staff drop constraint if exists staff_shift_check;
alter table public.staff add constraint staff_shift_check check (shift in ('', 'morning', 'evening', 'full'));
alter table public.staff drop constraint if exists staff_aadhaar_check;
alter table public.staff add constraint staff_aadhaar_check check (aadhaar = '' or aadhaar ~ '^[0-9]{12}$');
alter table public.staff drop constraint if exists staff_work_days_check;
alter table public.staff add constraint staff_work_days_check
  check (cardinality(work_days) between 1 and 7 and work_days <@ '{1,2,3,4,5,6,7}'::smallint[]);
alter table public.staff drop constraint if exists staff_salary_check;
alter table public.staff add constraint staff_salary_check check (salary is null or salary >= 0);

create table if not exists public.attendance (
  id         bigint generated always as identity primary key,
  staff_id   uuid not null references public.staff(id) on delete cascade,
  punch_in   timestamptz not null default now(),
  punch_out  timestamptz,
  note       text not null default '',
  created_at timestamptz not null default now(),
  constraint attendance_out_after_in check (punch_out is null or punch_out >= punch_in)
);
create index if not exists attendance_punch_in_idx on public.attendance (punch_in);
create index if not exists attendance_staff_in_idx on public.attendance (staff_id, punch_in);
-- Open (not yet punched-out) shifts. A shift left open for more than 16 hours is treated as a
-- forgotten punch out: it stays open (flagged in the calendar for the owner to fix) and the
-- staff member's next punch starts a new shift instead of closing the old one.
drop index if exists public.attendance_one_open_shift;
create index if not exists attendance_open_idx on public.attendance (staff_id, punch_in) where punch_out is null;

-- ---- Owner check (the same account that edits the menu) ----
create or replace function public.att_is_owner() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'jashpalrohit002@gmail.com'
$$;

-- ---- Row Level Security: owner only; the kiosk goes through the functions below ----
alter table public.staff enable row level security;
alter table public.attendance enable row level security;
revoke all on public.staff, public.attendance from anon;

drop policy if exists staff_owner_all on public.staff;
create policy staff_owner_all on public.staff for all to authenticated
  using (public.att_is_owner()) with check (public.att_is_owner());

drop policy if exists attendance_owner_all on public.attendance;
create policy attendance_owner_all on public.attendance for all to authenticated
  using (public.att_is_owner()) with check (public.att_is_owner());

-- ---- Owner: add / edit a staff member (hashes the PIN server-side) ----
-- p_id null → new staff. p_data holds the profile fields. p_pin blank on edit → keep the current PIN.
drop function if exists public.att_save_staff(uuid, text, text, text, boolean, text);
create or replace function public.att_save_staff(p_id uuid, p_data jsonb, p_pin text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id      uuid;
  v_pin     text    := btrim(coalesce(p_pin, ''));
  v_name    text    := btrim(coalesce(p_data ->> 'name', ''));
  v_role    text    := btrim(coalesce(p_data ->> 'role', ''));
  v_phone   text    := btrim(coalesce(p_data ->> 'phone', ''));
  v_shift   text    := coalesce(p_data ->> 'shift', '');
  v_start   time    := nullif(p_data ->> 'shift_start', '')::time;
  v_end     time    := nullif(p_data ->> 'shift_end', '')::time;
  v_aadhaar text    := regexp_replace(coalesce(p_data ->> 'aadhaar', ''), '[^0-9]', '', 'g');
  v_address text    := btrim(coalesce(p_data ->> 'address', ''));
  v_salary  numeric := nullif(p_data ->> 'salary', '')::numeric;
  v_joined  date    := coalesce(nullif(p_data ->> 'joined_on', '')::date, (now() at time zone 'Asia/Kolkata')::date);
  v_active  boolean := coalesce((p_data ->> 'active')::boolean, true);
  v_days    smallint[] := coalesce(
              (select array_agg(distinct d::smallint order by d::smallint) from jsonb_array_elements_text(p_data -> 'work_days') d),
              '{1,2,3,4,5,6,7}');
begin
  if not public.att_is_owner() then raise exception 'Only the owner can manage staff' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'Name is required'; end if;
  if v_pin <> '' and v_pin !~ '^[0-9]{4,6}$' then raise exception 'PIN must be 4 to 6 digits'; end if;
  if v_shift not in ('', 'morning', 'evening', 'full') then raise exception 'Shift must be Morning, Evening or Full time'; end if;
  if v_aadhaar <> '' and length(v_aadhaar) <> 12 then raise exception 'Aadhaar number must be 12 digits'; end if;
  if v_salary is not null and v_salary < 0 then raise exception 'Salary cannot be negative'; end if;
  if not (v_days <@ '{1,2,3,4,5,6,7}'::smallint[]) then raise exception 'Working days must be Mon to Sun'; end if;

  if p_id is null then
    if v_pin = '' then raise exception 'Set a PIN for the new staff member'; end if;
    insert into public.staff (name, role, phone, active, shift, shift_start, shift_end, aadhaar, address, salary, joined_on, work_days, pin_hash)
    values (v_name, v_role, v_phone, v_active, v_shift, v_start, v_end, v_aadhaar, v_address, v_salary, v_joined, v_days,
            extensions.crypt(v_pin, extensions.gen_salt('bf')))
    returning id into v_id;
  else
    update public.staff set
      name = v_name, role = v_role, phone = v_phone, active = v_active,
      shift = v_shift, shift_start = v_start, shift_end = v_end,
      aadhaar = v_aadhaar, address = v_address, salary = v_salary, joined_on = v_joined, work_days = v_days,
      pin_hash = case when v_pin <> '' then extensions.crypt(v_pin, extensions.gen_salt('bf')) else pin_hash end,
      failed_attempts = case when v_pin <> '' then 0 else failed_attempts end,
      locked_until = case when v_pin <> '' then null else locked_until end
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Staff member not found'; end if;
  end if;
  return v_id;
end $$;

-- ---- Public calendar: Present / Absent / Holiday only (no punch times, no personal details) ----
-- Returns the staff list and the days (Asia/Kolkata) each person punched in, for p_from..p_to inclusive.
-- Nothing before a person's joining date is returned: staff who join after p_to are left out
-- entirely, and punches dated before joined_on are ignored.
create or replace function public.att_presence(p_from date, p_to date) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'staff', coalesce((select json_agg(json_build_object(
                 'id', s.id, 'name', s.name, 'role', s.role, 'shift', s.shift,
                 'active', s.active, 'joined_on', s.joined_on, 'work_days', s.work_days) order by lower(s.name))
               from public.staff s where s.joined_on <= p_to), '[]'::json),
    'days',  coalesce((select json_agg(json_build_object('s', x.staff_id, 'd', x.d))
               from (select distinct a.staff_id, (a.punch_in at time zone 'Asia/Kolkata')::date as d
                     from public.attendance a
                     join public.staff s on s.id = a.staff_id
                     where a.punch_in >= (p_from::timestamp at time zone 'Asia/Kolkata')
                       and a.punch_in <  ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
                       and (a.punch_in at time zone 'Asia/Kolkata')::date >= s.joined_on) x), '[]'::json))
  where p_to >= p_from and p_to - p_from <= 370
$$;

-- ---- Kiosk: list active staff and whether each is currently punched in ----
drop function if exists public.kiosk_staff();
create or replace function public.kiosk_staff()
returns table (id uuid, name text, role text, shift text, shift_start time, open_since timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.role, s.shift, s.shift_start,
    (select max(a.punch_in) from public.attendance a
      where a.staff_id = s.id and a.punch_out is null and a.punch_in > now() - interval '16 hours')
  from public.staff s
  where s.active
  order by lower(s.name)
$$;

-- ---- Kiosk: punch in or out (toggles) after checking the PIN ----
-- Returns JSON instead of raising, so the failed-attempt counter is not rolled back.
-- 5 wrong PINs lock that staff member for 5 minutes.
create or replace function public.kiosk_punch(p_staff uuid, p_pin text)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  s public.staff;
  v_open public.attendance;
  v_now timestamptz := now();
begin
  select * into s from public.staff where id = p_staff and active for update;
  if not found then return json_build_object('ok', false, 'error', 'Staff member not found'); end if;

  if s.locked_until is not null and s.locked_until > v_now then
    return json_build_object('ok', false, 'error',
      'Too many wrong PINs. Try again in ' || ceil(extract(epoch from s.locked_until - v_now) / 60)::int || ' min');
  end if;

  if extensions.crypt(coalesce(p_pin, ''), s.pin_hash) <> s.pin_hash then
    update public.staff set
      failed_attempts = case when s.failed_attempts + 1 >= 5 then 0 else s.failed_attempts + 1 end,
      locked_until    = case when s.failed_attempts + 1 >= 5 then v_now + interval '5 minutes' else null end
    where id = s.id;
    return json_build_object('ok', false, 'error',
      case when s.failed_attempts + 1 >= 5 then 'Too many wrong PINs. Locked for 5 min'
           when s.failed_attempts + 1 = 4 then 'Wrong PIN (1 try left)'
           else 'Wrong PIN (' || (5 - s.failed_attempts - 1) || ' tries left)' end);
  end if;

  if s.failed_attempts <> 0 or s.locked_until is not null then
    update public.staff set failed_attempts = 0, locked_until = null where id = s.id;
  end if;

  select * into v_open from public.attendance
  where staff_id = s.id and punch_out is null and punch_in > v_now - interval '16 hours'
  order by punch_in desc limit 1;
  if found then
    if v_now - v_open.punch_in < interval '1 minute' then
      return json_build_object('ok', false, 'error', 'You just punched in. Wait a minute to punch out.');
    end if;
    update public.attendance set punch_out = v_now where id = v_open.id;
    return json_build_object('ok', true, 'action', 'out', 'name', s.name, 'at', v_now, 'since', v_open.punch_in);
  end if;

  insert into public.attendance (staff_id, punch_in) values (s.id, v_now);
  return json_build_object('ok', true, 'action', 'in', 'name', s.name, 'at', v_now);
end $$;

-- ---- Function permissions ----
revoke all on function public.att_save_staff(uuid, jsonb, text) from public, anon;
revoke all on function public.att_presence(date, date) from public;
revoke all on function public.kiosk_staff() from public;
revoke all on function public.kiosk_punch(uuid, text) from public;
grant execute on function public.att_save_staff(uuid, jsonb, text) to authenticated;
grant execute on function public.att_presence(date, date) to anon, authenticated;
grant execute on function public.kiosk_staff() to anon, authenticated;
grant execute on function public.kiosk_punch(uuid, text) to anon, authenticated;
