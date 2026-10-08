// Packaging & items used by orders, from a Petpooja "Order Report" export.
// Logic only — used by the Inventory app's Daily tab ("From Petpooja orders").
// Same rules as tools/petpooja_boxes.py — keep the two in step.
//
// ONLINE orders (Order Type "Delivery": Zomato, Swiggy, …)
//   waffle        (Signature Waffles + Ice Cream Waff-Wich) n → n÷2 double boxes + (n mod 2) single box, and 1 regular cone each
//   mini waffles  1 mini waffle box + 4 mini cones per pack of 4
//   mini pancake  1 pancake box + 2 forks      brownie bowl  1 bowl + 2 spoons
//   shake/coffee  1 glass with lid + 1 straw   long stick    1 stick cover + 1 stick tray
//   water bottle  1 Water Btl 500ml
//   waffle candy  1 square dish                waffle cake   1 cake box
//   mini pancakes 4 pcs (Mini Treat)  1 square dish + 2 forks
//   seasonal      1 glass with lid             castle crown  1 square dish
//   combos        Mini Royal Treat = 1 square dish + 1 glass + 1 straw · 5 Waffles Combo = 5 waffles (cones + boxes as above)
//                 Castle Celebration Box = 1 mini waffle box + 4 mini cones + 1 cake box
//                 Biscoff Lover / Kunafa Royal Combo = 1 waffle + 1 shake · Sugar Rush For Two = 2 waffles + 2 shakes
//   "… (Double Layer)" = waffle cake
//   add-ons       no packaging
// OTHER orders: waffle boxes only if a waffle box is billed on the order (always 1 cone per waffle);
//   long stick = 1 stick tray; everything else as online.
// Only the order no., type, items, status and date columns are read — never customer details.
(function(){
const norm=s=>String(s==null?'':s).replace(/\s+/g,' ').trim().toLowerCase();

// Packaging, named exactly as the inventory items
const P={DOUBLE:'Waffle Box - Double',SINGLE:'Waffle Box - Single',CONE:'Waffle Pouch - Regular',MINI_BOX:'Mini Waffle Box (4 Pic)',MINI_CONE:'Waffle Pouch - Small',
  PANCAKE_BOX:'Pan Cake Box',FORK:'140mm Fork',BOWL:'Brownie Bowl',SPOON:'140mm Spoon',GLASS:'300 Ml Glass With Lid ( With Printing )',STRAW:'Straw 10mm',
  STICK_COVER:'Waffle Stick Cover',STICK_TRAY:'Waffle Stick Tray',WATER:'Water Btl 500ml',DISH:'Square Dish',CAKE_BOX:'Cake Box'};
const ITEMS=Object.values(P);
// Which rule each packaging item comes from (shown next to the count)
const RULE={[P.DOUBLE]:'waffles',[P.SINGLE]:'waffles',[P.CONE]:'waffles',[P.MINI_BOX]:'mini waffle packs',[P.MINI_CONE]:'mini waffle packs',
  [P.PANCAKE_BOX]:'mini pancakes',[P.FORK]:'mini pancakes (8 & 4 pcs)',[P.BOWL]:'brownie bowls',[P.SPOON]:'brownie bowls',[P.GLASS]:'shakes & coffee',[P.STRAW]:'shakes & coffee',
  [P.STICK_COVER]:'long sticks (online)',[P.STICK_TRAY]:'long sticks',[P.WATER]:'water bottles',
  [P.DISH]:'waffle candy, 4-pc mini pancakes, crowns & mini royal treat',[P.CAKE_BOX]:'waffle cakes & celebration box'};
const CATEGORY_KIND={'signature waffles':'waffle','ice cream waff-wich':'waffle','mini waffles - pack of 4':'miniwaffle','long waffle sticks':'stick','mini pancakes':'pancake','mini treat':'minipc',
  'royal brownie bowls':'bowl','chill thrill shakes':'shake','creamy coffee':'shake','fizzy expresso':'shake',
  'waffle cakes':'cake','seasonal':'seasonal','castle crown':'crown','add-ons':'addon'};
// Combos, by name: the packaging of what is inside
const COMBO_KIND={'mini royal treat':'minitreat','5 waffles combo':'fivecombo','castle celebration box':'celebration',
  'biscoff lover combo':'combo1','kunafa royal combo':'combo1','sugar rush for two':'combo2'};
// Combos counted as the waffles and shakes inside them (so online waffle boxes apply too)
const MIX={combo1:{waffle:1,shake:1},combo2:{waffle:2,shake:2},fivecombo:{waffle:5}};
// Fixed packaging per item for the simpler kinds
const FIXED={candy:{[P.DISH]:1},cake:{[P.CAKE_BOX]:1},seasonal:{[P.GLASS]:1},crown:{[P.DISH]:1},addon:{},
  minipc:{[P.DISH]:1,[P.FORK]:2},minitreat:{[P.DISH]:1,[P.GLASS]:1,[P.STRAW]:1},celebration:{[P.MINI_BOX]:1,[P.MINI_CONE]:4,[P.CAKE_BOX]:1}};

// menu item name → kind, from ../menu-data.js
const MENU_KIND={};
// also keyed without spaces, as Petpooja and the menu sometimes space a name differently ("Royal Rocky Roads" / "RoyalRocky Roads")
const squash=n=>n.replace(/ /g,'');
(window.DEFAULT_MENU&&window.DEFAULT_MENU.categories||[]).forEach(c=>{const k=CATEGORY_KIND[norm(c.category)];c.items.forEach(i=>{const n=norm(i.name);
  if(!(n in MENU_KIND))MENU_KIND[n]=k||null;if(!(squash(n) in MENU_KIND))MENU_KIND[squash(n)]=k||null;});});

function classify(name){
  const n=norm(name),base=n.replace(/\s*\(.*\)\s*$/,'');   // "Death By Chocolate (Double Layer)" → "death by chocolate"
  if(/^(single|double) waffle box$/.test(n))return 'box';
  if(COMBO_KIND[base])return COMBO_KIND[base];
  if(/\(waffle candy\)/.test(n))return 'candy';   // Mini Treat "Dark Choco (Waffle Candy)"
  if(/mini pancakes? 4 ?pcs/.test(n))return 'minipc';   // Mini Treat "Dark Choco (Mini Pancakes 4 Pcs)"
  if(/london strawberry/.test(n))return 'seasonal';
  if(/\(double layer\)/.test(n))return 'cake';   // billed as "Royal London Strawberry"
  if(MENU_KIND[n])return MENU_KIND[n];
  if(MENU_KIND[squash(n)])return MENU_KIND[squash(n)];
  if(base!==n&&!/mini pancakes?/.test(n)&&MENU_KIND[base])return MENU_KIND[base];
  if(/\bmpc\b|mini pancakes?/.test(n))return 'pancake';
  if(/\blws\b/.test(n))return 'stick';
  if(/^mini waffles\b.*pack of 4/.test(n))return 'miniwaffle';
  if(/ waffle$/.test(n)&&!/cake|waff-?wich/.test(n))return 'waffle';
  if(/ bowl$/.test(n)||n==='brownie bowl')return 'bowl';
  if(/ shake$/.test(n))return 'shake';
  if(/^water (bottle|btl)\b/.test(n))return 'water';
  if(/^extra\b/.test(n)||/^(chocolate|vanilla) ice cream$/.test(n))return 'addon';   // add-ons billed under slightly different names   // "Water Bottle (500 Ml)"
  return null;
}
// 'A, B x 2, C' → [['A',1],['B',2],['C',1]]
function splitItems(text){
  return String(text||'').split(',').map(s=>s.trim()).filter(Boolean).map(part=>{
    const m=part.match(/^(.*?)\s*(?:[x×]\s*(\d+)|\((\d+)\))\s*$/);
    return m&&(m[2]||m[3])?[m[1].trim(),+(m[2]||m[3])]:[part,1];
  });
}
function packagingFor(k,online,boxBilled){
  const u={},add=(p,n)=>{if(n)u[p]=(u[p]||0)+n;};
  const w=k.waffle||0;
  if(w){if(online||boxBilled){add(P.DOUBLE,Math.floor(w/2));add(P.SINGLE,w%2);}add(P.CONE,w);}
  add(P.MINI_BOX,k.miniwaffle||0);add(P.MINI_CONE,4*(k.miniwaffle||0));
  add(P.PANCAKE_BOX,k.pancake||0);add(P.FORK,2*(k.pancake||0));
  add(P.BOWL,k.bowl||0);add(P.SPOON,2*(k.bowl||0));
  add(P.GLASS,k.shake||0);add(P.STRAW,k.shake||0);
  add(P.STICK_TRAY,k.stick||0);if(online)add(P.STICK_COVER,k.stick||0);
  add(P.WATER,k.water||0);
  Object.entries(FIXED).forEach(([kind,pack])=>{const q=k[kind]||0;if(q)Object.entries(pack).forEach(([p,n])=>add(p,n*q));});
  return u;
}
const MONTH={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
function parseDay(v){   // "28 Sep 2026 21:35:14" (or an Excel date number) → '2026-09-28'
  if(typeof v==='number'&&window.XLSX){const d=XLSX.SSF.parse_date_code(v);return d.y+'-'+String(d.m).padStart(2,'0')+'-'+String(d.d).padStart(2,'0');}
  const m=String(v).match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  return m&&MONTH[m[2].toLowerCase()]!=null?m[3]+'-'+String(MONTH[m[2].toLowerCase()]+1).padStart(2,'0')+'-'+m[1].padStart(2,'0'):'';
}
// rows: the first sheet as arrays (XLSX.utils.sheet_to_json(ws,{header:1})) →
// {days:{'YYYY-MM-DD':{orders,online,use:{item:qty}}}, unmapped:{name:qty}, skipped}
function analyse(rows){
  const hi=rows.findIndex(r=>norm(r[0])==='order no.');
  if(hi<0)throw new Error('This does not look like a Petpooja Order Report (no “Order No.” column).');
  const H=rows[hi].map(norm),col=n=>H.indexOf(n);
  const c={no:col('order no.'),type:col('order type'),items:col('items'),status:col('status'),created:col('created')};
  const miss=Object.entries(c).filter(([,v])=>v<0).map(([k])=>k);
  if(miss.length)throw new Error('The export is missing columns: '+miss.join(', '));
  const days={},unmapped={};let skipped=0;
  rows.slice(hi+1).forEach(r=>{
    if(r[c.no]==null||String(r[c.no]).trim()==='')return;
    if(/cancel/i.test(r[c.status]||'')){skipped++;return;}
    const day=parseDay(r[c.created]);if(!day)return;
    const online=/^delivery/.test(norm(r[c.type]));
    const kinds={};let boxBilled=false;
    splitItems(r[c.items]).forEach(([n,q])=>{const k=classify(n);if(k==='box')boxBilled=true;
      else if(MIX[k])Object.entries(MIX[k]).forEach(([m,x])=>kinds[m]=(kinds[m]||0)+x*q);
      else if(k)kinds[k]=(kinds[k]||0)+q;else unmapped[n]=(unmapped[n]||0)+q;});
    const d=days[day]||(days[day]={orders:0,online:0,use:{}});
    d.orders++;if(online)d.online++;
    Object.entries(packagingFor(kinds,online,boxBilled)).forEach(([p,n])=>d.use[p]=(d.use[p]||0)+n);
  });
  return {days,unmapped,skipped};
}
window.PACKAGING_LOGIC={ITEMS,RULE,classify,splitItems,packagingFor,analyse,norm};
})();
