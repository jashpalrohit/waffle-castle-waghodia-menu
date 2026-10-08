// ▼▼▼ Same Supabase project & owner login as the menu (../app.js) ▼▼▼
const SUPABASE_URL='https://pyhtrkylkykqwklrzitm.supabase.co';
const SUPABASE_KEY='sb_publishable_th2b-0LngMIeET39bLchaA_RacvqIZ-';
const OWNER_EMAIL='jashpalrohit002@gmail.com';
// ▲▲▲ Tables are created by inventory/schema.sql — open access, no login needed ▲▲▲
let sb=null;
try{sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);}catch(e){}

let authed=false, tab='stock';
let items=[];                 // inv_items (stock & last_cost are kept up to date by the database)
let sups=[];                  // inv_suppliers
let moves=[], movesKey='';    // inv_moves for the period shown on History / Report
let view='month', calY, calM; // History always shows a month; Report can show a month or a year
let stockQ='', stockCat='ALL', stockStatus='ALL', showArchived=false, histItem='ALL', histKind='ALL';
// Stock tab layout: 'table' (default) or 'cards'; remembered on this device only
let stockView='table';try{stockView=localStorage.getItem('inv.stockView')||'table';}catch(e){}
let stockSort={key:'category',dir:1};
const now0=new Date(); calY=now0.getFullYear(); calM=now0.getMonth();

// ---- helpers ----
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function toast(m,bad){const t=document.getElementById('toast');t.textContent=m;t.classList.toggle('bad',!!bad);t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2400);}
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const pad=n=>String(n).padStart(2,'0');
const dayKey=d=>{d=new Date(d);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const today=()=>dayKey(new Date());
const fmtDay=k=>new Date(k+'T00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
const num=n=>Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:4});
const qty=(n,unit)=>num(n)+' '+esc(unit||'');
const rupees=n=>n==null?'—':'₹'+Number(n).toLocaleString('en-IN',{maximumFractionDigits:2});
const rupees0=n=>'₹'+Math.round(Number(n||0)).toLocaleString('en-IN');
const itemById=id=>items.find(i=>i.id===id);
const supById=id=>sups.find(s=>s.id===id);
const isLow=i=>i.active&&Number(i.stock)<Number(i.min_stock);
function dbErr(e){
  const m=(e&&e.message)||String(e||'');
  if(/inv_(items|moves|suppliers)|PGRST20[25]|42P01/i.test(m+(e&&e.code||'')))return 'Inventory database is not set up yet — run inventory/schema.sql in Supabase.';
  return m||'Something went wrong';
}

const UNITS=['kg','g','L','ml','pcs','pack','box','dozen'];
const CATS=['Bakery mix','Chocolate & sauces','Dairy','Fruits & toppings','Beverages','Packaging','Cleaning','Other'];
// Kinds of stock movement. 'adjust' is a stock count: a signed correction to match what is on the shelf.
// 'count' marks a daily count where nothing changed (qty 0); it is only shown on the Daily count register.
const KINDS={in:{label:'Stock in',verb:'Purchased',sign:'+'},out:{label:'Used',verb:'Used',sign:'−'},waste:{label:'Wastage',verb:'Wasted',sign:'−'},adjust:{label:'Stock count',verb:'Stock count',sign:'±'}};
const signedQty=m=>m.kind==='in'||m.kind==='adjust'?Number(m.qty):m.kind==='count'?0:-Number(m.qty);

const IC={
  lock:'<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  unlock:'<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',
  box:'<svg class="ico" viewBox="0 0 24 24"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>',
  hist:'<svg class="ico" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/><polyline points="12 7 12 12 15 14"/></svg>',
  chart:'<svg class="ico" viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="20"/><rect x="6" y="11" width="3" height="7"/><rect x="11" y="6" width="3" height="12"/><rect x="16" y="14" width="3" height="4"/></svg>',
  truck:'<svg class="ico" viewBox="0 0 24 24"><rect x="1" y="6" width="14" height="11" rx="1"/><path d="M15 10h4l3 3v4h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  plus:'<svg class="ico" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  minus:'<svg class="ico" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  prev:'<svg class="ico" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>',
  next:'<svg class="ico" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>',
  dl:'<svg class="ico" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  alert:'<svg class="ico" viewBox="0 0 24 24"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/></svg>',
  check:'<svg class="ico" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v2h8V3"/><polyline points="8.5 12 10.5 14 15.5 9"/></svg>',
  cal:'<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  cart:'<svg class="ico" viewBox="0 0 24 24"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6"/></svg>',
  rupee:'<svg class="ico" viewBox="0 0 24 24"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 0 0-10"/></svg>'
};

// ---- bottom sheet (same markup as the menu app) ----
function openSheet(html){document.getElementById('sheet').innerHTML='<button class="sheet-close" type="button" aria-label="Close" onclick="closeSheet()"><svg class="ico" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button><div class="sheet-body">'+html+'</div>';document.getElementById('overlay').classList.add('show');}
function closeSheet(){document.getElementById('overlay').classList.remove('show');}
document.getElementById('overlay').addEventListener('click',e=>{if(e.target.id==='overlay')closeSheet();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet();});

// ============================================================
// Owner login (same Supabase account as the menu and attendance)
// ============================================================
function reflectAuth(){
  const b=document.getElementById('authBtn');if(!b)return;   // no lock button: inventory is open
  b.innerHTML=authed?IC.unlock:IC.lock;b.classList.toggle('on',authed);
  b.title=authed?'Owner: logged in (tap to lock)':'Owner login';b.setAttribute('aria-label',b.title);
}
function loginCard(){
  return '<div class="page-head">'+IC.lock+'<h2>Inventory</h2></div>'+
    '<div class="att-card att-login"><p>Inventory is for the owner only. Log in with the same password as the menu.</p>'+
    '<div class="fld"><label>Password</label><input id="f_pass" type="password" placeholder="Enter password" autocomplete="current-password" onkeydown="if(event.key===\'Enter\')tryAuth()"></div>'+
    '<div class="sheet-actions"><button class="save" id="loginBtn" onclick="tryAuth()">Unlock</button></div></div>';
}
async function tryAuth(){
  const el=document.getElementById('f_pass');if(!el||!sb)return;
  const btn=document.getElementById('loginBtn');if(btn){btn.disabled=true;btn.textContent='Signing in…';}
  let r;try{r=await sb.auth.signInWithPassword({email:OWNER_EMAIL,password:el.value});}catch(e){r={error:e};}
  if(btn){btn.disabled=false;btn.textContent='Unlock';}
  if(r.error||!r.data||!r.data.session){toast(r.error&&/fetch|network/i.test(r.error.message)?'No connection — try again':'Wrong password',true);el.value='';el.focus();return;}
  toast('Unlocked');
}
async function lock(){try{await sb.auth.signOut();}catch(e){}toast('Locked');}
// Suppliers are owner-only (same Supabase account as the menu editor); the rest of the inventory is open.
let ownerIn=false;
const isOwnerSession=s=>!!(s&&s.user&&(s.user.email||'').toLowerCase()===OWNER_EMAIL);
function supplierLogin(){
  return '<div class="page-head">'+IC.truck+'<h2>Suppliers</h2></div>'+
    '<div class="att-card att-login"><p>Suppliers are for the owner only. Log in with the same password as the menu.</p>'+
    '<div class="fld"><label>Password</label><input id="f_pass" type="password" placeholder="Enter password" autocomplete="current-password" onkeydown="if(event.key===\'Enter\')tryAuth()"></div>'+
    '<div class="sheet-actions"><button class="save" id="loginBtn" onclick="tryAuth()">Unlock</button></div></div>';
}
if(document.getElementById('authBtn'))document.getElementById('authBtn').onclick=()=>{if(authed)lock();else{const p=document.getElementById('f_pass');if(p)p.focus();}};
async function setAuthed(v){
  if(v===authed)return;
  authed=v;reflectAuth();items=[];sups=[];moves=[];movesKey='';
  if(authed){
    currentWrap().innerHTML=skeleton();
    await loadBase();
  }
  renderTab();
}
const skeleton=()=>'<div class="att-card" style="margin-top:16px"><div class="sk-line w90"></div><div class="sk-line w70" style="margin-top:10px"></div></div>';
const currentWrap=()=>document.getElementById(tab+'Wrap');

// ============================================================
// Data
// ============================================================
let baseErr='';
async function loadBase(){
  baseErr='';
  const [a,b]=await Promise.all([
    sb.from('inv_items').select('id,name,category,unit,min_stock,stock,last_cost,supplier_id,active,created_at').order('name'),
    sb.from('inv_suppliers').select('id,name,phone,note,created_at').order('name')
  ]);
  if(a.error||b.error){baseErr=dbErr(a.error||b.error);return false;}
  items=a.data||[];sups=b.data||[];
  document.getElementById('catList').innerHTML=[...new Set([...CATS,...items.map(i=>i.category).filter(Boolean)])].map(c=>'<option value="'+esc(c)+'">').join('');
  const low=items.filter(isLow).length;
  document.getElementById('lowDot').style.display=low?'block':'none';
  return true;
}
function periodRange(v){
  v=v||view;
  return v==='year'?[calY+'-01-01',(calY+1)+'-01-01']:[calY+'-'+pad(calM+1)+'-01',dayKey(new Date(calY,calM+1,1))];
}
// Supabase caps a query at 1000 rows, so page through a long period
async function fetchMoves(from,to){
  const out=[];const PAGE=1000;
  for(let i=0;;i+=PAGE){
    const {data,error}=await sb.from('inv_moves').select('id,item_id,kind,qty,unit_cost,supplier_id,moved_on,note,source,created_at')
      .gte('moved_on',from).lt('moved_on',to).neq('kind','count').order('moved_on',{ascending:false}).order('id',{ascending:false}).range(i,i+PAGE-1);
    if(error)throw error;
    out.push(...data);
    if(data.length<PAGE)return out;
  }
}
async function loadMoves(v){
  const [from,to]=periodRange(v),key=from+to;
  if(key===movesKey)return true;
  try{moves=await fetchMoves(from,to);movesKey=key;return true;}
  catch(e){moves=[];movesKey='';toast(dbErr(e),true);return false;}
}
async function afterChange(){await loadBase();movesKey='';renderTab();}

