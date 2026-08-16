# Waffle Castle — Mobile Menu (scan-to-view)

A mobile-first digital menu customers open by scanning a QR code. Styled after
**wafflecastle.in** (Pacifico brand font, Geist body, amber + cream palette), with the
**menu items & categories from Zomato** (8 categories, 83 items). You can add / edit / delete
items and categories yourself.

## Files
- `index.html` — the whole app (self-contained: data + fonts + logic). This is what you host.
- `menu.json` — the menu data as plain JSON (reference / backup).

## Using it
Open `index.html`. It's built for phones but works on any screen.
- **Browse**: tap category chips (sticky at top) or scroll; use the search box.
- **Veg / non-veg** dots, images, name, description, and price on each item.

## Editing the menu (owner) — tap ⚙️ (top right)
Manage mode turns on:
- **＋ Add item** under any category — name, description, price (₹), veg/non-veg, image URL (with live preview)
- **✏️ Edit** / **🗑 Delete** on each item
- **＋ Add new category** and **Delete category**
- Bottom bar: **Export** (download `menu.json`), **Import** (load a `menu.json`), **Reset** (back to original Zomato menu)

Edits save automatically in that browser (localStorage).

### ⚠️ Making edits visible to customers
Customer phones show the menu **baked into the hosted `index.html`** — not edits saved on another
device's browser. So after editing:
1. Tap **Export** to download the updated `menu.json`, then
2. Re-publish `index.html` with that data baked in (I can do this for you in one step), **or** host
   the data centrally (small backend / Google Sheet / Supabase) so edits go live instantly.

## Getting it on a QR code (required for phone scanning)
A phone can't open a file on your PC — the menu must be hosted at a public URL first. Options:
- **GitHub Pages / Netlify / Cloudflare Pages** — free static hosting; drop `index.html` in.
- Any web host you already have.
- For same-Wi-Fi testing: run a local server and use your PC's LAN IP.

Once it has a URL, generate a QR code pointing to that URL (any QR generator, or I can make one)
and print it for the table/counter.

## Notes
- Prices from Zomato aren't public, so items start at **₹0** ("Price on request") — set them in Manage mode.
- Menu source: https://www.zomato.com/vadodara/waffle-castle-madhavpura/order
- UI/fonts referenced from: https://www.wafflecastle.in/
