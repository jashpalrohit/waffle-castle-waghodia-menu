#!/usr/bin/env python3
"""Turn the daily stock register (Inventory--2026.xlsx) into inventory/import-excel.sql.

The workbook has one sheet per month. Each row is a material (Category, Vendor, Material Name)
and each day has five columns: Opening Stock, Stock purchased, Wastage, Closing stock,
Actual Consumption.

The generated SQL creates the suppliers and items (skipping ones that already exist by name) and
replays every day as stock movements tagged source = 'import':
  • the first day's opening stock → 'in' (Opening stock)
  • Stock purchased               → 'in'
  • Wastage                       → 'waste'
  • consumption                   → 'out' = previous stock + purchased − wastage − closing
                                    (a negative result, i.e. more on the shelf than expected, → 'adjust')
  • a closing count with nothing used   → 'count' (qty 0; marks the day as counted)
  • a typed month opening that differs from the previous month's closing → 'adjust'
so each item's stock in the app ends at the last closing stock in the sheet.
Opening stock and Actual Consumption are formulas in the sheet, so only the first opening,
purchases, wastage and closing counts are used; days without a closing count record no usage.

Only the Python standard library is used (an .xlsx file is a zip of XML).

Usage:  python3 excel_to_sql.py "/path/to/Inventory--2026.xlsx" [output.sql]
"""
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
          'September', 'October', 'November', 'December']

# Tidy the sheet's category spellings; rows without a category are the cold drinks at the top.
CATEGORY_FIX = {'': 'Beverages', 'Groccery': 'Grocery', 'Spreds': 'Spreads', 'Stationary': 'Stationery'}
# The sheet has no units. Liquids are litres; premixes, spreads and toppings are weighed (kg);
# anything else ever counted in fractions is kg, the rest pieces.
LIQUID = re.compile(r'\b(milk(?!\s*choco)|oil|honey|syrup|whipped cream|coffee shot|fanta|limca|ice cream)\b', re.I)
WEIGHED = {'Premix', 'Spreads', 'Topping'}
PACK = re.compile(r'\(\s*\d+\s*pcs\s*\)', re.I)


def col_number(letters):
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


def read_workbook(path):
    """Return {sheet name: {(row, col): value}} with shared strings resolved."""
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(M + 'si'):
            shared.append(''.join(t.text or '' for t in si.iter(M + 't')))
    targets = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    sheets = {}
    for sh in ET.fromstring(z.read('xl/workbook.xml')).find(M + 'sheets'):
        target = targets[sh.get(R + 'id')].lstrip('/')
        root = ET.fromstring(z.read(target if target.startswith('xl/') else 'xl/' + target))
        grid = {}
        for c in root.iter(M + 'c'):
            v, t = c.find(M + 'v'), c.get('t')
            if t == 'inlineStr':
                val = ''.join(x.text or '' for x in c.iter(M + 't'))
            else:
                val = v.text if v is not None else None
                if val is not None and t == 's':
                    val = shared[int(val)]
            if val not in (None, ''):
                m = re.match(r'([A-Z]+)(\d+)', c.get('r'))
                grid[(int(m.group(2)), col_number(m.group(1)))] = val
        sheets[sh.get('name')] = grid
    return sheets


