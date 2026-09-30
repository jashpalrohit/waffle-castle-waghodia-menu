-- ============================================================
-- Sample inventory: 2 suppliers, 6 items and 4 weeks of purchases / usage.
-- Run AFTER schema.sql, in Supabase → SQL Editor. Safe to re-run (replaces the sample).
-- To remove it later, run only the two DELETE lines below.
-- Sample rows are marked with "(SAMPLE)" in their name.
-- ============================================================

delete from public.inv_items     where name like '% (SAMPLE)';   -- also removes their stock moves
delete from public.inv_suppliers where name like '% (SAMPLE)';

insert into public.inv_suppliers (name, phone, note) values
  ('Amul Dairy Point (SAMPLE)',         '+91 90000 10001', 'Milk, cream, ice cream — daily delivery'),
  ('Vadodara Bakery Supplies (SAMPLE)', '+91 90000 10002', 'Waffle mix, chocolate, packaging');

insert into public.inv_items (name, category, unit, min_stock, supplier_id)
select v.name, v.category, v.unit, v.min_stock, s.id
from (values
  ('Waffle mix (SAMPLE)',        'Bakery mix',         'kg',   10, 'Vadodara Bakery Supplies (SAMPLE)'),
  ('Belgian chocolate (SAMPLE)', 'Chocolate & sauces', 'kg',    3, 'Vadodara Bakery Supplies (SAMPLE)'),
  ('Full cream milk (SAMPLE)',   'Dairy',              'L',     8, 'Amul Dairy Point (SAMPLE)'),
  ('Vanilla ice cream (SAMPLE)', 'Dairy',              'L',     4, 'Amul Dairy Point (SAMPLE)'),
  ('Waffle boxes (SAMPLE)',      'Packaging',          'pcs', 100, 'Vadodara Bakery Supplies (SAMPLE)'),
  ('Shake cups 400ml (SAMPLE)',  'Packaging',          'pcs', 100, 'Vadodara Bakery Supplies (SAMPLE)')
) as v(name, category, unit, min_stock, supplier)
join public.inv_suppliers s on s.name = v.supplier;

-- Stock movements: (item, kind, qty, ₹ per unit, days ago, note). Purchases use the item's usual supplier.
insert into public.inv_moves (item_id, kind, qty, unit_cost, supplier_id, moved_on, note)
select i.id, m.kind, m.qty, m.cost, case when m.kind = 'in' then i.supplier_id end,
       (now() at time zone 'Asia/Kolkata')::date - m.ago, m.note
from (values
  ('Waffle mix (SAMPLE)',        'in',     25,  180.00, 27, 'Monthly stock'),
  ('Waffle mix (SAMPLE)',        'out',     9,  null,   20, 'Week 1 usage'),
  ('Waffle mix (SAMPLE)',        'in',     10,  185.00, 13, 'Top-up'),
  ('Waffle mix (SAMPLE)',        'out',    18,  null,    6, 'Week 2–3 usage'),
  ('Belgian chocolate (SAMPLE)', 'in',      8,  720.00, 27, 'Monthly stock'),
  ('Belgian chocolate (SAMPLE)', 'out',     3,  null,   20, 'Week 1 usage'),
  ('Belgian chocolate (SAMPLE)', 'out',   3.5,  null,    6, 'Week 2–3 usage'),
  ('Full cream milk (SAMPLE)',   'in',     30,   64.00, 27, 'Monthly stock'),
  ('Full cream milk (SAMPLE)',   'out',    14,  null,   20, 'Week 1 usage'),
  ('Full cream milk (SAMPLE)',   'in',     20,   66.00, 13, 'Top-up'),
  ('Full cream milk (SAMPLE)',   'out',    26,  null,    6, 'Week 2–3 usage'),
  ('Full cream milk (SAMPLE)',   'waste',   2,  null,    4, 'Spoiled'),
  ('Vanilla ice cream (SAMPLE)', 'in',     12,  240.00, 27, 'Monthly stock'),
  ('Vanilla ice cream (SAMPLE)', 'out',     5,  null,   20, 'Week 1 usage'),
  ('Vanilla ice cream (SAMPLE)', 'in',      6,  245.00, 13, 'Top-up'),
  ('Vanilla ice cream (SAMPLE)', 'out',     9,  null,    6, 'Week 2–3 usage'),
  ('Vanilla ice cream (SAMPLE)', 'waste',   1,  null,    4, 'Melted — freezer door left open'),
  ('Waffle boxes (SAMPLE)',      'in',    500,    6.50, 27, 'Monthly stock'),
  ('Waffle boxes (SAMPLE)',      'out',   210,  null,   20, 'Week 1 usage'),
  ('Waffle boxes (SAMPLE)',      'out',   230,  null,    6, 'Week 2–3 usage'),
  ('Shake cups 400ml (SAMPLE)',  'in',    500,    4.20, 27, 'Monthly stock'),
  ('Shake cups 400ml (SAMPLE)',  'out',   180,  null,   20, 'Week 1 usage'),
  ('Shake cups 400ml (SAMPLE)',  'out',   190,  null,    6, 'Week 2–3 usage'),
  ('Shake cups 400ml (SAMPLE)',  'adjust', -5,  null,    1, 'Stock count: 5 cups damaged')
) as m(item, kind, qty, cost, ago, note)
join public.inv_items i on i.name = m.item;
