-- ============================================================
-- Waffle Castle — Inventory (raw materials & supplies)
-- Run once in Supabase → SQL Editor → New query → Run.
-- Safe to re-run: every statement is idempotent.
--
-- Owner only: every table is readable and writable only by the owner account
-- (the same login as the menu and attendance). Nothing here is public.
--
--   inv_suppliers  who you buy from
--   inv_items      each raw material: unit, minimum level, current stock
--   inv_moves      every stock change: in (purchase), out (used), waste, adjust (stock count),
--                  count (a daily count that matched — qty 0, changes nothing, marks the item as counted).
--                  source: 'manual' (single entry), 'daily' (Daily count sheet), 'import' (from the Excel register),
--                  'orders' (packaging / items used, worked out from Petpooja orders)
--
-- inv_items.stock and inv_items.last_cost are kept up to date automatically from inv_moves.
-- ============================================================

create table if not exists public.inv_suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null default '',
  note       text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.inv_items (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  category   text not null default '',
  unit       text not null default 'pcs',          -- kg, g, L, ml, pcs, pack, box, dozen …
  min_stock  numeric(14,4) not null default 0,     -- low-stock alert below this
  stock      numeric(14,4) not null default 0,     -- maintained from inv_moves
  last_cost  numeric(12,2),                        -- price per unit of the latest purchase, maintained from inv_moves
  supplier_id uuid references public.inv_suppliers(id) on delete set null,   -- usual supplier
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint inv_items_min_check check (min_stock >= 0)
);

create table if not exists public.inv_moves (
  id          bigint generated always as identity primary key,
  item_id     uuid not null references public.inv_items(id) on delete cascade,
  kind        text not null,                        -- 'in' | 'out' | 'waste' | 'adjust' | 'count'
  qty         numeric(14,4) not null,               -- > 0, except 'adjust' which is the signed correction
  unit_cost   numeric(12,2),                        -- ₹ per unit, purchases only
  supplier_id uuid references public.inv_suppliers(id) on delete set null,
  moved_on    date not null default ((now() at time zone 'Asia/Kolkata')::date),
  note        text not null default '',
  created_at  timestamptz not null default now(),
  constraint inv_moves_kind_check check (kind in ('in', 'out', 'waste', 'adjust', 'count')),
  constraint inv_moves_qty_check  check ((kind = 'count' and qty = 0) or (kind = 'adjust' and qty <> 0) or (kind in ('in', 'out', 'waste') and qty > 0)),
  constraint inv_moves_cost_check check (unit_cost is null or unit_cost >= 0)
);
-- quantities are kept to 4 decimals (the register records e.g. 0.0187 kg)
alter table public.inv_items alter column min_stock type numeric(14,4);
alter table public.inv_items alter column stock     type numeric(14,4);
alter table public.inv_moves alter column qty       type numeric(14,4);
alter table public.inv_moves drop constraint if exists inv_moves_kind_check;
alter table public.inv_moves add constraint inv_moves_kind_check check (kind in ('in', 'out', 'waste', 'adjust', 'count'));
alter table public.inv_moves drop constraint if exists inv_moves_qty_check;
alter table public.inv_moves add constraint inv_moves_qty_check check (
  (kind = 'count' and qty = 0) or (kind = 'adjust' and qty <> 0) or (kind in ('in', 'out', 'waste') and qty > 0));
alter table public.inv_moves add column if not exists source text not null default 'manual';
alter table public.inv_moves drop constraint if exists inv_moves_source_check;
alter table public.inv_moves add constraint inv_moves_source_check check (source in ('manual', 'daily', 'import', 'orders'));
create index if not exists inv_moves_item_idx on public.inv_moves (item_id, moved_on);
create index if not exists inv_moves_day_idx  on public.inv_moves (moved_on);

-- ---- Keep inv_items.stock / last_cost in step with inv_moves ----
create or replace function public.inv_refresh_item(p_item uuid) returns void
language sql set search_path = '' as $$
  update public.inv_items i set
    stock = coalesce((select sum(case m.kind when 'in' then m.qty when 'adjust' then m.qty when 'count' then 0 else -m.qty end)
                      from public.inv_moves m where m.item_id = p_item), 0),
    last_cost = (select m.unit_cost from public.inv_moves m
                 where m.item_id = p_item and m.kind = 'in' and m.unit_cost is not null
                 order by m.moved_on desc, m.id desc limit 1)
  where i.id = p_item
$$;

create or replace function public.inv_moves_changed() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then perform public.inv_refresh_item(new.item_id); end if;
  if tg_op in ('DELETE', 'UPDATE') and (tg_op = 'DELETE' or old.item_id <> new.item_id) then
    perform public.inv_refresh_item(old.item_id);
  end if;
  return null;
end $$;

drop trigger if exists inv_moves_changed on public.inv_moves;
create trigger inv_moves_changed after insert or update or delete on public.inv_moves
  for each row execute function public.inv_moves_changed();