def num(x):
    try:
        return round(float(x), 4)
    except (TypeError, ValueError):
        return None


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def main(src, out):
    sheets = read_workbook(src)
    items = {}      # name -> {category, vendor, values seen}
    days = []       # (date, {name: (open, purchased, waste, close, consumption)})
    for sheet_name, g in sheets.items():
        m = re.match(r'([A-Za-z]+)\s+(\d{4})$', sheet_name.strip())
        if not m or m.group(1).capitalize() not in MONTHS:
            continue                                   # e.g. "Sheet1" scratch sheet
        month, year = MONTHS.index(m.group(1).capitalize()) + 1, int(m.group(2))
        if g.get((1, 3), '').strip().lower() != 'material name':
            continue
        rows, category, row_of = sorted({r for r, _ in g if r >= 3}), '', {}   # row_of: this sheet's rows
        for r in rows:
            if (r, 3) not in g:
                continue
            if (r, 1) in g:
                category = g[(r, 1)].strip()
            name = re.sub(r'\s+', ' ', g[(r, 3)]).strip()
            items.setdefault(name, {'category': CATEGORY_FIX.get(category, category),
                                    'vendor': (g.get((r, 2)) or '').strip(), 'values': []})
            row_of[name] = r
        for day in range(31):
            try:
                d = date(year, month, day + 1)
            except ValueError:
                break
            c0, vals = 4 + day * 5, {}
            for name, r in row_of.items():
                it = items[name]
                v = tuple(num(g.get((r, c0 + k))) for k in range(5))
                if any(x not in (None, 0) for x in v[1:3]) or v[3] is not None or (v[4] or 0) != 0:
                    vals[name] = v
                    it['values'].extend(x for x in v if x is not None)
            if vals:
                days.append((d, vals))

    # Only months that were actually counted: drop days after the last day with any closing stock,
    # except days that still carry a consumption or purchase entry (the sheet's future months are
    # templates with a few stray numbers, so stop at the last day that has a closing count + 7 days).
    last_close = max(d for d, vals in days if any(v[3] is not None for v in vals.values()))
    days = [(d, vals) for d, vals in sorted(days) if (d - last_close).days <= 7]

    # In the register only Closing stock, Stock purchased and Wastage are typed in; Opening stock and
    # Actual Consumption are formulas (opening = previous closing, consumption = the difference). So:
    #   • usage is recorded only on days that have a closing count (a blank closing makes the sheet's
    #     formula show the whole opening as "consumption", which is not real);
    #   • openings are ignored except the very first one and a typed carry-over on the 1st of a month
    #     that differs from the previous closing (recorded as a correction).
    moves, running = [], {}
    for d, vals in days:
        for name, (o, p, w, c, cons) in vals.items():
            prev = running.get(name)
            if prev is None:
                if o:
                    moves.append((name, 'in', o, d, 'Opening stock (Excel register)'))
                prev = o or 0
            elif d.day == 1 and o is not None and abs(o - prev) > 1e-9:
                moves.append((name, 'adjust', round(o - prev, 4), d, 'Month opening differs from previous closing (Excel)'))
                prev = o
            if p:
                moves.append((name, 'in', p, d, 'Stock purchased (Excel)'))
            if w:
                moves.append((name, 'waste', w, d, 'Wastage (Excel)'))
            expected = round(prev + (p or 0) - (w or 0), 4)
            if c is not None:
                used = round(expected - c, 4)
                if used > 0:
                    moves.append((name, 'out', used, d, 'Consumption (Excel)'))
                elif used < 0:
                    moves.append((name, 'adjust', -used, d, 'Closing stock higher than expected (Excel)'))
                else:
                    moves.append((name, 'count', 0, d, 'Counted, no change (Excel)'))
                running[name] = c
            else:
                running[name] = expected

    def unit(name, it):
        if PACK.search(name):
            return 'pack'
        if LIQUID.search(name):
            return 'L'
        if it['category'] in WEIGHED:
            return 'kg'
        return 'kg' if any(abs(v - round(v)) > 1e-9 for v in it['values']) else 'pcs'

    vendors = sorted({it['vendor'] for it in items.values() if it['vendor']})
    lines = [
        '-- ============================================================',
        f'-- Generated by inventory/tools/excel_to_sql.py from {Path(src).name}',
        f'-- {len(items)} items, {len(vendors)} suppliers, {len(moves)} stock movements '
        f'({days[0][0]} to {days[-1][0]}).',
        '-- Run AFTER schema.sql, in Supabase → SQL Editor. Safe to re-run: previously imported',
        "-- movements (source = 'import') are replaced; items and suppliers are matched by name.",
        '-- Units are a best guess (the sheet has none) — check them on the Stock tab.',
        '-- ============================================================',
        'begin;',
        '',
        '-- Suppliers',
        'insert into public.inv_suppliers (name, note)',
        'select v.name, \'Imported from the Excel register\' from (values',
        ',\n'.join(f'  ({q(v)})' for v in vendors),
        ') as v(name)',
        'where not exists (select 1 from public.inv_suppliers s where lower(s.name) = lower(v.name));',
        '',
        '-- Items (min stock left at 0: set it per item on the Stock tab to get low-stock alerts)',
        'insert into public.inv_items (name, category, unit, supplier_id)',
        'select v.name, v.category, v.unit, (select s.id from public.inv_suppliers s where lower(s.name) = lower(v.vendor) limit 1)',
        'from (values',
        ',\n'.join(f'  ({q(n)}, {q(it["category"])}, {q(unit(n, it))}, {q(it["vendor"])})' for n, it in items.items()),
        ') as v(name, category, unit, vendor)',
        'where not exists (select 1 from public.inv_items i where lower(i.name) = lower(v.name));',
        '',
        '-- Stock movements, replayed day by day',
        "delete from public.inv_moves where source = 'import';",
        'insert into public.inv_moves (item_id, kind, qty, supplier_id, moved_on, note, source)',
        "select i.id, v.kind, v.qty, case when v.kind = 'in' then i.supplier_id end, v.day::date, v.note, 'import'",
        'from (values',
        ',\n'.join(f'  ({q(n)}, {q(k)}, {qty}, {q(d.isoformat())}, {q(note)})' for n, k, qty, d, note in moves),
        ') as v(item, kind, qty, day, note)',
        'join public.inv_items i on lower(i.name) = lower(v.item);',
        '',
        'commit;',
        '',
    ]
    Path(out).write_text('\n'.join(lines), encoding='utf-8')

    # Summary for the person running it
    final = {n: running.get(n, 0) for n in items}
    print(f'{len(items)} items, {len(vendors)} suppliers ({", ".join(vendors)}), {len(moves)} movements, '
          f'{days[0][0]} → {days[-1][0]}; written to {out}')
    by_unit = {}
    for n, it in items.items():
        by_unit.setdefault(unit(n, it), []).append(n)
    for u, names in sorted(by_unit.items()):
        print(f'  {u:4} ({len(names)}): {", ".join(names)}')
    return final


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else str(Path(__file__).resolve().parent.parent / 'import-excel.sql'))