// ============================================================
// Stock tab
// ============================================================
function renderStock(){
  const w=document.getElementById('stockWrap');
  if(!authed){w.innerHTML=loginCard();return;}
  if(baseErr){w.innerHTML='<div class="page-head">'+IC.box+'<h2>Stock</h2></div><div class="att-empty">'+esc(baseErr)+'</div>';return;}
  const act=items.filter(i=>i.active),low=act.filter(isLow);
  const value=act.reduce((a,i)=>a+Math.max(0,Number(i.stock))*Number(i.last_cost||0),0);
  const cats=[...new Set(items.map(i=>i.category||'Other'))].sort();
  const archivedN=items.length-act.length;
  w.innerHTML='<div class="page-head">'+IC.box+'<h2>Stock</h2>'+(low.length?'<span class="att-count low">'+low.length+' low</span>':'')+'</div>'+
    '<div class="inv-stats">'+
      '<div class="inv-stat"><span>Items</span><b>'+act.length+'</b></div>'+
      '<div class="inv-stat'+(low.length?' bad':'')+'"><span>Low stock</span><b>'+low.length+'</b></div>'+
      '<div class="inv-stat"><span>Stock value</span><b>'+rupees0(value)+'</b><small>at last purchase price</small></div>'+
    '</div>'+
    (low.length?'<div class="att-card inv-low"><div class="inv-low-h">'+IC.alert+' Running low — buy soon</div>'+
      low.map(i=>'<div class="inv-low-row"><div><b>'+esc(i.name)+'</b><small>'+qty(i.stock,i.unit)+' left · min '+qty(i.min_stock,i.unit)+(supById(i.supplier_id)?' · '+esc(supById(i.supplier_id).name):'')+'</small></div>'+
        '<button class="mini" onclick="moveForm(\'in\',\''+i.id+'\')">+ Stock in</button></div>').join('')+'</div>':'')+
    '<div class="inv-tools stock"><div class="search"><input type="search" id="stockQ" placeholder="Search items…" value="'+esc(stockQ)+'" oninput="stockQ=this.value;renderStockList()"></div>'+
      '<div class="fld"><select id="stockCat" onchange="stockCat=this.value;renderStockList()"><option value="ALL">All categories</option>'+cats.map(c=>'<option'+(c===stockCat?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select></div>'+
      '<div class="fld"><select onchange="stockStatus=this.value;renderStockList()">'+[['ALL','All items'],['low','Low stock only'],['out','Out of stock']].map(([v,l])=>'<option value="'+v+'"'+(stockStatus===v?' selected':'')+'>'+l+'</option>').join('')+'</select></div>'+
      '<div class="seg"><button type="button" class="'+(stockView==='table'?'sel':'')+'" onclick="setStockView(\'table\')">Table</button><button type="button" class="'+(stockView==='cards'?'sel':'')+'" onclick="setStockView(\'cards\')">Cards</button></div></div>'+
    '<div id="stockList">'+stockListHtml()+'</div>'+
    (archivedN?'<button class="inv-link" onclick="showArchived=!showArchived;renderStock()">'+(showArchived?'Hide':'Show')+' '+archivedN+' archived item'+(archivedN===1?'':'s')+'</button>':'')+
    '<div class="att-actions"><button class="att-btn" onclick="itemForm()">'+IC.plus+' Add item</button><button class="att-btn" onclick="moveForm(\'in\')">'+IC.plus+' Record purchase</button>'+
      '<button class="att-btn" onclick="exportStockCSV()">'+IC.dl+' Export stock CSV</button></div>';
}
function setStockView(v){stockView=v;try{localStorage.setItem('inv.stockView',v);}catch(e){}renderStock();}
const stockStatusOf=i=>!i.active?'archived':Number(i.stock)<=0?'out':isLow(i)?'low':'ok';
function stockFiltered(){
  const q=stockQ.trim().toLowerCase();
  return items.filter(i=>(showArchived||i.active)&&(stockCat==='ALL'||(i.category||'Other')===stockCat)&&
    (stockStatus==='ALL'||(stockStatus==='low'?isLow(i):Number(i.stock)<=0&&i.active))&&
    (!q||i.name.toLowerCase().includes(q)||(i.category||'').toLowerCase().includes(q)||((supById(i.supplier_id)||{}).name||'').toLowerCase().includes(q)));
}
// re-render just the list while typing so the search box keeps focus
function renderStockList(){document.getElementById('stockList').innerHTML=stockListHtml();}
function stockListHtml(){
  const list=stockFiltered();
  if(!list.length)return '<div class="att-empty">'+(items.length?'No items match.':'No items yet. Add your first raw material below.')+'</div>';
  if(stockView==='table')return stockTable(list);
  const groups={};list.forEach(i=>(groups[i.category||'Other']=groups[i.category||'Other']||[]).push(i));
  return Object.keys(groups).sort().map(c=>{const low=groups[c].filter(isLow).length;
    return accSection('stock',c,c,groups[c].length+' item'+(groups[c].length===1?'':'s')+(low?' · '+low+' low':''),'<div class="inv-grid">'+groups[c].map(itemCard).join('')+'</div>');}).join('');
}
// ---- Data table view: sortable columns, one row per item ----
const STOCK_COLS=[
  // stock figures come right after the name so they are visible on a phone without scrolling
  {k:'name',l:'Item',v:i=>i.name.toLowerCase()},
  {k:'stock',l:'In stock',num:1,v:i=>Number(i.stock)},
  {k:'min',l:'Min',num:1,v:i=>Number(i.min_stock)},
  {k:'status',l:'Status',v:i=>({out:0,low:1,ok:2,archived:3})[stockStatusOf(i)]},
  {k:'category',l:'Category',v:i=>(i.category||'Other').toLowerCase()+'\u0000'+i.name.toLowerCase()},
  {k:'price',l:'Last price',num:1,v:i=>i.last_cost==null?-1:Number(i.last_cost)},
  {k:'value',l:'Value',num:1,v:i=>Math.max(0,Number(i.stock))*Number(i.last_cost||0)},
  {k:'supplier',l:'Supplier',v:i=>((supById(i.supplier_id)||{}).name||'~').toLowerCase()}
];
function sortStock(k){stockSort=stockSort.key===k?{key:k,dir:-stockSort.dir}:{key:k,dir:1};renderStockList();}
function stockTable(list){
  const col=STOCK_COLS.find(c=>c.k===stockSort.key)||STOCK_COLS[1];
  const rows=[...list].sort((a,b)=>{const x=col.v(a),y=col.v(b);return (x<y?-1:x>y?1:a.name.localeCompare(b.name))*stockSort.dir;});
  const status={ok:'<span class="st-chip in">OK</span>',low:'<span class="st-chip off">Low</span>',out:'<span class="st-chip off">Out</span>',archived:'<span class="st-chip">Archived</span>'};
  const total=rows.reduce((a,i)=>a+Math.max(0,Number(i.stock))*Number(i.last_cost||0),0);
  const head='<th class="sr">Sr.</th>'+STOCK_COLS.map(c=>'<th class="'+(c.num?'num ':'')+(c.k==='name'?'nmh ':'')+'sortable'+(c.k===stockSort.key?' sorted':'')+'" onclick="sortStock(\''+c.k+'\')">'+c.l+
    (c.k===stockSort.key?' <span class="arr">'+(stockSort.dir>0?'▲':'▼')+'</span>':'')+'</th>').join('')+'<th></th>';
  return '<div class="att-card inv-tablecard"><div class="tbl-scroll"><table class="att-table inv-table"><thead><tr>'+head+'</tr></thead><tbody>'+
    rows.map((i,n)=>{const st=stockStatusOf(i),v=Math.max(0,Number(i.stock))*Number(i.last_cost||0),sup=supById(i.supplier_id);
      return '<tr class="'+st+'" onclick="itemDetail(\''+i.id+'\')">'+
        '<td class="sr">'+(n+1)+'</td><td class="nm"><b>'+esc(i.name)+'</b></td>'+
        '<td class="num qty'+(Number(i.stock)<0?' neg':'')+'"><b>'+num(i.stock)+'</b> <small>'+esc(i.unit)+'</small></td>'+
        '<td class="num">'+(Number(i.min_stock)?num(i.min_stock)+' <small>'+esc(i.unit)+'</small>':'<span class="muted">—</span>')+'</td>'+
        '<td>'+status[st]+'</td><td>'+esc(i.category||'Other')+'</td>'+
        '<td class="num">'+(i.last_cost!=null?rupees(i.last_cost)+'<small>/'+esc(i.unit)+'</small>':'<span class="muted">—</span>')+'</td>'+
        '<td class="num">'+(v?rupees0(v):'<span class="muted">—</span>')+'</td>'+
        '<td>'+(sup?esc(sup.name):'<span class="muted">—</span>')+'</td>'+
        '<td class="acts" onclick="event.stopPropagation()"><button class="mini in" onclick="moveForm(\'in\',\''+i.id+'\')" title="Stock in">'+IC.plus+' In</button>'+
          '<button class="mini" onclick="moveForm(\'out\',\''+i.id+'\')" title="Used">'+IC.minus+' Used</button></td></tr>';}).join('')+
    '<tr class="tot"><td class="sr"></td><td class="nm">'+rows.length+' item'+(rows.length===1?'':'s')+'</td><td colspan="5"></td><td class="num">'+rupees0(total)+'</td><td colspan="2"></td></tr>'+
    '</tbody></table></div></div><p class="att-foot">Tap a column heading to sort. Tap a row for the item\'s details and history. Value = stock × last purchase price.</p>';
}
function exportStockCSV(){
  const cell=v=>{v=String(v==null?'':v);return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  const out=[['Sr.','Item','Category','Unit','In stock','Min stock','Status','Last price','Value','Supplier'].join(',')];
  stockFiltered().sort((a,b)=>(a.category||'').localeCompare(b.category||'')||a.name.localeCompare(b.name)).forEach((i,n)=>{const sup=supById(i.supplier_id);
    out.push([n+1,i.name,i.category||'Other',i.unit,Number(i.stock),Number(i.min_stock),stockStatusOf(i),i.last_cost,(Math.max(0,Number(i.stock))*Number(i.last_cost||0)).toFixed(2),sup?sup.name:''].map(cell).join(','));});
  const blob=new Blob(['\ufeff'+out.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='stock-'+today()+'.csv';a.click();toast('Exported stock CSV');
}
function itemCard(i){
  const st=Number(i.stock),min=Number(i.min_stock),low=isLow(i),neg=st<0;
  const pct=min>0?Math.max(0,Math.min(100,st/(min*2)*100)):(st>0?100:0);
  return '<div class="inv-item'+(low?' low':'')+(i.active?'':' archived')+'">'+
    '<button type="button" class="inv-item-main" onclick="itemDetail(\''+i.id+'\')">'+
      '<span class="inv-name">'+esc(i.name)+(i.active?'':' <span class="st-chip">Archived</span>')+'</span>'+
      '<span class="inv-qty'+(neg?' neg':'')+'">'+num(st)+' <small>'+esc(i.unit)+'</small></span>'+
      '<span class="inv-bar"><i style="width:'+pct+'%"></i></span>'+
    '</button>'+
    '<div class="inv-item-acts"><span class="inv-meta">'+(low?'<b class="lowtag">Low</b> ':'')+'Min '+qty(min,i.unit)+(i.last_cost!=null?' · '+rupees(i.last_cost)+'/'+esc(i.unit):'')+'</span><button class="mini in" onclick="moveForm(\'in\',\''+i.id+'\')">'+IC.plus+' In</button><button class="mini" onclick="moveForm(\'out\',\''+i.id+'\')">'+IC.minus+' Used</button></div>'+
  '</div>';
}
async function itemDetail(id){
  const i=itemById(id);if(!i)return;
  openSheet('<h3>'+esc(i.name)+'</h3><div class="att-card"><div class="sk-line w90"></div></div>');
  const {data,error}=await sb.from('inv_moves').select('id,item_id,kind,qty,unit_cost,supplier_id,moved_on,note,source').eq('item_id',id).neq('kind','count')
    .order('moved_on',{ascending:false}).order('id',{ascending:false}).range(0,14);
  const recent=error?[]:(data||[]);
  const sup=supById(i.supplier_id);
  openSheet('<h3>'+esc(i.name)+'</h3>'+
    '<div class="inv-detail"><div><span>In stock</span><b class="'+(Number(i.stock)<0?'neg':'')+'">'+qty(i.stock,i.unit)+'</b></div><div><span>Minimum</span><b>'+qty(i.min_stock,i.unit)+'</b></div>'+
      '<div><span>Last price</span><b>'+(i.last_cost!=null?rupees(i.last_cost)+'/'+esc(i.unit):'—')+'</b></div></div>'+
    '<p class="inv-sub">'+esc(i.category||'Other')+(sup?' · Usual supplier: '+esc(sup.name):'')+'</p>'+
    '<div class="inv-quick">'+
      '<button class="mini in" onclick="moveForm(\'in\',\''+id+'\')">'+IC.plus+' Stock in</button>'+
      '<button class="mini" onclick="moveForm(\'out\',\''+id+'\')">'+IC.minus+' Used</button>'+
      '<button class="mini" onclick="moveForm(\'waste\',\''+id+'\')">Wastage</button>'+
      '<button class="mini" onclick="moveForm(\'adjust\',\''+id+'\')">Stock count</button>'+
      '<button class="mini" onclick="itemForm(\''+id+'\')">Edit item</button></div>'+
    '<div class="day-lbl">Recent activity</div>'+
    (recent.length?recent.map(m=>moveRow(m,false)).join(''):'<div class="att-empty">No stock movements yet.</div>'));
}
function itemForm(id){
  const i=id?itemById(id):null;
  const v=k=>esc(i&&i[k]!=null?i[k]:'');
  window._itemActive=i?i.active:true;
  openSheet('<h3>'+(i?'Edit item':'Add item')+'</h3>'+
    '<div class="fld"><label>Item name</label><input id="i_name" value="'+v('name')+'" placeholder="e.g. Belgian chocolate" autocomplete="off"></div>'+
    '<div class="fld two"><div><label>Category</label><input id="i_cat" list="catList" value="'+v('category')+'" placeholder="e.g. Dairy"></div>'+
      '<div><label>Unit</label><select id="i_unit">'+UNITS.map(u=>'<option'+((i?i.unit:'kg')===u?' selected':'')+'>'+u+'</option>').join('')+
        (i&&!UNITS.includes(i.unit)?'<option selected>'+esc(i.unit)+'</option>':'')+'</select></div></div>'+
    '<div class="fld two"><div><label>Minimum stock</label><input id="i_min" type="number" min="0" step="any" inputmode="decimal" value="'+(i?Number(i.min_stock):'')+'" placeholder="Alert below this"></div>'+
      '<div><label>Usual supplier</label><select id="i_sup"><option value="">None</option>'+sups.map(s=>'<option value="'+s.id+'"'+(i&&i.supplier_id===s.id?' selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select></div></div>'+
    (i?'':'<div class="fld two"><div><label>Opening stock (optional)</label><input id="i_open" type="number" min="0" step="any" inputmode="decimal" placeholder="What you have now"></div>'+
      '<div><label>Price per unit (₹)</label><input id="i_cost" type="number" min="0" step="any" inputmode="decimal" placeholder="Optional"></div></div>')+
    (i?'<div class="fld"><label>Status</label><div class="veg-toggle"><button type="button" id="ia_y" class="'+(i.active?'sel':'')+'" onclick="setItemActive(true)">In use</button><button type="button" id="ia_n" class="'+(i.active?'':'sel')+'" onclick="setItemActive(false)">Archived</button></div>'+
      '<small class="fhint">Archived items are hidden from the stock list and low-stock alerts; their history is kept.</small></div>':'')+
    '<div class="sheet-actions">'+(i?'<button class="cancel danger" onclick="delItem(\''+i.id+'\')">Delete</button>':'<button class="cancel" onclick="closeSheet()">Cancel</button>')+
      '<button class="save" id="i_save" onclick="saveItem('+(i?'\''+i.id+'\'':'null')+')">Save</button></div>');
  setTimeout(()=>{const n=document.getElementById('i_name');if(n&&!i)n.focus();},50);
}
function setItemActive(v){window._itemActive=v;document.getElementById('ia_y').classList.toggle('sel',v);document.getElementById('ia_n').classList.toggle('sel',!v);}
async function saveItem(id){
  const g=k=>{const e=document.getElementById(k);return e?e.value.trim():'';};
  const name=g('i_name'),min=g('i_min')===''?0:Number(g('i_min'));
  if(!name)return toast('Enter an item name',true);
  if(!(min>=0))return toast('Minimum stock cannot be negative',true);
  const rec={name,category:g('i_cat'),unit:g('i_unit')||'pcs',min_stock:min,supplier_id:g('i_sup')||null};
  if(id)rec.active=window._itemActive;
  const b=document.getElementById('i_save');b.disabled=true;
  let res=id?await sb.from('inv_items').update(rec).eq('id',id).select('id'):await sb.from('inv_items').insert(rec).select('id');
  if(!res.error&&!id){   // opening stock becomes the first "stock in" entry
    const open=Number(g('i_open')||0),cost=g('i_cost');
    if(open>0)res=await sb.from('inv_moves').insert({item_id:res.data[0].id,kind:'in',qty:open,unit_cost:cost===''?null:Number(cost),supplier_id:rec.supplier_id,moved_on:today(),note:'Opening stock'});
  }
  b.disabled=false;
  if(res.error)return toast(dbErr(res.error),true);
  closeSheet();toast(id?'Item updated':'Item added');await afterChange();
}
async function delItem(id){
  const i=itemById(id);
  if(!confirm('Delete '+(i?i.name:'this item')+' and ALL its stock history?\n\nTip: set it to Archived instead to keep the history.'))return;
  const {error}=await sb.from('inv_items').delete().eq('id',id);
  if(error)return toast(dbErr(error),true);
  closeSheet();toast('Item deleted');await afterChange();
}

// ============================================================
// Stock movements (in / used / wastage / stock count)
// ============================================================
let _kind='in';
function moveForm(kind,itemId,moveId){
  const m=moveId?moves.find(x=>x.id===moveId)||window._detailMoves&&window._detailMoves.find(x=>x.id===moveId):null;
  if(m){kind=m.kind;itemId=m.item_id;}
  _kind=kind;
  const act=items.filter(i=>i.active||i.id===itemId);
  if(!act.length)return toast('Add an item first',true);
  const it=itemId?itemById(itemId):null;
  const tabs=kind==='in'||kind==='adjust'?'':   // used / wastage share one form
    '<div class="fld"><div class="veg-toggle"><button type="button" id="k_out" class="'+(kind==='out'?'sel':'')+'" onclick="setKind(\'out\')">Used</button><button type="button" id="k_waste" class="'+(kind==='waste'?'sel':'')+'" onclick="setKind(\'waste\')">Wastage</button></div></div>';
  const title=m?'Edit '+KINDS[kind].label.toLowerCase():kind==='in'?'Stock in (purchase)':kind==='adjust'?'Stock count':'Stock out';
  openSheet('<h3>'+title+'</h3>'+tabs+
    '<div class="fld"><label>Item</label><select id="m_item" onchange="moveItemChanged()">'+(it?'':'<option value="">Choose item…</option>')+
      act.map(i=>'<option value="'+i.id+'"'+(i.id===itemId?' selected':'')+'>'+esc(i.name)+'</option>').join('')+'</select>'+
      '<small class="fhint" id="m_have"></small></div>'+
    (kind==='adjust'&&!m?
      '<div class="fld"><label>Actual stock on the shelf now (<span class="m_unit"></span>)</label><input id="m_actual" type="number" step="any" inputmode="decimal" placeholder="Count and enter"></div>'+
      '<small class="fhint" style="display:block;margin:-6px 0 12px">The difference from the recorded stock is saved as a correction.</small>':
      '<div class="fld"><label>'+(kind==='adjust'?'Correction (+ or −)':'Quantity')+' (<span class="m_unit"></span>)</label><input id="m_qty" type="number" step="any" inputmode="decimal" '+(kind==='adjust'?'':'min="0" ')+'value="'+(m?Number(m.qty):'')+'" oninput="moveTotal()"></div>')+
    (kind==='in'?
      '<div class="fld two"><div><label>Price per unit (₹)</label><input id="m_cost" type="number" min="0" step="any" inputmode="decimal" value="'+(m&&m.unit_cost!=null?Number(m.unit_cost):'')+'" oninput="moveTotal()"></div>'+
        '<div><label>Total (₹)</label><input id="m_total" type="number" min="0" step="any" inputmode="decimal" oninput="moveTotalChanged()" placeholder="or enter the bill total"></div></div>'+
      '<div class="fld"><label>Supplier</label><select id="m_sup" onchange="if(this.value===\'__new\')quickSupplier()"><option value="">None</option>'+
        sups.map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join('')+(ownerIn?'<option value="__new">+ New supplier…</option>':'')+'</select></div>':'')+
    '<div class="fld two"><div><label>Date</label><input id="m_date" type="date" max="'+today()+'" value="'+(m?m.moved_on:today())+'"></div>'+
      '<div><label>Note (optional)</label><input id="m_note" value="'+esc(m?m.note:'')+'" placeholder="'+(kind==='in'?'Bill no., brand…':kind==='waste'?'Expired, spilled…':'')+'"></div></div>'+
    '<div class="sheet-actions">'+(m?'<button class="cancel danger" onclick="delMove('+m.id+')">Delete</button>':'<button class="cancel" onclick="closeSheet()">Cancel</button>')+
      '<button class="save" id="m_save" onclick="saveMove('+(m?m.id:'null')+')">Save</button></div>');
  if(kind==='in'){const s=document.getElementById('m_sup');s.value=m?(m.supplier_id||''):(it&&it.supplier_id)||'';}
  moveItemChanged(!m);moveTotal();
}
function setKind(k){_kind=k;['out','waste'].forEach(x=>document.getElementById('k_'+x).classList.toggle('sel',x===k));}
function moveItemChanged(fillSupplier){
  const it=itemById(document.getElementById('m_item').value);
  document.querySelectorAll('.m_unit').forEach(e=>e.textContent=it?it.unit:'qty');
  const have=document.getElementById('m_have');if(have)have.textContent=it?'In stock: '+num(it.stock)+' '+it.unit+(it.last_cost!=null?' · last price '+rupees(it.last_cost)+'/'+it.unit:''):'';
  const s=document.getElementById('m_sup');
  if(s&&fillSupplier!==false&&it&&it.supplier_id&&!s.value)s.value=it.supplier_id;
  const c=document.getElementById('m_cost');if(c&&!c.value&&it&&it.last_cost!=null){c.value=Number(it.last_cost);moveTotal();}
}
function moveTotal(){const q=document.getElementById('m_qty'),c=document.getElementById('m_cost'),t=document.getElementById('m_total');if(q&&c&&t&&document.activeElement!==t)t.value=q.value&&c.value?Math.round(Number(q.value)*Number(c.value)*100)/100:'';}
// typing the bill total works out the price per unit
function moveTotalChanged(){const q=document.getElementById('m_qty'),c=document.getElementById('m_cost'),t=document.getElementById('m_total');if(Number(q.value)>0&&t.value!=='')c.value=Math.round(Number(t.value)/Number(q.value)*100)/100;}
async function quickSupplier(){
  const s=document.getElementById('m_sup');s.value='';
  const name=(prompt('New supplier name')||'').trim();if(!name)return;
  const {data,error}=await sb.from('inv_suppliers').insert({name}).select('id,name,phone,note,created_at');
  if(error)return toast(dbErr(error),true);
  sups.push(data[0]);sups.sort((a,b)=>a.name.localeCompare(b.name));
  s.insertAdjacentHTML('beforeend','');const o=document.createElement('option');o.value=data[0].id;o.textContent=name;s.insertBefore(o,s.lastElementChild);s.value=data[0].id;
  toast('Supplier added');
}
async function saveMove(id){
  const g=k=>{const e=document.getElementById(k);return e?e.value.trim():'';};
  const it=itemById(g('m_item'));if(!it)return toast('Choose an item',true);
  const date=g('m_date');if(!date)return toast('Choose a date',true);
  if(date>today())return toast('The date cannot be in the future',true);
  let q;
  if(_kind==='adjust'&&!id){
    if(g('m_actual')==='')return toast('Enter the counted stock',true);
    q=r3(Number(g('m_actual'))-Number(it.stock));
    if(!q)return toast('Matches the recorded stock — nothing to change');
  }else{
    q=Number(g('m_qty'));
    if(!q||(_kind!=='adjust'&&!(q>0)))return toast(_kind==='adjust'?'Enter a correction other than 0':'Enter a quantity above 0',true);
  }
  // warn before taking recorded stock below zero
  const old=id?moves.find(x=>x.id===id):null;
  const after=Number(it.stock)-(old&&old.item_id===it.id?signedQty(old):0)+signedQty({kind:_kind,qty:q});
  if(after<0&&!confirm('This leaves '+it.name+' at '+num(after)+' '+it.unit+' (below zero). Save anyway?'))return;
  const cost=g('m_cost');
  const rec={item_id:it.id,kind:_kind,qty:q,unit_cost:_kind==='in'&&cost!==''?Number(cost):null,
    supplier_id:_kind==='in'?(g('m_sup')&&g('m_sup')!=='__new'?g('m_sup'):null):null,moved_on:date,note:g('m_note')};
  const b=document.getElementById('m_save');b.disabled=true;
  const {error}=id?await sb.from('inv_moves').update(rec).eq('id',id):await sb.from('inv_moves').insert(rec);
  b.disabled=false;
  if(error)return toast(dbErr(error),true);
  closeSheet();
  toast(id?'Entry updated':KINDS[_kind].verb+' '+(_kind==='adjust'?(q>0?'+':'')+num(q):num(q))+' '+it.unit+' · '+it.name);
  await afterChange();
}
async function delMove(id){
  if(!confirm('Delete this entry? Stock will be recalculated.'))return;
  const {error}=await sb.from('inv_moves').delete().eq('id',id);
  if(error)return toast(dbErr(error),true);
  closeSheet();toast('Entry deleted');await afterChange();
}
function moveRow(m,showItem){
  const it=itemById(m.item_id),s=supById(m.supplier_id),sq=signedQty(m);
  const total=m.kind==='in'&&m.unit_cost!=null?Number(m.unit_cost)*Number(m.qty):null;
  (window._detailMoves=window._detailMoves||[]).push(m);
  return '<button type="button" class="inv-move" onclick="closeSheet();moveForm(null,null,'+m.id+')">'+
    '<span class="kchip '+m.kind+'">'+KINDS[m.kind].label+(m.source&&m.source!=='manual'?'<i>'+({daily:'Daily',import:'Excel',orders:'Orders',purchase:'Upload'}[m.source]||'')+'</i>':'')+'</span>'+
    '<span class="mv-main">'+(showItem?'<b>'+esc(it?it.name:'(deleted item)')+'</b>':'<b>'+fmtDay(m.moved_on)+'</b>')+
      '<small>'+[showItem?'':null,s?s.name:'',m.unit_cost!=null?rupees(m.unit_cost)+'/'+esc(it?it.unit:''):'',m.note].filter(Boolean).map(esc).join(' · ')+'</small></span>'+
    '<span class="mv-qty '+(sq<0?'neg':'pos')+'">'+(sq>0?'+':'−')+num(Math.abs(sq))+' '+esc(it?it.unit:'')+(total!=null?'<small>'+rupees0(total)+'</small>':'')+'</span></button>';
}

// ============================================================
// Daily count tab — the register, one day at a time (like the Excel sheet)
// Opening is worked out from recorded stock; you enter Purchased, Wastage and Closing (the count);
// Used = opening + purchased − wastage − closing. Saved as 'daily' entries for that date (replacing any
// imported Excel entries for that item and day). Single entries made elsewhere show as "other entries".
// ============================================================
let dayK=null, day=null, dayDirty=new Set(), dayQ='', dayCat='ALL';
async function loadDay(k){
  const later=await fetchMoves(k,'9999-12-31');     // stock changes on or after the day (count markers excluded)
  const {data:onDay,error}=await sb.from('inv_moves').select('item_id,kind,source').eq('moved_on',k).eq('kind','count');
  if(error)throw error;
  const d={k,opening:{},other:{},p:{},w:{},used:{},counted:{},orders:{},buy:{}};   // orders: used by Petpooja orders · buy: purchases from the Stock tab that day
  items.forEach(i=>{d.opening[i.id]=Number(i.stock);d.other[i.id]=0;});
  later.forEach(m=>{
    if(d.opening[m.item_id]===undefined)return;
    d.opening[m.item_id]-=signedQty(m);              // back out everything from this day onwards
    if(m.moved_on!==k)return;
    if(m.source==='orders'&&m.kind==='out')d.orders[m.item_id]=(d.orders[m.item_id]||0)+Number(m.qty);
    if((m.source==='manual'||m.source==='purchase')&&m.kind==='in')d.buy[m.item_id]=(d.buy[m.item_id]||0)+Number(m.qty);
    if(m.source==='manual'||m.source==='orders'||m.source==='purchase'){d.other[m.item_id]+=signedQty(m);return;}   // register rows = 'daily' + imported Excel days
    const q=Number(m.qty),id=m.item_id;
    if(m.kind==='in')d.p[id]=(d.p[id]||0)+q;
    else if(m.kind==='waste')d.w[id]=(d.w[id]||0)+q;
    else{d.used[id]=(d.used[id]||0)+(m.kind==='out'?q:-q);d.counted[id]=true;}
  });
  (onDay||[]).forEach(m=>{if(m.source!=='manual')d.counted[m.item_id]=true;});   // counted, nothing used
  Object.keys(d.opening).forEach(id=>{d.opening[id]=r3(d.opening[id]);});
  return d;
}
const r3=n=>Math.round(n*10000)/10000;   // quantities are kept to 4 decimals
function dayExpected(id){const v=dayVals(id);return r3(day.opening[id]+day.other[id]+(v.p||0)-(v.w||0));}
function dayVals(id){
  const g=f=>{const e=document.getElementById('d'+f+'_'+id);return e&&e.value!==''?Number(e.value):null;};
  if(fromOrders(id)){const c=document.getElementById('dc_'+id);return {p:g('p'),w:g('w'),c:c&&c.value!==''?Number(c.value):null};}
  return {p:g('p'),w:g('w'),c:g('c')};
}
async function renderDaily(){
  const w=document.getElementById('dailyWrap');
  if(!authed){w.innerHTML=loginCard();return;}
  if(baseErr){w.innerHTML='<div class="page-head">'+IC.box+'<h2>Daily count</h2></div><div class="att-empty">'+esc(baseErr)+'</div>';return;}
  if(dailyMode==='orders')return renderOrders();
  dayK=dayK||today();
  const head='<div class="page-head">'+IC.check+'<h2>Daily count</h2></div>'+
    '<div class="cal-bar"><button type="button" class="cal-nav" aria-label="Previous day" onclick="shiftDay(-1)">'+IC.prev+'</button>'+
      '<div class="cal-title dp-wrap"><button type="button" class="day-pick" onclick="toggleDayPicker(event)" aria-haspopup="dialog">'+IC.cal+' '+esc(fmtDay(dayK))+'</button>'+
        '<div class="dp-pop" id="dpPop" hidden role="dialog" aria-label="Choose a date"></div></div>'+
      '<button type="button" class="cal-nav" aria-label="Next day" onclick="shiftDay(1)"'+(dayK>=today()?' disabled':'')+'>'+IC.next+'</button></div>'+
    ordersBar()+purchaseBar();
  if(!day||day.k!==dayK){
    w.innerHTML=head+skeleton();
    try{day=await loadDay(dayK);}catch(e){w.innerHTML=head+'<div class="att-empty">'+esc(dbErr(e))+'</div>';return;}
    dayDirty=new Set();dayUnlocked=new Set();
    if(tab!=='daily')return;
  }
  const act=items.filter(i=>i.active);
  if(!act.length){w.innerHTML=head+'<div class="att-empty">No items yet. Add raw materials on the Stock tab first.</div>';return;}
  const cats=[...new Set(act.map(i=>i.category||'Other'))].sort();
  const groups={};act.forEach(i=>(groups[i.category||'Other']=groups[i.category||'Other']||[]).push(i));
  const counted=act.filter(i=>day.counted[i.id]||day.orders[i.id]).length,fromOrders=act.filter(i=>day.orders[i.id]).length;
  w.innerHTML=head+
    '<div class="inv-sumline"><span><b>'+counted+'</b> of '+act.length+' items counted</span><span>Opening = last closing + purchases that day · leave Closing blank for items you did not count.</span></div>'+
    (fromOrders?'<div class="dc-legend"><span class="dc-otag">'+IC.lock+' Orders</span> <b>'+fromOrders+'</b> item'+(fromOrders===1?'':'s')+
      ' used by Petpooja orders — closing is filled in automatically and locked. Tap '+IC.lock+' to unlock and change it.</div>':'')+
    '<div class="inv-tools stock"><div class="search"><input type="search" placeholder="Search items…" value="'+esc(dayQ)+'" oninput="dayQ=this.value;filterDay()"></div>'+
      '<div class="fld"><select onchange="dayCat=this.value;filterDay()"><option value="ALL">All categories</option>'+cats.map(c=>'<option'+(c===dayCat?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select></div>'+
      '<div class="seg"><button type="button" class="'+(dayView==='table'?'sel':'')+'" onclick="setDayView(\'table\')">Table</button><button type="button" class="'+(dayView==='cards'?'sel':'')+'" onclick="setDayView(\'cards\')">Cards</button></div></div>'+
    (dayView==='table'?dayTable(groups):
      '<div class="dc-head"><span>Item</span><span>Opening</span><span>Purchased</span><span>Wastage</span><span>Closing</span><span>Used</span></div>'+
      Object.keys(groups).sort().map(c=>{const done=groups[c].filter(i=>day.counted[i.id]||day.orders[i.id]).length;
        return accSection('daily',c,c,done+' / '+groups[c].length+' counted',groups[c].map(dayRow).join(''));}).join(''))+
    '<div class="dc-save"><span id="dcDirty"></span><button class="save" id="dcSave" onclick="saveDay()" disabled>Save '+esc(fmtDay(dayK))+'</button></div>';
  filterDay();
}
// Items used by recorded Petpooja orders: closing = opening − order usage + purchased − wastage,
// filled in automatically and locked (read-only), so the count comes only from the orders.
// The lock button unlocks it for a manual count (anything extra is saved as usage); locking again restores the auto value.
let dayUnlocked=new Set();
const fromOrders=id=>!!(day&&day.orders[id]);
const dayLocked=id=>fromOrders(id)&&!dayUnlocked.has(id);
function toggleLock(id){
  const c=document.getElementById('dc_'+id),row=document.getElementById('dr_'+id);if(!c)return;
  if(dayLocked(id)){dayUnlocked.add(id);c.readOnly=false;c.removeAttribute('tabindex');c.classList.remove('locked');c.focus();c.select();}
  else{dayUnlocked.delete(id);c.readOnly=true;c.tabIndex=-1;c.classList.add('locked');
    const auto=r3(dayExpected(id));if(Number(c.value)!==auto){c.value=auto;dayInput(id);}}
  row.classList.toggle('unlocked',!dayLocked(id));
  const lbl=row.querySelector('.dc-f.lock small');if(lbl)lbl.textContent=dayLocked(id)?'Closing · auto':'Closing · manual';
  if(row.tagName==='TR'){const c2=row.querySelector('.dc-f.lock input');if(c2)c2.title=dayLocked(id)?'Filled from Petpooja orders':'Manual count';}
  const b=document.getElementById('dl_'+id);if(b){b.innerHTML=dayLocked(id)?IC.lock:IC.unlock;b.title=dayLocked(id)?'Unlock to change the closing':'Lock again (use the value from orders)';}
  drawUsed(id);
}
// Pieces of one register row, shared by the Cards and Table views (same input ids, so all the logic is shared)
// Opening shown = last closing + that day's purchases (Purchased box + Stock-tab purchases); Used = Opening − Wastage − Closing
const dayBuy=id=>day.buy[id]||0;
function dayOpening(id){const e=document.getElementById('dp_'+id),p=e?(e.value===''?0:Number(e.value)):(day.p[id]||0);return r3(day.opening[id]+p+dayBuy(id));}
function dayParts(i){
  const id=i.id,o=day.opening[id],oth=day.other[id],p=day.p[id],wv=day.w[id],ordQ=day.orders[id]||0,buy=dayBuy(id),rest=r3(oth+ordQ-buy);
  const oShow=r3(o+(p||0)+buy);
  const locked=ordQ>0;
  const c=locked?r3(o+oth+(p||0)-(wv||0)-(day.used[id]||0)):day.counted[id]?r3(o+oth+(p||0)-(wv||0)-(day.used[id]||0)):null;
  const inp=(f,v,ph)=>'<input id="d'+f+'_'+id+'" type="number" min="0" step="any" inputmode="decimal" value="'+(v==null?'':v)+'" placeholder="'+ph+'" oninput="dayInput(\''+id+'\')">';
  const closing=locked?'<span class="dc-lockbox"><input id="dc_'+id+'" type="number" min="0" step="any" inputmode="decimal" value="'+c+'" readonly tabindex="-1" class="locked" oninput="dayInput(\''+id+'\')" title="Filled from Petpooja orders">'+
      '<button type="button" class="dc-lockbtn" id="dl_'+id+'" onclick="event.preventDefault();toggleLock(\''+id+'\')" title="Unlock to change the closing" aria-label="Lock or unlock closing">'+IC.lock+'</button></span>':inp('c',c,'count');
  const bought=buy?'<small class="dc-buy">+'+num(buy)+' Purchase</small>':'';
  const note=(locked?' <span class="dc-otag">'+IC.lock+' Orders −'+num(ordQ)+'</span>':'')+(rest?' <span class="dc-oth">'+(rest>0?'+':'−')+num(Math.abs(rest))+' other</span>':'');
  return {id,o,oShow,locked,p:inp('p',p,'0')+bought,w:inp('w',wv,'0'),closing,note,rest,ordQ};
}
function dayRow(i){
  const x=dayParts(i),{id,o,locked,closing,ordQ,rest}=x;
  return '<div class="dc-row'+(locked?' orders counted':'')+'" data-name="'+esc(i.name.toLowerCase())+'" id="dr_'+id+'">'+
    '<div class="dc-name"><b>'+esc(i.name)+'</b><small>'+esc(i.unit)+
      (locked?' · <span class="dc-otag">'+IC.lock+' Orders −'+num(ordQ)+'</span>':'')+
      (rest?' · '+(rest>0?'+':'−')+num(Math.abs(rest))+' from other entries':'')+'</small></div>'+
    '<div class="dc-open"><small>Opening</small><span id="do_'+id+'">'+num(x.oShow)+'</span></div>'+
    '<label class="dc-f"><small>Purchased</small>'+x.p+'</label>'+
    '<label class="dc-f"><small>Wastage</small>'+x.w+'</label>'+
    '<label class="dc-f'+(locked?' lock':'')+'"><small>Closing'+(locked?' · auto':'')+'</small>'+closing+'</label>'+
    '<div class="dc-used" id="du_'+id+'"></div></div>';
}
// Table view: one sortable-looking data table like the Stock tab (category order, Sr. + Item fixed on the left)
let dayView='cards';try{dayView=localStorage.getItem('inv.dayView')||'cards';}catch(e){}
function setDayView(v){dayView=v;try{localStorage.setItem('inv.dayView',v);}catch(e){}renderDaily();}
// Table view — same as the Stock table: sortable headings (the sorted one highlighted), Sr. + Item fixed,
// a Status column and a totals row. Re-sorting keeps anything typed but not saved yet.
let daySort={key:'category',dir:1};
const dayStatusOf=id=>dayLocked(id)||fromOrders(id)?'orders':document.getElementById('dc_'+id)&&document.getElementById('dc_'+id).value!==''?'counted':(day.counted[id]?'counted':'none');
const DAY_COLS=[
  {k:'name',l:'Item',v:i=>i.name.toLowerCase()},
  {k:'category',l:'Category',v:i=>(i.category||'Other').toLowerCase()+'\u0000'+i.name.toLowerCase()},
  {k:'opening',l:'Opening',num:1,v:i=>dayOpening(i.id)},
  {k:'p',l:'Purchased'},{k:'w',l:'Wastage'},{k:'c',l:'Closing'},
  {k:'status',l:'Status',v:i=>({none:0,counted:1,orders:2})[dayStatusOf(i.id)]},
  {k:'used',l:'Used',num:1,v:i=>{const v=dayVals(i.id);return fromOrders(i.id)?day.orders[i.id]+(v.c==null?0:r3(dayExpected(i.id)-v.c)):v.c==null?0:r3(dayExpected(i.id)-v.c);}}
];
function dayTable(groups){
  const list=Object.values(groups).flat();
  const col=DAY_COLS.find(c=>c.k===daySort.key&&c.v)||DAY_COLS[1];
  // Used / Status read the values on screen (or the saved day when the table is first drawn)
  const rows=[...list].sort((a,b)=>{const x=col.v(a),y=col.v(b);return (x<y?-1:x>y?1:a.name.localeCompare(b.name))*daySort.dir;});
  const status={none:'<span class="st-chip">Not counted</span>',counted:'<span class="st-chip in">Counted</span>',orders:'<span class="st-chip ord">'+IC.lock+' Orders</span>'};
  const head='<th class="sr">Sr.</th>'+DAY_COLS.map(c=>c.v?'<th class="'+(c.num?'num ':'')+(c.k==='name'?'nmh ':'')+'sortable'+(c.k===daySort.key?' sorted':'')+'" onclick="sortDay(\''+c.k+'\')">'+c.l+
      (c.k===daySort.key?' <span class="arr">'+(daySort.dir>0?'▲':'▼')+'</span>':'')+'</th>':'<th>'+c.l+'</th>').join('');
  let counted=0,orders=0;
  const body=rows.map((i,n)=>{const x=dayParts(i),st=x.locked?'orders':day.counted[i.id]?'counted':'none';if(st==='orders')orders++;else if(st==='counted')counted++;
    return '<tr class="dc-row'+(x.locked?' orders counted':day.counted[i.id]?' counted':'')+'" id="dr_'+x.id+'" data-name="'+esc(i.name.toLowerCase())+'" data-cat="'+esc(i.category||'Other')+'">'+
      '<td class="sr">'+(n+1)+'</td><td class="nm"><b>'+esc(i.name)+'</b> <small>'+esc(i.unit)+'</small>'+(x.note?'<div class="dc-notes">'+x.note+'</div>':'')+'</td>'+
      '<td>'+esc(i.category||'Other')+'</td><td class="num dc-open"><b id="do_'+x.id+'">'+num(x.oShow)+'</b> <small>'+esc(i.unit)+'</small></td>'+
      '<td class="dc-f">'+x.p+'</td><td class="dc-f">'+x.w+'</td><td class="dc-f'+(x.locked?' lock':'')+'">'+x.closing+'</td>'+
      '<td class="dc-st" id="ds_'+x.id+'">'+status[st]+'</td><td class="dc-used num" id="du_'+x.id+'"></td></tr>';}).join('');
  return '<div class="att-card inv-tablecard dc-tablecard"><div class="tbl-scroll"><table class="att-table inv-table dc-table"><thead><tr>'+head+'</tr></thead><tbody>'+body+
    '<tr class="tot"><td class="sr"></td><td class="nm">'+rows.length+' item'+(rows.length===1?'':'s')+'</td><td colspan="5"></td>'+
      '<td colspan="2">'+(counted+orders)+' counted'+(orders?' · '+orders+' from orders':'')+'</td></tr>'+
    '</tbody></table></div></div><p class="att-foot">Tap a column heading to sort. Anything typed but not saved yet is kept.</p>';
}
function sortDay(k){
  daySort=daySort.key===k?{key:k,dir:-daySort.dir}:{key:k,dir:1};
  // keep typed values and unlocked rows across the re-render
  const keep={};dayDirty.forEach(id=>{keep[id]=['p','w','c'].map(f=>{const e=document.getElementById('d'+f+'_'+id);return e?e.value:'';});});
  const act=items.filter(i=>i.active),groups={};act.forEach(i=>(groups[i.category||'Other']=groups[i.category||'Other']||[]).push(i));
  const old=document.querySelector('#dailyWrap .dc-tablecard'),foot=old&&old.nextElementSibling;
  if(!old)return;
  const tmp=document.createElement('div');tmp.innerHTML=dayTable(groups);
  if(foot&&foot.classList.contains('att-foot'))foot.remove();
  old.replaceWith(...tmp.childNodes);
  Object.entries(keep).forEach(([id,[p,w,c]])=>{['p','w','c'].forEach((f,j)=>{const e=document.getElementById('d'+f+'_'+id);if(e)e.value=[p,w,c][j];});});
  dayUnlocked.forEach(id=>{const c=document.getElementById('dc_'+id);if(c){c.readOnly=false;c.classList.remove('locked');c.removeAttribute('tabindex');}
    const r=document.getElementById('dr_'+id);if(r)r.classList.add('unlocked');const b=document.getElementById('dl_'+id);if(b)b.innerHTML=IC.unlock;});
  filterDay();
}
function dayInput(id){dayDirty.add(id);
  const oe=document.getElementById('do_'+id);if(oe)oe.textContent=num(dayOpening(id));   // opening follows the Purchased box
  if(dayLocked(id)){const c=document.getElementById('dc_'+id);if(c&&document.activeElement!==c)c.value=r3(dayExpected(id));}   // locked closing follows purchased / wastage
  drawUsed(id);const b=document.getElementById('dcSave');if(b)b.disabled=false;
  const t=document.getElementById('dcDirty');if(t)t.textContent=dayDirty.size+' item'+(dayDirty.size===1?'':'s')+' changed';}
function drawUsed(id){
  const v=dayVals(id),e=document.getElementById('du_'+id),row=document.getElementById('dr_'+id);if(!e)return;
  const st=document.getElementById('ds_'+id);
  if(st)st.innerHTML=fromOrders(id)?'<span class="st-chip ord">'+IC.lock+' Orders</span>':v.c!=null?'<span class="st-chip in">Counted</span>':'<span class="st-chip">Not counted</span>';
  const it=itemById(id),exp=dayExpected(id);
  if(fromOrders(id)){   // used = what the orders took + anything extra from a manual (unlocked) count
    const extra=v.c==null?0:r3(exp-v.c),o=day.orders[id];
    e.innerHTML='<small>Used</small><b>'+num(r3(o+extra))+'</b> <span class="u">'+esc(it.unit)+'</span> '+
      (extra?'<span class="dc-extra">'+num(o)+' orders '+(extra>0?'+ '+num(extra):'− '+num(-extra))+' counted</span>':'<span class="dc-otag sm">orders</span>');return;
  }
  row.classList.toggle('counted',v.c!=null);
  if(v.c==null){e.innerHTML='<small>Used</small><b class="muted">0</b> <span class="u">'+esc(it.unit)+'</span>';return;}   // nothing counted yet → 0
  const used=r3(exp-v.c);
  e.innerHTML='<small>Used</small>'+(used>=0?'<b>'+num(used)+'</b>':'<b class="neg" title="Closing is more than opening + purchased − wastage">+'+num(-used)+'</b>')+' <span class="u">'+esc(it.unit)+'</span>';
}
function filterDay(){
  const q=dayQ.trim().toLowerCase();
  document.querySelectorAll('#dailyWrap tr.dc-row').forEach(r=>{r.hidden=!((!q||r.dataset.name.includes(q))&&(dayCat==='ALL'||r.dataset.cat===dayCat));});
  document.querySelectorAll('#dailyWrap .cat-acc').forEach(g=>{
    let any=false;
    g.querySelectorAll('.dc-row').forEach(r=>{const ok=(!q||r.dataset.name.includes(q))&&(dayCat==='ALL'||g.dataset.cat===dayCat);r.hidden=!ok;if(ok)any=true;});
    g.hidden=!any;
    if(any&&(q||dayCat!=='ALL'))g.open=true;   // show search / category matches
  });
  items.filter(i=>i.active).forEach(i=>drawUsed(i.id));
}
function confirmLeaveDay(){return !dayDirty.size||confirm('You have unsaved counts for '+fmtDay(dayK)+'. Leave without saving?');}
function goDay(k){if(!k||k>today())return;if(!confirmLeaveDay())return renderDaily();dayK=k;dayDirty=new Set();renderDaily();}
// ---- Themed date picker for the Daily count (instead of the browser's date box) ----
let dpY=null,dpM=null;
function toggleDayPicker(e){
  e.stopPropagation();
  const pop=document.getElementById('dpPop');if(!pop)return;
  if(!pop.hidden){pop.hidden=true;return;}
  dpY=+dayK.slice(0,4);dpM=+dayK.slice(5,7)-1;drawDayPicker();pop.hidden=false;
}
function drawDayPicker(){
  const pop=document.getElementById('dpPop');if(!pop)return;
  const t=today(),mk=dpY+'-'+pad(dpM+1),lead=(new Date(dpY,dpM,1).getDay()+6)%7,n=new Date(dpY,dpM+1,0).getDate();
  let cells=['Mo','Tu','We','Th','Fr','Sa','Su'].map(d=>'<span class="dp-wd">'+d+'</span>').join('');
  for(let i=0;i<lead;i++)cells+='<span></span>';
  for(let d=1;d<=n;d++){const k=mk+'-'+pad(d);
    cells+='<button type="button" class="dp-day'+(k===dayK?' sel':'')+(k===t?' today':'')+'"'+(k>t?' disabled':' onclick="pickDay(\''+k+'\')"')+'>'+d+'</button>';}
  pop.innerHTML='<div class="dp-head"><button type="button" class="dp-nav" onclick="dpShift(-1,event)" aria-label="Previous month">'+IC.prev+'</button>'+
      '<b>'+MONTHS[dpM]+' '+dpY+'</b><button type="button" class="dp-nav" onclick="dpShift(1,event)" aria-label="Next month"'+(mk>=t.slice(0,7)?' disabled':'')+'>'+IC.next+'</button></div>'+
    '<div class="dp-grid">'+cells+'</div>'+
    '<div class="dp-foot"><button type="button" onclick="pickDay(today())">Today</button><button type="button" onclick="document.getElementById(\'dpPop\').hidden=true">Close</button></div>';
}
function dpShift(n,e){e.stopPropagation();dpM+=n;if(dpM<0){dpM=11;dpY--;}if(dpM>11){dpM=0;dpY++;}drawDayPicker();}
function pickDay(k){const pop=document.getElementById('dpPop');if(pop)pop.hidden=true;if(k!==dayK)goDay(k);}
document.addEventListener('click',e=>{const pop=document.getElementById('dpPop');if(pop&&!pop.hidden&&!e.target.closest('.dp-wrap'))pop.hidden=true;});
document.addEventListener('keydown',e=>{const pop=document.getElementById('dpPop');if(e.key==='Escape'&&pop&&!pop.hidden)pop.hidden=true;});
function shiftDay(n){const d=new Date(dayK+'T00:00');d.setDate(d.getDate()+n);goDay(dayKey(d));}
async function saveDay(){
  const rows=[];
  for(const id of dayDirty){
    const v=dayVals(id),it=itemById(id);
    if([v.p,v.w,v.c].some(x=>x!=null&&x<0))return toast('Numbers cannot be negative ('+it.name+')',true);
    rows.push({item_id:id,purchased:v.p,wastage:v.w,used:v.c==null?null:r3(dayExpected(id)-v.c),unit_cost:v.p&&it.last_cost!=null?Number(it.last_cost):null});
  }
  if(!rows.length)return;
  const b=document.getElementById('dcSave');b.disabled=true;b.textContent='Saving…';
  const {error}=await sb.rpc('inv_save_day',{p_day:dayK,p_rows:rows});
  if(error){b.disabled=false;b.textContent='Save '+fmtDay(dayK);return toast(dbErr(error),true);}
  toast('Saved '+rows.length+' item'+(rows.length===1?'':'s')+' for '+fmtDay(dayK));
  dayDirty=new Set();day=null;await afterChange();
}

// ============================================================
// Daily → From Petpooja orders: load an Order Report export, see what it used for every
// inventory item (0 where nothing), and record it as "Used" for that date (source 'orders').
// Recording a day again replaces that day's order usage. Rules live in packaging.js.
// ============================================================
let dailyMode='count';
const ord={res:null,file:'',day:null,recorded:new Set(),submittedTo:null};
// Upload + Submit bar at the top of the Daily count
function ordersBar(){
  const days=ord.res?Object.keys(ord.res.days).sort():[];
  let info='Upload the Petpooja “Order Report” Excel, then Submit — packaging &amp; items used by all its orders are filled in on the day shown below.';
  if(days.length){
    const used=Object.keys(ordersUseAll()).length,orders=days.reduce((a,x)=>a+ord.res.days[x].orders,0);
    const done=ord.submittedTo===dayK;
    info='<b>'+esc(ord.file)+'</b> · '+(days.length>1?fmtDay(days[0])+' – '+fmtDay(days[days.length-1]):fmtDay(days[0]))+' · '+orders+' orders · <b>'+used+'</b> items to update'+
      (done?' · <b class="rec">Submitted on '+esc(fmtDay(dayK))+' ✓</b>':' · Submit records it on <b>'+esc(fmtDay(dayK))+'</b>');
  }
  return '<div class="att-card dc-upload"><div class="dcu-h">'+IC.box+'<b>Petpooja orders</b>'+(ord.res?'<button type="button" class="mini" onclick="openOrders()">View details</button>':'')+'</div>'+
    '<p class="dcu-info">'+info+'</p>'+
    '<div class="dcu-acts"><label class="att-btn dcu-file"><input type="file" accept=".xlsx,.xls" hidden onchange="ordersLoad(this.files[0])">'+IC.dl+' '+(ord.res?'Change Excel':'Upload Excel')+'</label>'+
      '<button type="button" class="save dcu-submit" onclick="submitOrders()"'+(days.length?'':' disabled')+'>'+IC.check+' Submit</button></div></div>';
}
// Submit puts the usage of every order in the file (all its days together) on the day open in the Daily count.
async function submitOrders(){
  if(!ord.res||!Object.keys(ord.res.days).length)return toast('Upload a Petpooja order Excel first',true);
  const k=dayK||today();
  if(k>today())return toast('Cannot record future dates',true);
  if(!confirmLeaveDay())return;
  const {data:prev,error:e1}=await sb.from('inv_moves').select('id').eq('source','orders').eq('moved_on',k).limit(1);
  if(e1)return toast(dbErr(e1),true);
  if(prev&&prev.length&&!confirm('Order usage for '+fmtDay(k)+' was already recorded. Replace it with this file?'))return;
  const rows=Object.entries(ordersUseAll()).filter(([,q])=>q>0).map(([item_id,qty])=>({item_id,qty}));
  const {error}=await sb.rpc('inv_record_orders',{p_day:k,p_rows:rows});
  if(error)return toast(dbErr(error),true);
  dayDirty=new Set();dayK=k;day=null;ord.submittedTo=k;ord.recorded.add(k);
  toast('Recorded '+rows.length+' item'+(rows.length===1?'':'s')+' used on '+fmtDay(k));
  await afterChange();
}
function openOrders(){if(!confirmLeaveDay())return;dailyMode='orders';dayDirty=new Set();renderDaily();window.scrollTo({top:0});}
function backToCount(){dailyMode='count';if(ord.day)dayK=ord.day;day=null;renderDaily();window.scrollTo({top:0});}
async function ordersLoad(file){
  if(!file)return;
  if(!window.XLSX||!window.PACKAGING_LOGIC)return toast('Could not load the Excel reader — check your internet connection',true);
  try{
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:null});
    const res=PACKAGING_LOGIC.analyse(rows),days=Object.keys(res.days).sort();
    if(!days.length)return toast('No orders found in this file',true);
    ord.res=res;ord.file=file.name;ord.day=days[days.length-1];ord.submittedTo=null;
    await ordersRecorded();renderDaily();toast('Loaded '+days.length+' day'+(days.length===1?'':'s')+' of orders — press Submit to update the count');
  }catch(e){toast(e.message||String(e),true);}
}
async function ordersRecorded(){
  ord.recorded=new Set();
  const days=ord.res?Object.keys(ord.res.days).sort():[];if(!days.length)return;
  const {data}=await sb.from('inv_moves').select('moved_on').eq('source','orders').gte('moved_on',days[0]).lte('moved_on',days[days.length-1]);
  (data||[]).forEach(m=>ord.recorded.add(m.moved_on));
}
// inventory item → qty used by every order in the file, all days together
function ordersUseAll(){
  const by={};Object.keys(ord.res?ord.res.days:{}).forEach(x=>Object.entries(ordersUse(x)).forEach(([id,q])=>by[id]=(by[id]||0)+q));
  return by;
}
// inventory item → qty used on a day (matched by name)
function ordersUse(k){
  const use=ord.res&&ord.res.days[k]?ord.res.days[k].use:{},by={};
  Object.entries(use).forEach(([name,q])=>{const it=items.find(i=>PACKAGING_LOGIC.norm(i.name)===PACKAGING_LOGIC.norm(name));if(it)by[it.id]=(by[it.id]||0)+q;});
  return by;
}
function renderOrders(){
  const w=document.getElementById('dailyWrap'),L=window.PACKAGING_LOGIC;
  const days=ord.res?Object.keys(ord.res.days).sort():[],k=ord.day,d=k&&ord.res.days[k];
  const by=ordersUse(k),act=items.filter(i=>i.active);
  const missing=L?L.ITEMS.filter(n=>!items.some(i=>L.norm(i.name)===L.norm(n))):[];
  const groups={};act.forEach(i=>(groups[i.category||'Other']=groups[i.category||'Other']||[]).push(i));
  const usedItems=act.filter(i=>by[i.id]).length,future=k&&k>today();
  const rule=i=>{const n=L&&L.ITEMS.find(x=>L.norm(x)===L.norm(i.name));return n?L.RULE[n]:'';};
  w.innerHTML='<div class="page-head">'+IC.box+'<h2>Usage from orders</h2><button class="mini" onclick="backToCount()">'+IC.prev+' Daily count</button></div>'+
    '<label class="pk-drop"><input type="file" id="ordFile" accept=".xlsx,.xls" hidden onchange="ordersLoad(this.files[0])">'+
      '<b>'+(ord.res?'Load another Petpooja export':'Choose a Petpooja “Order Report” export')+'</b>'+
      '<span>'+(ord.res?esc(ord.file)+' · ':'')+'Read on this device only — customer details are never shown or saved.</span></label>'+
    (days.length>1?'<div class="ord-days">'+days.map(x=>'<button type="button" class="'+(x===k?'sel':'')+'" onclick="ord.day=\''+x+'\';renderDaily()">'+
      new Date(x+'T00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'})+(ord.recorded.has(x)?' ✓':'')+'</button>').join('')+'</div>':'')+
    (d?'<div class="inv-sumline"><span><b>'+fmtDay(k)+'</b> · '+d.orders+' orders ('+d.online+' online)</span><span><b>'+usedItems+'</b> of '+act.length+' items used'+
      (ord.recorded.has(k)?' · <b class="rec">Recorded ✓</b> (recording again replaces it)':'')+'</span></div>':
      '<div class="inv-sumline"><span>All '+act.length+' items are listed below with 0 until you load an export.</span></div>')+
    (missing.length?'<div class="att-empty">Not found in inventory (add these items to count them): '+missing.map(esc).join(', ')+'</div>':'')+
    (()=>{const cats=Object.keys(groups).sort(),withUse=cats.filter(c=>groups[c].some(i=>by[i.id]));
      if(ord.accKey!==k){delete accOpen.orders;ord.accKey=k;}   // a new day opens its categories with usage
      return cats.map(c=>{const n=groups[c].filter(i=>by[i.id]).length;
        return accSection('orders',c,c,n?n+' used':'0 used','<div class="tbl-scroll"><table class="att-table inv-table ord-table"><thead><tr><th>Item</th><th class="num">Used by orders</th><th>From</th><th class="num">In stock</th><th class="num">After recording</th></tr></thead><tbody>'+
          groups[c].map(i=>{const q=by[i.id]||0;
            return '<tr class="'+(q?'used':'zero')+'"><td class="nm"><b>'+esc(i.name)+'</b></td><td class="num"><b>'+num(q)+'</b> <small>'+esc(i.unit)+'</small></td>'+
              '<td><small>'+(q?esc(rule(i)):'')+'</small></td><td class="num">'+num(i.stock)+'</td><td class="num">'+(q&&!ord.recorded.has(k)?num(Number(i.stock)-q):'<span class="muted">—</span>')+'</td></tr>';}).join('')+
          '</tbody></table></div>',withUse.length?withUse:cats.slice(0,1));}).join('');})()+
    (ord.res&&Object.keys(ord.res.unmapped).length?'<h3 class="att-sub">Order items with no packaging rule</h3><div class="att-card"><div class="pk-unmapped">'+
      Object.entries(ord.res.unmapped).sort((a,b)=>b[1]-a[1]).map(([n,q])=>'<span class="pk-chip">'+q+' × '+esc(n)+'</span>').join(' ')+'</div></div>':'')+
    (d?'<div class="att-actions"><button class="att-btn" onclick="recordOrders([ord.day])"'+(future||!usedItems?' disabled':'')+'>'+IC.check+' Record usage for '+esc(fmtDay(k))+'</button>'+
      (days.length>1?'<button class="att-btn" onclick="recordOrders(Object.keys(ord.res.days).sort())">'+IC.check+' Record all '+days.length+' days</button>':'')+'</div>':'')+
    '<p class="att-foot">“Used by orders” follows the packaging rules for online and in-store orders (waffle boxes, cones, pancake boxes, forks, bowls, spoons, glasses, straws, stick covers/trays, water bottles). '+
      'Recorded usage is saved as “Used” for that date; on the Daily count those items show the closing filled in automatically and locked.</p>';
}
async function recordOrders(dayList){
  dayList=dayList.filter(x=>x<=today());
  if(!dayList.length)return toast('Cannot record future dates',true);
  const again=dayList.filter(x=>ord.recorded.has(x));
  if(again.length&&!confirm('Usage for '+again.map(fmtDay).join(', ')+' was already recorded. Replace it?'))return;
  let n=0;
  for(const x of dayList){
    const rows=Object.entries(ordersUse(x)).filter(([,q])=>q>0).map(([item_id,qty])=>({item_id,qty}));
    const {error}=await sb.rpc('inv_record_orders',{p_day:x,p_rows:rows});
    if(error)return toast(dbErr(error),true);
    n+=rows.length;ord.recorded.add(x);
  }
  toast('Recorded '+n+' item'+(n===1?'':'s')+' used on '+dayList.length+' day'+(dayList.length===1?'':'s'));
  await afterChange();
}

// Category accordions (Stock cards, Daily count, Usage from orders) — same look as the History weeks.
// Open/closed state is remembered per screen; by default only the first category (or `defaults`) is open.
const accOpen={};
function accSection(view,key,title,meta,body,defaults){
  if(!accOpen[view])accOpen[view]=new Set(defaults||[key]);
  return '<details class="att-card hist-week cat-acc" data-cat="'+esc(key)+'"'+(accOpen[view].has(key)?' open':'')+' ontoggle="accToggle(\''+view+'\',this)">'+
    '<summary><span class="hw-ic">'+IC.box+'</span><span class="hw-title">'+esc(title)+'</span>'+(meta?'<span class="hw-meta">'+meta+'</span>':'')+'<span class="hw-chev">'+IC.next+'</span></summary>'+
    '<div class="acc-body">'+body+'</div></details>';
}
function accToggle(view,el){if(!accOpen[view])accOpen[view]=new Set();if(el.open)accOpen[view].add(el.dataset.cat);else accOpen[view].delete(el.dataset.cat);}

// History is grouped by week (Mon–Sun) into accordions; the latest week is open by default.
// Weeks you open or close stay that way while you change filters (until the month changes).
let histOpen=null, histOpenKey='';
const weekStart=k=>{const d=new Date(k+'T00:00');d.setDate(d.getDate()-((d.getDay()+6)%7));return dayKey(d);};
function historyWeeks(byDay){
  const weeks={};Object.keys(byDay).forEach(k=>(weeks[weekStart(k)]=weeks[weekStart(k)]||[]).push(k));
  const starts=Object.keys(weeks).sort().reverse(),key=calY+'-'+calM;
  if(histOpenKey!==key||!histOpen){histOpen=new Set(starts.slice(0,1));histOpenKey=key;}
  const short=k=>new Date(k+'T00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  return starts.map(ws=>{
    const days=weeks[ws].sort().reverse(),all=days.flatMap(k=>byDay[k]);
    const we=new Date(ws+'T00:00');we.setDate(we.getDate()+6);
    const spend=all.reduce((a,m)=>a+(m.kind==='in'&&m.unit_cost!=null?Number(m.unit_cost)*Number(m.qty):0),0);
    return '<details class="att-card hist-week"'+(histOpen.has(ws)?' open':'')+' ontoggle="histToggle(\''+ws+'\',this.open)">'+
      '<summary><span class="hw-ic">'+IC.cal+'</span><span class="hw-title">Week of '+short(ws)+' – '+short(dayKey(we))+'</span>'+
        '<span class="hw-meta">'+all.length+' entr'+(all.length===1?'y':'ies')+(spend?' · '+rupees0(spend):'')+'</span><span class="hw-chev">'+IC.next+'</span></summary>'+
      days.map(k=>'<div class="day-lbl">'+fmtDay(k)+'</div><div class="inv-day">'+byDay[k].map(m=>moveRow(m,true)).join('')+'</div>').join('')+
    '</details>';
  }).join('');
}
function histToggle(ws,open){if(!histOpen)histOpen=new Set();if(open)histOpen.add(ws);else histOpen.delete(ws);}

// ============================================================
// History tab — every stock movement in a month
// ============================================================
function monthBar(){
  const title=view==='year'&&tab==='report'?String(calY):MONTHS[calM]+' '+calY;
  return '<div class="cal-bar"><button type="button" class="cal-nav" aria-label="Previous" onclick="shiftPeriod(-1)">'+IC.prev+'</button>'+
    '<div class="cal-title">'+title+'</div><button type="button" class="cal-nav" aria-label="Next" onclick="shiftPeriod(1)">'+IC.next+'</button></div>';
}
function shiftPeriod(d){
  if(view==='year'&&tab==='report')calY+=d;else{calM+=d;if(calM<0){calM=11;calY--;}if(calM>11){calM=0;calY++;}}
  renderTab();
}
async function renderHistory(){
  const w=document.getElementById('historyWrap');
  if(!authed){w.innerHTML=loginCard();return;}
  if(baseErr){w.innerHTML='<div class="page-head">'+IC.hist+'<h2>History</h2></div><div class="att-empty">'+esc(baseErr)+'</div>';return;}
  const head='<div class="page-head">'+IC.hist+'<h2>History</h2></div>'+monthBar();
  if(!(await loadMoves('month'))){w.innerHTML=head+'<div class="att-empty">Could not load entries.</div>';return;}
  if(tab!=='history')return;
  const list=moves.filter(m=>(histItem==='ALL'||m.item_id===histItem)&&(histKind==='ALL'||m.kind===histKind));
  const byDay={};list.forEach(m=>(byDay[m.moved_on]=byDay[m.moved_on]||[]).push(m));
  const spend=list.reduce((a,m)=>a+(m.kind==='in'&&m.unit_cost!=null?Number(m.unit_cost)*Number(m.qty):0),0);
  window._detailMoves=[];
  w.innerHTML=head+
    '<div class="inv-tools two"><div class="fld"><select onchange="histItem=this.value;renderHistory()"><option value="ALL">All items</option>'+
      items.map(i=>'<option value="'+i.id+'"'+(histItem===i.id?' selected':'')+'>'+esc(i.name)+'</option>').join('')+'</select></div>'+
      '<div class="fld"><select onchange="histKind=this.value;renderHistory()"><option value="ALL">All types</option>'+
      Object.entries(KINDS).map(([k,v])=>'<option value="'+k+'"'+(histKind===k?' selected':'')+'>'+v.label+'</option>').join('')+'</select></div></div>'+
    '<div class="inv-sumline"><span>'+list.length+' entr'+(list.length===1?'y':'ies')+'</span><span>Purchases: <b>'+rupees0(spend)+'</b></span></div>'+
    (Object.keys(byDay).length?historyWeeks(byDay)
      :'<div class="att-empty">No stock entries in '+MONTHS[calM]+'.</div>')+
    '<div class="att-actions"><button class="att-btn" onclick="moveForm(\'in\')">'+IC.plus+' Stock in</button><button class="att-btn" onclick="moveForm(\'out\')">'+IC.minus+' Stock out</button></div>';
}

// ============================================================
// Daily → Purchases upload — purchases for one or many days from an Excel sheet in the same layout as the
// stock register (one sheet per month named like "September 2026"; Category · Vendor · Material Name,
// then a group of columns per day with a "Stock purchased" column — or just one purchase column per day).
// Recorded as 'in' entries (source 'purchase') by inv_record_purchases, which replaces the Excel purchases
// of every date the sheet covers, so uploading the same sheet again simply updates it.
// Shown on the Daily count as part of Opening (“+x Purchase”) and added to In stock.
// ============================================================
const pur={file:'',res:null,busy:false};
const normName=s=>String(s==null?'':s).replace(/\s+/g,' ').trim().toLowerCase();
// workbook → {days:{'YYYY-MM-DD':[{item, qty, supplier_id, unit_cost}]}, covered:[dates], unmatched:{name:qty}, sheets:[names], future}
function purchaseAnalyse(wb){
  const byName={};items.forEach(i=>{byName[normName(i.name)]=i;});
  const supByName={};sups.forEach(s=>{supByName[normName(s.name)]=s;});
  const MON=MONTHS.map(m=>m.toLowerCase());
  const days={},covered=new Set(),unmatched={},used=[];let future=0;
  const add=(k,it,q,vendor)=>{const list=days[k]||(days[k]=[]);let r=list.find(x=>x.item.id===it.id);
    if(!r){const s=supByName[normName(vendor)];list.push(r={item:it,qty:0,supplier_id:s?s.id:it.supplier_id||null,unit_cost:it.last_cost!=null?Number(it.last_cost):null});}
    r.qty=r3(r.qty+q);};
  wb.SheetNames.forEach(sn=>{
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:null});
    const h=rows.slice(0,10).findIndex(r=>r&&r.some(c=>normName(c)==='material name'));if(h<0)return;
    const H=rows[h].map(normName),nameC=H.indexOf('material name'),vendC=H.indexOf('vendor');
    const m=String(sn).trim().match(/^([a-z]+)\s+(\d{4})$/i),mi=m?MON.indexOf(m[1].toLowerCase()):-1;
    // day labels in the header row: "1st", "2", or a real date
    const dayAt={};
    rows[h].forEach((c,j)=>{
      if(j<=nameC||c==null)return;
      if(typeof c==='number'&&c>30000){const d=XLSX.SSF.parse_date_code(c);dayAt[j]=d.y+'-'+pad(d.m)+'-'+pad(d.d);return;}
      const x=String(c).trim().match(/^(\d{1,2})(st|nd|rd|th)?$/i);
      if(x&&mi>=0&&+x[1]>=1&&+x[1]<=new Date(+m[2],mi+1,0).getDate())dayAt[j]=m[2]+'-'+pad(mi+1)+'-'+pad(+x[1]);
    });
    if(!Object.keys(dayAt).length)return;
    const sub=(rows[h+1]||[]).map(normName),hasSub=sub.some(c=>/purchas/.test(c));
    const cols=[];let cur=null;
    for(let j=nameC+1;j<Math.max(rows[h].length,sub.length);j++){
      if(dayAt[j])cur=dayAt[j];
      if(!cur)continue;
      if(hasSub?/purchas/.test(sub[j]||''):dayAt[j])cols.push([j,cur]);
    }
    if(!cols.length)return;
    used.push(sn);
    cols.forEach(([,k])=>{if(k>today())future++;else covered.add(k);});
    rows.slice(h+(hasSub?2:1)).forEach(r=>{
      if(!r||r[nameC]==null||String(r[nameC]).trim()==='')return;
      const name=String(r[nameC]).replace(/\s+/g,' ').trim(),it=byName[normName(name)];
      cols.forEach(([j,k])=>{
        const q=Number(r[j]);if(!(q>0)||k>today())return;
        if(!it){unmatched[name]=r3((unmatched[name]||0)+q);return;}
        add(k,it,q,vendC>=0?r[vendC]:'');
      });
    });
  });
  return {days,covered:[...covered].sort(),unmatched,sheets:used,future};
}
async function purchaseLoad(file){
  if(!file)return;
  if(!window.XLSX)return toast('Could not load the Excel reader — check your internet connection',true);
  try{
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
    const res=purchaseAnalyse(wb);
    if(!res.sheets.length)return toast('No sheet with a “Material Name” column and day columns was found',true);
    if(!res.covered.length)return toast('This sheet only has future dates — nothing to record',true);
    pur.res=res;pur.file=file.name;renderDaily();
    const n=Object.values(res.days).reduce((a,l)=>a+l.length,0);
    toast(n?'Loaded '+n+' purchase'+(n===1?'':'s')+' — check and press Submit':'No purchases (all 0) in this file');
  }catch(e){toast(e.message||String(e),true);}
}
function purchaseClear(){pur.res=null;pur.file='';renderDaily();}
async function purchaseSubmit(){
  const res=pur.res;if(!res||pur.busy)return;
  const rows=Object.entries(res.days).flatMap(([k,l])=>l.map(r=>({item_id:r.item.id,day:k,qty:r.qty,unit_cost:r.unit_cost,supplier_id:r.supplier_id})));
  const span=fmtDay(res.covered[0])+(res.covered.length>1?' – '+fmtDay(res.covered[res.covered.length-1]):'');
  if(!confirmLeaveDay())return;
  if(!confirm('Record '+rows.length+' purchase'+(rows.length===1?'':'s')+' for '+span+'?\nExcel purchases already uploaded for these dates are replaced.'))return;
  pur.busy=true;const b=document.getElementById('purSubmit');if(b){b.disabled=true;b.textContent='Saving…';}
  const {data,error}=await sb.rpc('inv_record_purchases',{p_days:res.covered,p_rows:rows});
  pur.busy=false;
  if(error){if(b){b.disabled=false;b.innerHTML=IC.check+' Submit';}return toast(dbErr(error),true);}
  toast('Recorded '+(data||0)+' purchase'+(data===1?'':'s')+' — stock updated');
  pur.res=null;pur.file='';
  dayDirty=new Set();dayK=res.covered[res.covered.length-1];day=null;   // show the (last) day from the file
  await afterChange();
}
function purchasePreview(){
  const res=pur.res;if(!res)return '';
  const dayKeys=Object.keys(res.days).sort().reverse(),n=dayKeys.reduce((a,k)=>a+res.days[k].length,0);
  const est=dayKeys.reduce((a,k)=>a+res.days[k].reduce((b,r)=>b+(r.unit_cost!=null?r.qty*r.unit_cost:0),0),0);
  const unm=Object.entries(res.unmatched);
  const span=fmtDay(res.covered[0])+(res.covered.length>1?' – '+fmtDay(res.covered[res.covered.length-1]):'');
  const table=l=>'<div class="tbl-scroll"><table class="att-table"><thead><tr><th>Sr.</th><th>Item</th><th class="num">Qty</th><th>Supplier</th><th class="num">Price</th><th class="num">Total</th></tr></thead><tbody>'+
    l.slice().sort((a,b)=>a.item.name.localeCompare(b.item.name)).map((r,k)=>{const s=supById(r.supplier_id);
      return '<tr><td>'+(k+1)+'</td><td><b>'+esc(r.item.name)+'</b><small class="tshift">'+esc(r.item.category||'Other')+'</small></td><td class="num"><b class="pur-q">+'+qty(r.qty,r.item.unit)+'</b></td>'+
        '<td>'+esc(s?s.name:'—')+'</td><td class="num">'+(r.unit_cost!=null?rupees(r.unit_cost)+'/'+esc(r.item.unit):'—')+'</td><td class="num pay">'+(r.unit_cost!=null?rupees0(r.qty*r.unit_cost):'—')+'</td></tr>';}).join('')+'</tbody></table></div>';
  return '<div class="inv-sumline"><span><b>'+n+'</b> purchase'+(n===1?'':'s')+' on <b>'+dayKeys.length+'</b> day'+(dayKeys.length===1?'':'s')+'</span><span>'+esc(span)+(est?' · approx '+rupees0(est)+' at last price':'')+'</span></div>'+
    (unm.length?'<div class="att-card pur-warn">'+IC.alert+'<div><b>'+unm.length+' name'+(unm.length===1?'':'s')+' not found in inventory — skipped:</b> '+
      unm.map(([nm,q])=>esc(nm)+' ('+num(q)+')').join(', ')+'<small>Add them on the Stock tab (same spelling) and upload again.</small></div></div>':'')+
    (dayKeys.length?dayKeys.map((k,x)=>'<details class="att-card hist-week"'+(x===0?' open':'')+'><summary><span class="hw-ic">'+IC.cal+'</span><span class="hw-title">'+esc(fmtDay(k))+'</span>'+
      '<span class="hw-meta">'+res.days[k].length+' item'+(res.days[k].length===1?'':'s')+'</span><span class="hw-chev">'+IC.next+'</span></summary>'+table(res.days[k])+'</details>').join('')
      :'<div class="att-empty">No purchases above 0 in this file. Submitting clears Excel purchases for '+esc(span)+'.</div>')+
    (res.future?'<p class="att-foot">'+res.future+' future date column'+(res.future===1?'':'s')+' ignored.</p>':'');
}
// Upload + Submit bar at the top of the Daily count (next to Petpooja orders)
function purchaseBar(){
  const res=pur.res,n=res?Object.values(res.days).reduce((a,l)=>a+l.length,0):0,unm=res?Object.keys(res.unmatched).length:0;
  const info=res?'<b>'+esc(pur.file)+'</b> · '+esc(fmtDay(res.covered[0])+(res.covered.length>1?' – '+fmtDay(res.covered[res.covered.length-1]):''))+
      ' · <b>'+n+'</b> purchase'+(n===1?'':'s')+' to add'+(unm?' · <b class="bad">'+unm+' not found</b>':''):
    'Upload the purchase Excel (same layout as the stock register — only the <b>Stock purchased</b> columns are read), then Submit — Opening and In stock go up for each day.';
  return '<div class="att-card dc-upload"><div class="dcu-h">'+IC.cart+'<b>Purchases</b>'+(res?'<button type="button" class="mini" onclick="purchaseDetails()">View details</button><button type="button" class="mini" onclick="purchaseClear()">Clear</button>':'')+'</div>'+
    '<p class="dcu-info">'+info+'</p>'+
    '<div class="dcu-acts"><label class="att-btn dcu-file"><input type="file" accept=".xlsx,.xls" hidden onchange="purchaseLoad(this.files[0]);this.value=\'\'">'+IC.dl+' '+(res?'Change Excel':'Upload Excel')+'</label>'+
      '<button type="button" class="save dcu-submit" id="purSubmit" onclick="purchaseSubmit()"'+(res?'':' disabled')+'>'+IC.check+' Submit</button></div></div>';
}
function purchaseDetails(){if(pur.res)openSheet('<h3>Purchases from '+esc(pur.file)+'</h3>'+purchasePreview());}

// ============================================================
// Report tab — purchases, usage, wastage and spend for a month or a year
// ============================================================
// ---------- Report charts (plain HTML bars; every value is also in the table below the chart) ----------
let repBy=null;   // 'spend' | 'buys' | 'waste' — null picks spend when prices exist, else purchases
const REP_BY={spend:{label:'Spend',fmt:rupees0},buys:{label:'Purchases',fmt:n=>num(n)},waste:{label:'Wastage',fmt:rupees0}};
const moveVal=(m,by)=>{
  if(by==='buys')return m.kind==='in'?1:0;
  if(by==='spend')return m.kind==='in'&&m.unit_cost!=null?Number(m.qty)*Number(m.unit_cost):0;
  if(m.kind!=='waste')return 0;const i=itemById(m.item_id);return Number(m.qty)*Number(i&&i.last_cost||0);
};
// 0, a round step, … covering max
function niceMax(max){if(max<=0)return 1;const p=Math.pow(10,Math.floor(Math.log10(max))),f=max/p;return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p;}
const tipAttr=(l,v)=>' tabindex="0" data-tl="'+esc(l)+'" data-tv="'+esc(v)+'"';
// rows: [{l, sub, v}] → horizontal bars, value label at the end of each bar
function hbarChart(rows,fmt,empty){
  rows=rows.filter(r=>r.v>0);
  if(!rows.length)return '<div class="ch-empty">'+esc(empty)+'</div>';
  const top=niceMax(Math.max(...rows.map(r=>r.v)));
  return '<div class="ch-hbar" role="img" aria-label="Bar chart, values listed in the table below">'+rows.map(r=>
    '<div class="hb-row'+(r.other?' other':'')+'"'+tipAttr(r.l,fmt(r.v))+'><span class="hb-l">'+esc(r.l)+(r.sub?'<small>'+esc(r.sub)+'</small>':'')+'</span>'+
    '<span class="hb-track"><i style="width:calc((100% - 70px) * '+(r.v/top).toFixed(4)+')"></i><b>'+esc(fmt(r.v))+'</b></span></div>').join('')+'</div>';
}
// pts: [{l, tip, v, on}] → columns with a y axis; on = onclick
function colChart(pts,fmt,empty){
  const max=Math.max(0,...pts.map(p=>p.v));
  if(!max)return '<div class="ch-empty">'+esc(empty)+'</div>';
  const top=niceMax(max),ticks=[top,top/2,0];
  const every=pts.length>16?5:1;   // label every 5th day in a month
  return '<div class="ch-col" role="img" aria-label="Column chart, values listed below">'+
    '<div class="cc-y">'+ticks.map(t=>'<span>'+esc(fmt(t))+'</span>').join('')+'</div>'+
    '<div class="cc-plot"><div class="cc-grid">'+ticks.map(()=>'<i></i>').join('')+'</div>'+
    '<div class="cc-bars" style="grid-template-columns:repeat('+pts.length+',minmax(0,1fr))">'+pts.map((p,k)=>
      '<div class="cc-c'+(p.on?' link':'')+'"'+tipAttr(p.tip,fmt(p.v))+(p.on?' onclick="'+p.on+'"':'')+'><i style="height:'+(p.v*100/top).toFixed(2)+'%"></i>'+
      '<span class="cc-x">'+((k+1)%every===0||k===0?esc(p.l):'')+'</span></div>').join('')+'</div></div></div>';
}
// top n, the rest folded into "Other"
function topN(rows,n){rows=rows.filter(r=>r.v>0).sort((a,b)=>b.v-a.v);if(rows.length<=n)return rows;
  const rest=rows.slice(n-1);return rows.slice(0,n-1).concat([{l:'Other '+rest.length+' items',other:true,v:rest.reduce((a,r)=>a+r.v,0)}]);}
// one shared tooltip for every chart
function chartTip(e){
  const t=e.target.closest&&e.target.closest('[data-tl]');let tip=document.getElementById('chTip');
  if(!t){if(tip)tip.hidden=true;return;}
  if(!tip){tip=document.createElement('div');tip.id='chTip';tip.className='ch-tip';tip.innerHTML='<b></b><span></span>';document.body.appendChild(tip);}
  tip.firstChild.textContent=t.dataset.tv;tip.lastChild.textContent=t.dataset.tl;tip.hidden=false;
  const r=t.getBoundingClientRect(),x=e.clientX!=null&&e.type!=='focusin'?e.clientX:r.left+r.width/2,y=e.clientY!=null&&e.type!=='focusin'?e.clientY:r.top;
  const w=tip.offsetWidth;tip.style.left=Math.max(8,Math.min(innerWidth-w-8,x-w/2))+'px';tip.style.top=Math.max(8,y-tip.offsetHeight-12)+'px';
}
['pointerover','pointermove','focusin'].forEach(ev=>document.addEventListener(ev,chartTip));
document.addEventListener('focusout',()=>{const t=document.getElementById('chTip');if(t)t.hidden=true;});
addEventListener('scroll',()=>{const t=document.getElementById('chTip');if(t)t.hidden=true;},true);
function tallies(list){
  const by={};
  list.forEach(m=>{
    const t=by[m.item_id]||(by[m.item_id]={bought:0,spend:0,used:0,waste:0,adj:0,buys:0});
    const q=Number(m.qty);
    if(m.kind==='in'){t.bought+=q;t.buys++;if(m.unit_cost!=null)t.spend+=q*Number(m.unit_cost);}
    else if(m.kind==='out')t.used+=q;else if(m.kind==='waste')t.waste+=q;else t.adj+=q;
  });
  return by;
}
async function renderReport(){
  const w=document.getElementById('reportWrap');
  if(!authed){w.innerHTML=loginCard();return;}
  if(baseErr){w.innerHTML='<div class="page-head">'+IC.chart+'<h2>Report</h2></div><div class="att-empty">'+esc(baseErr)+'</div>';return;}
  const head='<div class="page-head">'+IC.chart+'<h2>Report</h2>'+
      '<div class="seg"><button type="button" class="'+(view==='month'?'sel':'')+'" onclick="view=\'month\';renderReport()">Month</button><button type="button" class="'+(view==='year'?'sel':'')+'" onclick="view=\'year\';renderReport()">Year</button></div></div>'+monthBar();
  w.innerHTML=head+skeleton();
  if(!(await loadMoves(view))){w.innerHTML=head+'<div class="att-empty">Could not load entries.</div>';return;}
  if(tab!=='report')return;
  const by=tallies(moves);
  const spend=Object.values(by).reduce((a,t)=>a+t.spend,0);
  const wasteVal=Object.entries(by).reduce((a,[id,t])=>{const i=itemById(id);return a+t.waste*Number(i&&i.last_cost||0);},0);
  const buys=moves.filter(m=>m.kind==='in').length;
  const label=view==='year'?String(calY):MONTHS[calM];
  // per item
  const rows=Object.entries(by).map(([id,t])=>({i:itemById(id)||{name:'(deleted item)',unit:'',category:''},t})).sort((a,b)=>b.t.spend-a.t.spend||a.i.name.localeCompare(b.i.name));
  const itemTable=rows.length?'<div class="tbl-scroll"><table class="att-table"><thead><tr><th>Item</th><th class="num">Spend</th><th>Bought</th><th>Used</th><th>Wasted</th><th>Waste %</th><th class="num">Avg price</th></tr></thead><tbody>'+
    rows.map(({i,t})=>'<tr><td><b>'+esc(i.name)+'</b><small class="tshift">'+esc(i.category||'Other')+'</small></td><td class="num pay">'+(t.spend?rupees0(t.spend):'—')+'</td>'+
      '<td>'+(t.bought?qty(t.bought,i.unit):'—')+'</td><td>'+(t.used?qty(t.used,i.unit):'—')+'</td><td>'+(t.waste?'<span class="pa a">'+qty(t.waste,i.unit)+'</span>':'—')+'</td>'+
      '<td>'+(t.used+t.waste?Math.round(t.waste*100/(t.used+t.waste))+'%':'—')+'</td>'+
      '<td class="num">'+(t.bought&&t.spend?rupees(Math.round(t.spend/t.bought*100)/100)+'/'+esc(i.unit):'—')+'</td></tr>').join('')+
    '<tr class="tot"><td>Total</td><td class="num pay">'+rupees0(spend)+'</td><td colspan="5"></td></tr></tbody></table></div>'
    :'<div class="att-empty">No stock entries in '+label+'.</div>';
  // per supplier & per category
  const bySup={},byCat={};
  moves.filter(m=>m.kind==='in').forEach(m=>{
    const v=m.unit_cost!=null?Number(m.qty)*Number(m.unit_cost):0,i=itemById(m.item_id);
    const sk=m.supplier_id||'';(bySup[sk]=bySup[sk]||{n:0,v:0}).n++;bySup[sk].v+=v;
    const ck=(i&&i.category)||'Other';byCat[ck]=(byCat[ck]||0)+v;
  });
  const supTable=Object.keys(bySup).length?'<div class="tbl-scroll"><table class="att-table"><thead><tr><th>Supplier</th><th>Purchases</th><th class="num">Spend</th></tr></thead><tbody>'+
    Object.entries(bySup).sort((a,b)=>b[1].v-a[1].v).map(([k,x])=>'<tr><td><b>'+esc(k?(supById(k)||{name:'(deleted supplier)'}).name:'No supplier')+'</b></td><td>'+x.n+'</td><td class="num pay">'+rupees0(x.v)+'</td></tr>').join('')+
    '</tbody></table></div>':'<div class="att-empty">No purchases in '+label+'.</div>';
  const catTable=Object.keys(byCat).length?'<div class="tbl-scroll"><table class="att-table"><thead><tr><th>Category</th><th class="num">Spend</th><th class="num">Share</th></tr></thead><tbody>'+
    Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([c,v])=>'<tr><td><b>'+esc(c)+'</b></td><td class="num pay">'+rupees0(v)+'</td><td class="num">'+(spend?Math.round(v*100/spend)+'%':'—')+'</td></tr>').join('')+
    '</tbody></table></div>':'';
  // charts — one measure for all of them, picked above the charts
  const by0=repBy||(spend?'spend':'buys'),M=REP_BY[by0],isYr=view==='year';
  const measureSeg='<div class="ch-bar"><span>Charts show</span><div class="seg">'+Object.entries(REP_BY).map(([k,x])=>
    '<button type="button" class="'+(k===by0?'sel':'')+'" onclick="repBy=\''+k+'\';renderReport()">'+x.label+'</button>').join('')+'</div></div>';
  const noneMsg=by0==='spend'?'No priced purchases in '+label+' — add a price when you record a purchase to see spend.':
    by0==='waste'?'No wastage (with a known price) in '+label+'.':'No purchases in '+label+'.';
  // trend: per month in a year, per day in a month
  const nDays=new Date(calY,calM+1,0).getDate();
  const per=Array.from({length:isYr?12:nDays},()=>({spend:0,buys:0,waste:0,used:new Set()}));
  moves.forEach(m=>{const x=per[+(isYr?m.moved_on.slice(5,7):m.moved_on.slice(8,10))-1];if(!x)return;
    x.spend+=moveVal(m,'spend');x.buys+=moveVal(m,'buys');x.waste+=moveVal(m,'waste');if(m.kind==='out')x.used.add(m.item_id);});
  const trend=colChart(per.map((x,k)=>isYr?{l:MONTHS[k].slice(0,3),tip:MONTHS[k]+' '+calY,v:x[by0],on:'view=\'month\';calM='+k+';renderReport()'}
      :{l:String(k+1),tip:fmtDay(calY+'-'+pad(calM+1)+'-'+pad(k+1)),v:x[by0]}),M.fmt,noneMsg);
  const monthTable=isYr?'<div class="tbl-scroll"><table class="att-table"><thead><tr><th>Month</th><th class="num">Spend</th><th class="num">Purchases</th><th class="num">Wastage</th><th class="num">Items used</th></tr></thead><tbody>'+
    per.map((x,k)=>'<tr class="link" onclick="view=\'month\';calM='+k+';renderReport()"><td><b>'+MONTHS[k]+'</b></td><td class="num pay">'+(x.spend?rupees0(x.spend):'—')+'</td><td class="num">'+(x.buys||'—')+'</td>'+
      '<td class="num">'+(x.waste?rupees0(x.waste):'—')+'</td><td class="num">'+(x.used.size||'—')+'</td></tr>').join('')+
    '<tr class="tot"><td>Total</td><td class="num pay">'+rupees0(spend)+'</td><td class="num">'+buys+'</td><td class="num">'+rupees0(wasteVal)+'</td><td></td></tr></tbody></table></div>':'';
  const itemVal=(id,t)=>by0==='spend'?t.spend:by0==='buys'?t.buys:t.waste*Number((itemById(id)||{}).last_cost||0);
  const itemChart=hbarChart(topN(Object.entries(by).map(([id,t])=>{const i=itemById(id)||{name:'(deleted item)'};return {l:i.name,v:itemVal(id,t)};}),10),M.fmt,noneMsg);
  const supVal={},catVal={};
  moves.forEach(m=>{const v=moveVal(m,by0);if(!v)return;const i=itemById(m.item_id);
    const ck=(i&&i.category)||'Other';catVal[ck]=(catVal[ck]||0)+v;
    if(m.kind==='in'){const sk=m.supplier_id||'';supVal[sk]=(supVal[sk]||0)+v;}});
  const supChart=by0==='waste'?'<div class="ch-empty">Wastage isn\'t tied to a supplier — pick Spend or Purchases.</div>':
    hbarChart(topN(Object.entries(supVal).map(([k,v])=>({l:k?(supById(k)||{name:'(deleted supplier)'}).name:'No supplier',v})),8),M.fmt,noneMsg);
  const catChart=hbarChart(topN(Object.entries(catVal).map(([c,v])=>({l:c,v})),8),M.fmt,noneMsg);
  const chartCard=(title,chart,table)=>'<h3 class="att-sub">'+title+'</h3><div class="att-card rep-card">'+chart+(table?'<div class="rep-tbl">'+table+'</div>':'')+'</div>';
  w.innerHTML=head+
    '<div class="inv-stats">'+
      '<div class="inv-stat"><span>Spend</span><b>'+rupees0(spend)+'</b><small>'+buys+' purchase'+(buys===1?'':'s')+'</small></div>'+
      '<div class="inv-stat'+(wasteVal?' bad':'')+'"><span>Wastage</span><b>'+rupees0(wasteVal)+'</b><small>approx, at last price</small></div>'+
      '<div class="inv-stat'+(items.filter(isLow).length?' bad':'')+'"><span>Low stock now</span><b>'+items.filter(isLow).length+'</b></div>'+
    '</div>'+measureSeg+
    chartCard(IC.chart+' '+M.label+(isYr?' by month · '+calY:' by day · '+MONTHS[calM]),trend+(isYr?'<p class="ch-note">Tap a month to open it.</p>':''),monthTable)+
    '<div class="rep-layout"><div class="rep-main">'+chartCard(IC.rupee+' '+label+' by item <small class="ch-sub">top 10 by '+M.label.toLowerCase()+'</small>',itemChart,rows.length?itemTable:'')+'</div>'+
      '<div class="rep-side">'+chartCard('By supplier',supChart,Object.keys(bySup).length?supTable:'')+(catTable||Object.keys(catVal).length?chartCard('By category',catChart,catTable):'')+'</div></div>'+
    '<div class="att-actions"><button class="att-btn" onclick="dailyMode=\'orders\';showTab(\'daily\')">'+IC.box+' Usage from Petpooja orders</button></div>'+
    '<p class="att-foot">Spend counts purchases with a price. Wastage value uses each item\'s last purchase price. Stock counts (corrections) are listed in History.</p>'+
    '<div class="att-actions"><button class="att-btn" onclick="exportCSV()">'+IC.dl+' Export '+(view==='year'?calY:MONTHS[calM].slice(0,3)+' '+calY)+' CSV</button></div>';
}
function exportCSV(){
  const cell=v=>{v=String(v==null?'':v);return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  const out=[['Date','Item','Category','Type','Quantity','Unit','Price per unit','Total','Supplier','Note'].join(',')];
  [...moves].reverse().forEach(m=>{const i=itemById(m.item_id)||{},s=supById(m.supplier_id);
    out.push([m.moved_on,i.name,i.category,KINDS[m.kind].label,signedQty(m),i.unit,m.unit_cost,m.unit_cost!=null?(Number(m.qty)*Number(m.unit_cost)).toFixed(2):'',s?s.name:'',m.note].map(cell).join(','));});
  const blob=new Blob(['﻿'+out.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='inventory-'+(view==='year'?calY:calY+'-'+pad(calM+1))+'.csv';a.click();toast('Exported CSV');
}

// ============================================================
// Suppliers tab
// ============================================================
function renderSuppliers(){
  const w=document.getElementById('suppliersWrap');
  if(!authed){w.innerHTML=loginCard();return;}
  if(!ownerIn){w.innerHTML=supplierLogin();return;}
  if(baseErr){w.innerHTML='<div class="page-head">'+IC.truck+'<h2>Suppliers</h2></div><div class="att-empty">'+esc(baseErr)+'</div>';return;}
  const list=sups.map(s=>{
    const its=items.filter(i=>i.supplier_id===s.id&&i.active);
    return '<button type="button" class="c-card att-staff" onclick="supplierForm(\''+s.id+'\')">'+
      '<span class="c-ic">'+IC.truck+'</span>'+
      '<span class="c-txt"><b>'+esc(s.name)+'</b>'+(s.phone?'<small>'+esc(s.phone)+'</small>':'')+(s.note?'<small>'+esc(s.note)+'</small>':'')+
        '<small>'+(its.length?'Supplies: <b class="sal">'+its.map(i=>esc(i.name)).join(', ')+'</b>':'Not the usual supplier for any item')+'</small></span>'+
      '<span class="c-go">'+IC.next+'</span></button>';
  }).join('');
  w.innerHTML='<div class="page-head">'+IC.truck+'<h2>Suppliers</h2><span class="att-count">'+sups.length+'</span><button type="button" class="mini sup-out" onclick="lock()">'+IC.unlock+' Log out</button></div>'+
    '<div class="contact-cards">'+(list||'<div class="att-empty">No suppliers yet.</div>')+
    '<button class="att-btn" onclick="supplierForm()">'+IC.plus+' Add supplier</button></div>';
}
function supplierForm(id){
  const s=id?supById(id):null,v=k=>esc(s&&s[k]!=null?s[k]:'');
  // items this supplier usually supplies (inv_items.supplier_id); ticking one from another supplier moves it here
  const act=items.filter(i=>i.active||i.supplier_id===id),groups={};
  act.forEach(i=>(groups[i.category||'Other']=groups[i.category||'Other']||[]).push(i));
  const list=Object.keys(groups).sort().map(c=>'<div class="sup-cat" data-cat="'+esc(c)+'"><div class="sup-cat-h">'+esc(c)+'</div>'+
    groups[c].map(i=>{const other=i.supplier_id&&i.supplier_id!==id?supById(i.supplier_id):null;
      return '<label class="sup-item" data-name="'+esc(i.name.toLowerCase())+'"><input type="checkbox" value="'+i.id+'"'+(id&&i.supplier_id===id?' checked':'')+' onchange="supCount()">'+
        '<span>'+esc(i.name)+(other?' <small>(now: '+esc(other.name)+')</small>':'')+'</span></label>';}).join('')+'</div>').join('');
  openSheet('<h3>'+(s?'Edit supplier':'Add supplier')+'</h3>'+
    '<div class="fld"><label>Name</label><input id="s_name" value="'+v('name')+'" placeholder="e.g. Amul Dairy Point"></div>'+
    '<div class="fld"><label>Phone</label><input id="s_phone" type="tel" value="'+v('phone')+'" placeholder="+91 …"></div>'+
    '<div class="fld"><label>Note (optional)</label><textarea id="s_note" placeholder="What they supply, delivery days, payment terms…">'+v('note')+'</textarea></div>'+
    '<div class="fld"><label>Items supplied <span class="sup-n" id="supN"></span></label>'+
      '<div class="sup-list"><div class="sup-tools"><input type="search" placeholder="Search items…" oninput="supFilter(this.value)">'+
        '<label class="sup-all"><input type="checkbox" onchange="supAll(this.checked)"> Select all shown</label>'+
        '<button type="button" class="mini in" onclick="supNewItemToggle()">'+IC.plus+' New item</button></div>'+
        '<div class="sup-new" id="supNew" hidden>'+
          '<input id="sn_name" placeholder="New item name, e.g. Oat milk" autocomplete="off">'+
          '<input id="sn_cat" list="catList" placeholder="Category">'+
          '<select id="sn_unit">'+UNITS.map(u=>'<option>'+u+'</option>').join('')+'</select>'+
          '<input id="sn_min" type="number" min="0" step="any" inputmode="decimal" placeholder="Min stock">'+
          '<button type="button" class="save" id="sn_add" onclick="supAddItem()">Add item</button></div>'+
        (list||'<div class="att-empty">No items yet.</div>')+'</div>'+
      '<small class="fhint">Ticked items use this supplier as their usual supplier (it is pre-selected when you record a purchase). Untick to remove.</small></div>'+
    '<div class="sheet-actions">'+(s?'<button class="cancel danger" onclick="delSupplier(\''+s.id+'\')">Delete</button>':'<button class="cancel" onclick="closeSheet()">Cancel</button>')+
      '<button class="save" id="s_save" onclick="saveSupplier('+(s?'\''+s.id+'\'':'null')+')">Save</button></div>');
  supCount();
}
// Create a new inventory item from the supplier form; it is added to Stock straight away and ticked here
function supNewItemToggle(){const f=document.getElementById('supNew');f.hidden=!f.hidden;if(!f.hidden)document.getElementById('sn_name').focus();}
async function supAddItem(){
  const g=k=>document.getElementById(k).value.trim(),name=g('sn_name');
  if(!name)return toast('Enter the item name',true);
  if(items.some(i=>i.name.toLowerCase()===name.toLowerCase()))return toast('“'+name+'” is already in inventory — tick it in the list',true);
  const min=g('sn_min')===''?0:Number(g('sn_min'));if(!(min>=0))return toast('Minimum stock cannot be negative',true);
  const b=document.getElementById('sn_add');b.disabled=true;
  const {data,error}=await sb.from('inv_items').insert({name,category:g('sn_cat'),unit:g('sn_unit')||'pcs',min_stock:min}).select('id,name,category,unit,min_stock,stock,last_cost,supplier_id,active,created_at');
  b.disabled=false;
  if(error)return toast(dbErr(error),true);
  const it=data[0];items.push(it);items.sort((a,b)=>a.name.localeCompare(b.name));
  // show it in the checklist, ticked, under its category
  const cat=it.category||'Other',list=document.querySelector('.sup-list');
  let grp=[...list.querySelectorAll('.sup-cat')].find(c=>c.dataset.cat===cat);
  if(!grp){grp=document.createElement('div');grp.className='sup-cat';grp.dataset.cat=cat;grp.innerHTML='<div class="sup-cat-h">'+esc(cat)+'</div>';list.appendChild(grp);}
  const lab=document.createElement('label');lab.className='sup-item new';lab.dataset.name=it.name.toLowerCase();
  lab.innerHTML='<input type="checkbox" value="'+it.id+'" checked onchange="supCount()"><span>'+esc(it.name)+' <small>(new)</small></span>';
  grp.insertBefore(lab,grp.children[1]||null);lab.scrollIntoView({block:'nearest'});
  ['sn_name','sn_min'].forEach(k=>document.getElementById(k).value='');document.getElementById('supNew').hidden=true;
  supCount();toast('Added “'+it.name+'” to inventory — Save to link it to this supplier');
}
function supCount(){const n=document.querySelectorAll('.sup-item input:checked').length,e=document.getElementById('supN');if(e)e.textContent=n?'· '+n+' selected':'';}
function supFilter(q){
  q=q.trim().toLowerCase();
  document.querySelectorAll('.sup-cat').forEach(c=>{let any=false;c.querySelectorAll('.sup-item').forEach(l=>{const ok=!q||l.dataset.name.includes(q);l.hidden=!ok;if(ok)any=true;});c.hidden=!any;});
}
function supAll(on){document.querySelectorAll('.sup-item').forEach(l=>{if(!l.hidden)l.querySelector('input').checked=on;});supCount();}
async function saveSupplier(id){
  const g=k=>document.getElementById(k).value.trim();
  const rec={name:g('s_name'),phone:g('s_phone'),note:g('s_note')};
  if(!rec.name)return toast('Enter a supplier name',true);
  const picked=new Set([...document.querySelectorAll('.sup-item input:checked')].map(c=>c.value));
  // new supplier: every ticked item is added (even ones with no supplier yet)
  const add=items.filter(i=>picked.has(i.id)&&(!id||i.supplier_id!==id)),remove=id?items.filter(i=>i.supplier_id===id&&!picked.has(i.id)):[];
  const moving=add.filter(i=>i.supplier_id);
  if(moving.length&&!confirm('Move '+moving.length+' item'+(moving.length===1?'':'s')+' from their current supplier to '+rec.name+'?\n\n'+moving.map(i=>'• '+i.name+' (now: '+(supById(i.supplier_id)||{}).name+')').join('\n')))return;
  const b=document.getElementById('s_save');b.disabled=true;
  let res=id?await sb.from('inv_suppliers').update(rec).eq('id',id).select('id'):await sb.from('inv_suppliers').insert(rec).select('id');
  if(!res.error){
    const sid=id||(res.data&&res.data[0]&&res.data[0].id);
    if(add.length)res=await sb.from('inv_items').update({supplier_id:sid}).in('id',add.map(i=>i.id));
    if(!res.error&&remove.length)res=await sb.from('inv_items').update({supplier_id:null}).in('id',remove.map(i=>i.id));
  }
  b.disabled=false;
  if(res.error)return toast(dbErr(res.error),true);
  closeSheet();
  toast((id?'Supplier updated':'Supplier added')+(add.length||remove.length?' · '+(add.length?add.length+' item'+(add.length===1?'':'s')+' added':'')+(add.length&&remove.length?', ':'')+(remove.length?remove.length+' removed':''):''));
  await afterChange();
}
async function delSupplier(id){
  const s=supById(id);
  if(!confirm('Delete '+(s?s.name:'this supplier')+'? Past purchases are kept, just without a supplier name.'))return;
  const {error}=await sb.from('inv_suppliers').delete().eq('id',id);
  if(error)return toast(dbErr(error),true);
  closeSheet();toast('Supplier deleted');await afterChange();
}

// ============================================================
// Tabs + boot
// ============================================================
const TABS=['stock','daily','history','report','suppliers'];
function renderTab(){({stock:renderStock,daily:renderDaily,history:renderHistory,report:renderReport,suppliers:renderSuppliers})[tab]();}
function showTab(name){
  if(!TABS.includes(name))name='stock';
  if(tab==='daily'&&name!=='daily'&&!confirmLeaveDay())return;
  if(name==='daily')day=null;         // always reload the day (stock may have changed elsewhere)
  if(tab==='daily'&&name!=='daily')dailyMode='count';
  tab=name;
  if(name==='history')view='month';   // History is always one month
  TABS.forEach(t=>{const p=document.getElementById('tab-'+t);p.classList.toggle('active',t===name);p.setAttribute('aria-hidden',t===name?'false':'true');});
  document.querySelectorAll('.tabbtn').forEach(b=>{const on=b.dataset.tab===name;b.classList.toggle('active',on);b.setAttribute('aria-selected',on?'true':'false');});
  document.body.className='tab-'+name;
  renderTab();
  window.scrollTo({top:0,behavior:'auto'});
}
document.querySelectorAll('.tabbtn').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));

window.addEventListener('beforeunload',e=>{if(tab==='daily'&&dayDirty.size){e.preventDefault();e.returnValue='';}});
async function boot(){
  reflectAuth();
  if(!sb){document.getElementById('stockWrap').innerHTML='<div class="att-empty">Could not load the app. Check your internet connection and refresh.</div>';return;}
  document.getElementById('stockWrap').innerHTML=skeleton();
  // Inventory is open to anyone with the link — no login (see schema.sql). The header lock button is hidden.
  const b=document.getElementById('authBtn');if(b)b.remove();
  await setAuthed(true);
  try{const {data}=await sb.auth.getSession();ownerIn=isOwnerSession(data&&data.session);}catch(e){}
  sb.auth.onAuthStateChange((ev,ses)=>{const v=isOwnerSession(ses);if(v===ownerIn)return;ownerIn=v;if(tab==='suppliers'){closeSheet();renderSuppliers();}});
  if(tab==='suppliers')renderSuppliers();
}
boot();
