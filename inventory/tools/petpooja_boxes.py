#!/usr/bin/env python3
"""Work out packaging used by orders from a Petpooja "Order Report" export (.xlsx).

ONLINE orders (Order Type "Delivery": Zomato, Swiggy, …)
  waffle        n waffles → n // 2 double boxes + (n % 2) single box, and 1 regular cone per waffle
                (1 → 1 single · 2 → 1 double · 3 → 1 double + 1 single …)
  mini pancake  1 pancake box + 2 forks each
  brownie bowl  1 bowl + 2 spoons each
  shake         1 glass with lid + 1 straw each
  long stick    1 waffle stick cover + 1 waffle stick tray each
  mini waffles  1 mini waffle box + 4 mini cones per pack of 4

OTHER orders (dine-in, pick-up, …)
  waffle        if the order has a waffle-box item billed → boxes as above + 1 cone per waffle;
                otherwise 1 regular cone per waffle only
  mini pancake, brownie bowl, shake, mini waffles — same as online
  long stick    1 waffle stick tray each (no cover)
  water bottle  1 Water Btl 500ml each (any order type)

Items are classified with the menu's categories (menu-data.js), falling back to their names:
  waffle        Signature Waffles
  mini waffles  Mini Waffles - Pack Of 4
  long stick    Long Waffle Sticks ("… LWS")
  mini pancake  Mini Pancakes ("… MPC …"), Mini Treat ("… (Mini Pancakes 4 Pcs)")
  brownie bowl  Royal Brownie Bowls (or any "… Bowl")
  shake         Chill Thrill Shakes, Creamy Coffee, Fizzy Expresso (or any "… Shake")
Anything else is listed as "not mapped" so nothing is silently ignored. Cancelled orders are skipped.
Customer names, phones and addresses in the export are never read or printed.

Usage:  python3 petpooja_boxes.py "/path/to/Order_Listing_….xlsx" [per-day.csv]
"""
import csv
import json
import re
import sys
from collections import Counter, OrderedDict, defaultdict
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from excel_to_sql import read_workbook   # same stdlib .xlsx reader

# Packaging, named exactly as the inventory items
DOUBLE, SINGLE, CONE = 'Waffle Box - Double', 'Waffle Box - Single', 'Waffle Pouch - Regular'
PANCAKE_BOX, FORK = 'Pan Cake Box', '140mm Fork'
BOWL, SPOON = 'Brownie Bowl', '140mm Spoon'
GLASS, STRAW = '300 Ml Glass With Lid ( With Printing )', 'Straw 10mm'
STICK_COVER, STICK_TRAY = 'Waffle Stick Cover', 'Waffle Stick Tray'
MINI_BOX, MINI_CONE = 'Mini Waffle Box (4 Pic)', 'Waffle Pouch - Small'   # mini cone = small waffle pouch
WATER = 'Water Btl 500ml'
PACKAGING = [DOUBLE, SINGLE, CONE, MINI_BOX, MINI_CONE, PANCAKE_BOX, FORK, BOWL, SPOON, GLASS, STRAW, STICK_COVER, STICK_TRAY, WATER]

CATEGORY_KIND = {
    'signature waffles': 'waffle', 'mini waffles - pack of 4': 'miniwaffle',
    'long waffle sticks': 'stick',
    'mini pancakes': 'pancake', 'mini treat': 'pancake',
    'royal brownie bowls': 'bowl',
    'chill thrill shakes': 'shake', 'creamy coffee': 'shake', 'fizzy expresso': 'shake',
}
BOX_ITEM = re.compile(r'^(single|double) waffle box$', re.I)
QTY = re.compile(r'^(.*?)\s*(?:[x×]\s*(\d+)|\((\d+)\))\s*$')   # "Item x 2" / "Item (2)" if Petpooja adds a count
norm = lambda s: re.sub(r'\s+', ' ', str(s)).strip().lower()


def load_menu_kinds():
    """Menu item name → kind, from ../../menu-data.js"""
    src = (HERE.parent.parent / 'menu-data.js').read_text(encoding='utf-8')
    menu = json.loads(src[src.index('{'):src.rindex('}') + 1])
    kinds = {}
    for c in menu['categories']:
        kind = CATEGORY_KIND.get(norm(c['category']))
        for it in c['items']:
            kinds.setdefault(norm(it['name']), kind)
    return kinds


def classify(name, menu_kinds):
    n = norm(name)
    if BOX_ITEM.match(n):
        return 'box'
    if menu_kinds.get(n):
        return menu_kinds[n]
    # name patterns (Petpooja names can differ slightly from the menu)
    if re.search(r'\bmpc\b|mini pancakes?', n):
        return 'pancake'
    if re.search(r'\blws\b', n):
        return 'stick'
    if re.search(r'^mini waffles\b.*pack of 4', n):
        return 'miniwaffle'
    if n.endswith(' waffle') and not re.search(r'cake|waff-?wich', n):
        return 'waffle'
    if n.endswith(' bowl') or n == 'brownie bowl':
        return 'bowl'
    if n.endswith(' shake'):
        return 'shake'
    if re.match(r'water (bottle|btl)\b', n):   # "Water Bottle (500 Ml)"
        return 'water'
    return None