-- ---- Owner check (the same account that edits the menu) ----
create or replace function public.inv_is_owner() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'jashpalrohit002@gmail.com'
$$;

-- ---- Row Level Security: owner only ----
alter table public.inv_suppliers enable row level security;
alter table public.inv_items     enable row level security;
alter table public.inv_moves     enable row level security;
revoke all on public.inv_suppliers, public.inv_items, public.inv_moves from anon;

drop policy if exists inv_suppliers_owner on public.inv_suppliers;
create policy inv_suppliers_owner on public.inv_suppliers for all to authenticated
  using (public.inv_is_owner()) with check (public.inv_is_owner());

drop policy if exists inv_items_owner on public.inv_items;
create policy inv_items_owner on public.inv_items for all to authenticated
  using (public.inv_is_owner()) with check (public.inv_is_owner());

drop policy if exists inv_moves_owner on public.inv_moves;
create policy inv_moves_owner on public.inv_moves for all to authenticated
  using (public.inv_is_owner()) with check (public.inv_is_owner());

-- ---- Daily count: save one day of the register in a single step ----
-- p_rows: [{item_id, purchased, wastage, used, unit_cost}] — used = previous stock + purchased − wastage − closing,
-- worked out by the page (null when no closing count was entered). The day's earlier 'daily' entries for
-- each listed item — and any imported Excel entries for that item and day — are replaced, so saving the
-- same day again simply updates it.
create or replace function public.inv_save_day(p_day date, p_rows jsonb) returns int
language plpgsql set search_path = '' as $$
declare
  r jsonb; n int := 0;
  v_item uuid; v_p numeric; v_w numeric; v_used numeric; v_cost numeric; v_sup uuid;
begin
  if not public.inv_is_owner() then raise exception 'Only the owner can edit inventory' using errcode = '42501'; end if;
  if p_day > (now() at time zone 'Asia/Kolkata')::date then raise exception 'The date cannot be in the future'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_item := (r ->> 'item_id')::uuid;
    v_p    := nullif(r ->> 'purchased', '')::numeric;
    v_w    := nullif(r ->> 'wastage', '')::numeric;
    v_used := nullif(r ->> 'used', '')::numeric;
    v_cost := nullif(r ->> 'unit_cost', '')::numeric;
    if coalesce(v_p, 0) < 0 or coalesce(v_w, 0) < 0 then raise exception 'Purchased and wastage cannot be negative'; end if;
    select supplier_id into v_sup from public.inv_items where id = v_item;
    if not found then raise exception 'Item not found'; end if;
    delete from public.inv_moves where item_id = v_item and moved_on = p_day and source in ('daily', 'import');
    if v_p > 0 then
      insert into public.inv_moves (item_id, kind, qty, unit_cost, supplier_id, moved_on, note, source)
      values (v_item, 'in', v_p, v_cost, v_sup, p_day, 'Daily count: purchased', 'daily');
    end if;
    if v_w > 0 then
      insert into public.inv_moves (item_id, kind, qty, moved_on, note, source)
      values (v_item, 'waste', v_w, p_day, 'Daily count: wastage', 'daily');
    end if;
    if v_used > 0 then
      insert into public.inv_moves (item_id, kind, qty, moved_on, note, source)
      values (v_item, 'out', v_used, p_day, 'Daily count: consumption', 'daily');
    elsif v_used < 0 then
      insert into public.inv_moves (item_id, kind, qty, moved_on, note, source)
      values (v_item, 'adjust', -v_used, p_day, 'Daily count: closing higher than expected', 'daily');
    elsif v_used = 0 then   -- counted and nothing used: remember the count
      insert into public.inv_moves (item_id, kind, qty, moved_on, note, source)
      values (v_item, 'count', 0, p_day, 'Daily count: no change', 'daily');
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.inv_save_day(date, jsonb) from public, anon;
grant execute on function public.inv_save_day(date, jsonb) to authenticated;

-- ---- Usage from Petpooja orders: record one day in a single step ----
-- p_rows: [{item_id, qty}] — items used by that day's orders (packaging, water bottles …).
-- Replaces the day's earlier 'orders' entries, so recording the same day again simply updates it.
create or replace function public.inv_record_orders(p_day date, p_rows jsonb) returns int
language plpgsql set search_path = '' as $$
declare r jsonb; n int := 0; v_qty numeric;
begin
  if not public.inv_is_owner() then raise exception 'Only the owner can edit inventory' using errcode = '42501'; end if;
  if p_day > (now() at time zone 'Asia/Kolkata')::date then raise exception 'The date cannot be in the future'; end if;
  delete from public.inv_moves where moved_on = p_day and source = 'orders';
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_qty := (r ->> 'qty')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;
    insert into public.inv_moves (item_id, kind, qty, moved_on, note, source)
    values ((r ->> 'item_id')::uuid, 'out', v_qty, p_day, 'Used by Petpooja orders', 'orders');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.inv_record_orders(date, jsonb) from public, anon;
grant execute on function public.inv_record_orders(date, jsonb) to authenticated;
