-- ============================================================
-- Sample data: ONE staff member + the last 4 weeks of attendance.
-- Run AFTER schema.sql, in Supabase → SQL Editor. Safe to re-run (replaces the sample).
-- To remove it later, run only the DELETE line below.
--
--   Name: Ravi Patel (SAMPLE) · Waffle chef · Morning 11:00–17:00 · PIN 1234
--   Works Mon–Sat; Sunday is his weekly holiday. Over the last 27 days he worked every
--   working day except every other Wednesday (absent), so the calendar shows
--   Present, Absent and Holiday days.
-- ============================================================

delete from public.staff where name = 'Ravi Patel (SAMPLE)';   -- also removes their attendance

with ist as (select (now() at time zone 'Asia/Kolkata')::date as today),
s as (
  insert into public.staff (name, role, phone, shift, shift_start, shift_end, aadhaar, address, salary, joined_on, work_days, pin_hash)
  select 'Ravi Patel (SAMPLE)', 'Waffle chef', '+91 90000 00001', 'morning', '11:00', '17:00',
         '123412341234', 'Waghodia Road, Vadodara', 12000, today - 27, '{1,2,3,4,5,6}',
         extensions.crypt('1234', extensions.gen_salt('bf'))
  from ist
  returning id
)
insert into public.attendance (staff_id, punch_in, punch_out)
select s.id,
       (d::date + time '10:52' + ((extract(day from d)::int * 7) % 16) * interval '1 minute') at time zone 'Asia/Kolkata',
       (d::date + time '17:02' + ((extract(day from d)::int * 5) % 21) * interval '1 minute') at time zone 'Asia/Kolkata'
from s, ist, generate_series(ist.today - 27, ist.today - 1, interval '1 day') as d
where extract(isodow from d) <> 7                                   -- Sunday: weekly holiday
  and not (extract(isodow from d) = 3 and extract(week from d)::int % 2 = 0);   -- every other Wednesday: Absent