def split_items(text):
    """'A, B x 2, C' → [('A', 1), ('B', 2), ('C', 1)]"""
    out = []
    for part in [p.strip() for p in str(text or '').split(',') if p.strip()]:
        m = QTY.match(part)
        if m and (m.group(2) or m.group(3)):
            out.append((m.group(1).strip(), int(m.group(2) or m.group(3))))
        else:
            out.append((part, 1))
    return out


def packaging_for(kinds, online, box_billed):
    """kinds: Counter of item kinds in one order → Counter of packaging items"""
    use = Counter()
    w = kinds['waffle']
    if w:
        if online or box_billed:
            use[DOUBLE] += w // 2
            use[SINGLE] += w % 2
        use[CONE] += w
    use[MINI_BOX] += kinds['miniwaffle']
    use[MINI_CONE] += 4 * kinds['miniwaffle']
    use[PANCAKE_BOX] += kinds['pancake']
    use[FORK] += 2 * kinds['pancake']
    use[BOWL] += kinds['bowl']
    use[SPOON] += 2 * kinds['bowl']
    use[GLASS] += kinds['shake']
    use[STRAW] += kinds['shake']
    use[STICK_TRAY] += kinds['stick']
    if online:
        use[STICK_COVER] += kinds['stick']
    use[WATER] += kinds['water']
    return +use   # drop zeros


def main(src, out_csv=None):
    menu_kinds = load_menu_kinds()
    sheet = next(iter(read_workbook(src).values()))
    header_row = next(r for (r, c), v in sorted(sheet.items()) if c == 1 and norm(v) == 'order no.')
    cols = {norm(v): c for (r, c), v in sheet.items() if r == header_row}
    missing = [n for n in ('order no.', 'order type', 'sub order type', 'items', 'status', 'created') if n not in cols]
    if missing:
        sys.exit(f'Export is missing columns: {missing}')

    per_day, orders, unmapped = OrderedDict(), [], Counter()
    for r in sorted({r for (r, _) in sheet if r > header_row}):
        get = lambda n: str(sheet.get((r, cols[n]), '')).strip()
        if not get('order no.') or 'cancel' in get('status').lower():
            continue
        day = datetime.strptime(get('created'), '%d %b %Y %H:%M:%S').date()
        online = norm(get('order type')).startswith('delivery')
        items = split_items(get('items'))
        kinds, box_billed = Counter(), False
        for name, q in items:
            k = classify(name, menu_kinds)
            if k == 'box':
                box_billed = True
            elif k:
                kinds[k] += q
            else:
                unmapped[name] += q
        use = packaging_for(kinds, online, box_billed)
        day_use = per_day.setdefault(day, {'online': 0, 'orders': 0, 'use': Counter()})
        day_use['orders'] += 1
        day_use['online'] += online
        day_use['use'].update(use)
        if use:
            orders.append((day, get('order no.'), get('sub order type') or get('order type'), online, box_billed, kinds, use))

    short = {DOUBLE: 'double box', SINGLE: 'single box', CONE: 'cone', MINI_BOX: 'mini waffle box', MINI_CONE: 'mini cone', PANCAKE_BOX: 'pancake box', FORK: 'fork',
             BOWL: 'bowl', SPOON: 'spoon', GLASS: 'glass+lid', STRAW: 'straw', STICK_COVER: 'stick cover', STICK_TRAY: 'stick tray', WATER: 'water bottle'}
    print('Packaging per order:')
    for day, no, typ, online, box_billed, kinds, use in orders:
        what = ', '.join(f'{v} {k}' for k, v in kinds.items() if v)
        tag = 'online' if online else ('box billed' if box_billed else 'no box')
        print(f'  {day}  #{no:>4}  {typ[:9]:9} ({tag:10})  {what:28} → ' + ', '.join(f'{v} {short[k]}' for k, v in use.items()))
    total = Counter()
    print('\nPer day:')
    for day, d in per_day.items():
        total.update(d['use'])
        print(f'  {day}: {d["orders"]} orders ({d["online"]} online) → ' + (', '.join(f'{d["use"][p]} {short[p]}' for p in PACKAGING if d['use'][p]) or 'no packaging'))
    print('\nTOTAL packaging:')
    for p in PACKAGING:
        if total[p]:
            print(f'  {total[p]:>5}  {p}')
    if unmapped:
        print('\nNot mapped to any packaging rule (check these):')
        for name, q in unmapped.most_common():
            print(f'  {q:>4}  {name}')

    if out_csv:
        with open(out_csv, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.writer(f)
            w.writerow(['Date', 'Orders', 'Online orders'] + PACKAGING)
            for day, d in per_day.items():
                w.writerow([day, d['orders'], d['online']] + [d['use'][p] for p in PACKAGING])
        print(f'\nPer-day CSV written to {out_csv}')
    return per_day, unmapped


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
