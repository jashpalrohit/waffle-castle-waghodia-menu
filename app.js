const CUR='₹';
// ▼▼▼ Backend (Supabase) — safe to be public; writes are protected by Row Level Security ▼▼▼
const SUPABASE_URL='https://pyhtrkylkykqwklrzitm.supabase.co';
const SUPABASE_KEY='sb_publishable_th2b-0LngMIeET39bLchaA_RacvqIZ-';
const OWNER_EMAIL='jashpalrohit002@gmail.com';   // owner login (email hidden from UI; only password is typed)
const ADMIN_HASH='#wc-admin';                    // secret link to reach the owner login
// ▲▲▲ CHANGE THESE ▲▲▲
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Disable page zoom on mobile (Safari ignores user-scalable=no, so block its pinch gesture; CSS touch-action handles the rest).
['gesturestart','gesturechange','gestureend'].forEach(ev=>document.addEventListener(ev,e=>e.preventDefault(),{passive:false}));
let menu=null, activeCat='ALL', manage=false, idCounter=0, _veg=true, _avail=true, _popular=false;
// an item is visible to customers unless explicitly marked unavailable; owners (manage) see all
function isVisible(it){return manage||it.available!==false;}
let authed=false;
const collapsed=new Set();   // category ids that are collapsed

// Start from the built-in menu; the live menu is then loaded from Supabase in boot().
menu=JSON.parse(JSON.stringify(window.DEFAULT_MENU));
async function loadMenu(){
  try{const {data,error}=await sb.from('menu').select('data').eq('id',1).maybeSingle();
    if(!error&&data&&data.data)menu=data.data;}catch(e){}
}
// Persist the whole menu to the cloud (owner must be logged in; RLS allows only authenticated writes).
async function save(){
  try{const {error}=await sb.from('menu').upsert({id:1,data:menu,updated_at:new Date().toISOString()});
    if(error)toast('Save failed: '+error.message);}catch(e){toast('Save failed — check connection');}
}

const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
function uid(p){idCounter++;return p+'_'+Date.now().toString(36)+idCounter;}
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),1900);}

// ---- "Must Try" carousel + skeleton loader (Menu tab) ----
// Chooses items flagged popular (Must Try) that have a photo.
function popularItems(){
  const all=[];
  menu.categories.forEach(c=>c.items.forEach(it=>{if(isVisible(it))all.push({cat:c,it});}));
  // Only owner-picked "Must Try" items (a photo is needed to show in the carousel).
  // When nothing is flagged the list is empty and the carousel hides entirely.
  return all.filter(p=>p.it.popular&&p.it.image).slice(0,12);
}
function carouselHtml(){
  const list=popularItems();
  if(!list.length)return '';
  const cards=list.map(({cat,it})=>{
    const p=parseInt(it.price,10)||0;
    const price=p>0?'<span class="cur">'+CUR+'</span>'+p:'';
    return '<button type="button" class="pop-card" onclick="jumpToCat(\''+cat.id+'\')">'+
      '<div class="pop-img"><img loading="lazy" src="'+esc(it.image)+'" alt="'+esc(it.name)+'">'+
        '<div class="pop-meta"><div class="pop-name">'+esc(it.name)+'</div>'+
          (price?'<div class="pop-price">'+price+'</div>':'')+'</div>'+
      '</div>'+
    '</button>';
  }).join('');
  return '<section class="pop"><div class="pop-h"><h2>Must Try</h2></div><div class="pop-scroll">'+cards+'</div></section>';
}
function jumpToCat(cid){
  activeCat='ALL';collapsed.delete(cid);renderChips();render();
  setTimeout(()=>{const el=document.getElementById('c-'+cid);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});},60);
}
// Zomato-style "Menu" button → slide-up drawer listing categories; tap one to jump to it.
function openCategorySheet(){
  const vcount=c=>c.items.filter(isVisible).length;
  const rows=menu.categories.map(c=>{const n=vcount(c);if(!manage&&!n)return '';
    return '<button type="button" class="cat-sheet-item" onclick="gotoCat(\''+c.id+'\')"><span>'+esc(c.category)+'</span><span class="n">'+n+'</span></button>';}).join('');
  const list=document.getElementById('catDrawerList');
  if(list)list.innerHTML=rows||'<div class="offers-empty">No categories yet.</div>';
  document.getElementById('catDrawerOverlay').classList.add('show');
  document.body.classList.add('menu-open');   // hide the Menu button while its dropdown is open
}
function closeCatDrawer(){document.getElementById('catDrawerOverlay').classList.remove('show');document.body.classList.remove('menu-open');}
function gotoCat(cid){closeCatDrawer();if(typeof showTab==='function')showTab('menu');jumpToCat(cid);}
document.getElementById('catDrawerOverlay').addEventListener('click',e=>{if(e.target.id==='catDrawerOverlay')closeCatDrawer();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCatDrawer();});
function renderSkeleton(){
  const app=document.getElementById('app');if(!app)return;
  let h='<div class="sk-h"></div>';
  for(let i=0;i<5;i++)h+='<div class="sk-card"><div class="sk-thumb"></div><div class="sk-lines"><div class="sk-line w70"></div><div class="sk-line w90"></div><div class="sk-line w40"></div></div></div>';
  app.innerHTML=h;
}
// builds the horizontal category chip strip (name kept as renderChips since it's called throughout)
// Category navigation is now the floating "Menu" button (openCategorySheet); kept as a
// no-op so existing callers stay valid.
function renderChips(){}

function fmtPrice(p){p=parseInt(p,10)||0;return p>0?'<span class="cur">'+CUR+'</span>'+p:'Price on request';}
// choices may be plain strings ("Dark") or {name, price} for per-option pricing
// A choice may be {name,price} or a plain string; strings may embed a price like "Waffle Candy: 59" (spaces ok)
function normChoices(opts){
  if(!opts||!opts.choices)return null;
  return opts.choices.map(c=>{
    if(c&&typeof c==='object')return {name:c.name,price:(c.price==null?null:c.price)};
    const s=String(c),m=s.match(/^(.+?):\s*(\d+)\s*$/);
    return m?{name:m[1].trim(),price:parseInt(m[2],10)}:{name:s,price:null};
  });
}
// ---- Owner-set item badges ----
const BADGE_MAP={bestseller:{t:'★ Bestseller',c:'bs'},'new':{t:'New',c:'nw'},spicy:{t:'🌶️ Spicy',c:'sp'}};
function badgeHtml(b){const d=b&&BADGE_MAP[b];return d?'<span class="item-badge '+d.c+'">'+d.t+'</span>':'';}
function itemRow(cat,it,i){
  const img=it.image?'<img loading="lazy" src="'+esc(it.image)+'" alt="'+esc(it.name)+'" onerror="this.parentNode.innerHTML=\'<div class=&quot;noimg&quot;></div>\'">':'<div class="noimg"></div>';
  const diet='<span class="diet '+(it.veg?'':'n')+'"><i></i></span>';
  let opts='', shownPrice=it.price||0;
  const ch=normChoices(it.options);
  if(ch&&ch.length){
    const firstPriced=ch.find(c=>c.price!=null);
    if(ch[0].price!=null)shownPrice=ch[0].price;              // default = the pre-selected option
    else if(!shownPrice&&firstPriced)shownPrice=firstPriced.price;   // else fall back to first priced option
    opts='<div class="opts"><span class="opts-lbl">'+esc(it.options.label||'Options')+':</span>'+
      ch.map((c,i)=>'<button type="button" class="opt'+(i===0?' sel':'')+'" data-price="'+(c.price==null?'':c.price)+'" onclick="selOpt(this)">'+esc(c.name)+(c.price!=null?' <b class="opt-price">'+CUR+c.price+'</b>':'')+'</button>').join('')+
      '</div>';
  }
  const sp=(it.special!=null)?(parseInt(it.special,10)||0):null;   // offer / "today" price
  let price;
  if(sp!=null&&sp>0){
    price='<div class="price offer">'+(shownPrice>0?'<span class="price-old"><span class="cur">'+CUR+'</span>'+shownPrice+'</span>':'')+
      '<span class="price-new"><span class="cur">'+CUR+'</span>'+sp+'</span><span class="offer-tag">Offer</span></div>';
  }else{
    price='<div class="price'+(shownPrice>0?'':' zero')+'">'+fmtPrice(shownPrice)+'</div>';
  }
  const unavail=it.available===false;
  const tag=unavail?'<span class="ntag">Unavailable</span>':'';
  const mt=it.popular?'<span class="mt-badge">&#9733; Must Try</span>':'';
  const bd=badgeHtml(it.badge);
  let acts='';
  if(manage)acts='<div class="row-actions"><button class="mini" onclick="editItem(\''+cat.id+'\',\''+it.id+'\')">Edit</button><button class="mini danger" onclick="delItem(\''+cat.id+'\',\''+it.id+'\')">Delete</button></div>';
  return '<div class="item'+(unavail?' unavail':'')+'" style="animation-delay:'+(Math.min(i||0,6)*45)+'ms"><div class="thumb">'+img+'</div><div class="info"><div class="name">'+diet+esc(it.name)+tag+mt+bd+'</div>'+(it.desc?'<div class="desc">'+esc(it.desc)+'</div>':'')+opts+price+acts+'</div></div>';
}

const IC_TAG='<svg class="ico" viewBox="0 0 24 24"><path d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h8.6z"/><circle cx="7.5" cy="7.5" r="1.4"/></svg>';
const IC_EXPAND='<svg class="ico" viewBox="0 0 24 24"><polyline points="6 4 12 10 18 4"/><polyline points="6 13 12 19 18 13"/></svg>';
const IC_COLLAPSE='<svg class="ico" viewBox="0 0 24 24"><polyline points="18 10 12 4 6 10"/><polyline points="18 19 12 13 6 19"/></svg>';
function catFilter(cat,f){return cat.items.filter(it=>isVisible(it)&&(!f||it.name.toLowerCase().includes(f)||(it.desc||'').toLowerCase().includes(f)));}
function shownCatIds(){
  const f=document.getElementById('search').value.trim().toLowerCase();
  return menu.categories.filter(cat=>{
    if(activeCat!=='ALL'&&cat.id!==activeCat)return false;
    const items=catFilter(cat,f);
    return !(!items.length&&(!manage||f));
  }).map(c=>c.id);
}
function render(){
  const app=document.getElementById('app');
  const f=document.getElementById('search').value.trim().toLowerCase();
  let catsHtml='',shown=0;const shownCats=[];
  menu.categories.forEach(cat=>{
    if(activeCat!=='ALL'&&cat.id!==activeCat)return;
    const items=catFilter(cat,f);
    if(!items.length&&(!manage||f))return;
    shown+=items.length;shownCats.push(cat.id);
    const isColl=collapsed.has(cat.id)&&!f;
    catsHtml+='<div class="cat-h'+(isColl?' collapsed':'')+'" id="c-'+cat.id+'" onclick="toggleCat(\''+cat.id+'\')"><h2>'+esc(cat.category)+'</h2><span class="n">'+items.length+'</span>';
    if(manage)catsHtml+='<button class="mini danger delcat" onclick="event.stopPropagation();delCat(\''+cat.id+'\')">Delete category</button>';
    catsHtml+='<span class="chev"><svg class="ico" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></span>';
    catsHtml+='</div>';
    catsHtml+='<div class="cat-items'+(isColl?' collapsed':'')+'"><div class="cat-items-inner">';
    items.forEach((it,i)=>catsHtml+=itemRow(cat,it,i));
    if(manage)catsHtml+='<button class="additem" onclick="addItem(\''+cat.id+'\')">+ Add item to '+esc(cat.category)+'</button>';
    catsHtml+='</div></div>';
  });
  let top='';
  if(!f&&activeCat==='ALL')top+=carouselHtml();   // "Must Try" only on the full, unfiltered menu
  if(!f&&shownCats.length>1){
    const allColl=shownCats.every(id=>collapsed.has(id));
    top+='<div class="acc-tools"><button class="accbtn" onclick="toggleAll()">'+(allColl?IC_EXPAND+' Expand all':IC_COLLAPSE+' Collapse all')+'</button></div>';
  }
  let body=catsHtml;
  if(manage)body+='<button class="addcat" onclick="addCat()">+ Add new category</button>';
  if(!shown&&!manage)body='<div class="empty">No items match.</div>';
  app.classList.toggle('noanim', !!f);   // skip entrance animation while searching
  app.innerHTML=top+body;
  document.getElementById('count').textContent=menu.categories.reduce((a,c)=>a+c.items.length,0)+' items in '+menu.categories.length+' categories';
  renderOffers();
}
// ---- Offers & Notes (collapsible; owner-editable, stored with the menu in Supabase) ----
// Escape first (safe), then turn **wrapped** text into bold. Owner writes **like this**.
function fmtOffer(s){return esc(s).replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>');}
const IC_OFFER='<svg class="ico offers-ico" viewBox="0 0 24 24"><path d="M20 12v9H4v-9"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>';
// Renders the Offers tab as a full page. The tab-bar dot lights up whenever offers exist.
function renderOffers(){
  const box=document.getElementById('offersWrap');
  if(!box)return;
  const title=esc(menu&&menu.offersTitle?menu.offersTitle:'Offers & Notes');
  const txt=(menu&&menu.offers?String(menu.offers):'').trim();
  const lines=txt.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const offers=offerCount();
  const dot=document.getElementById('offersDot');
  if(dot)dot.style.display=(lines.length||offers>0)?'block':'none';
  const editBtn=manage?'<button class="mini offers-edit" onclick="editOffers()">Edit</button>':'';
  const body=lines.length
    ?lines.map(l=>'<div class="offer-line">'+fmtOffer(l)+'</div>').join('')
    :'<div class="offers-empty">'+(manage?'No offers or notes yet. Tap Edit to add some.':'No current offers — check back soon!')+'</div>';
  box.innerHTML=
    '<div class="page-head">'+IC_OFFER+'<h2>'+title+'</h2>'+editBtn+'</div>'+
    '<div class="offers-card">'+body+'</div>'+
    (manage?'<button class="offer-tool-btn" onclick="openOfferTool()">'+IC_TAG+' Set item offer prices'+(offers?' <span class="offer-count">'+offers+' active</span>':'')+'</button>':'');
}
function editOffers(){
  if(!authed)return;
  openSheet('<h3>'+IC_OFFER+' Edit Offers &amp; Notes</h3>'+
    '<div class="fld"><label>Section title</label>'+
    '<input id="f_offerstitle" value="'+esc(menu.offersTitle||'')+'" placeholder="Offers & Notes"></div>'+
    '<div class="fld"><label>Offers &amp; notes &mdash; one per line</label>'+
    '<textarea id="f_offers" style="min-height:170px" placeholder="e.g. **Buy 1 Get 1** on Signature Waffles (Mon-Fri)\nAll waffles are **100% vegetarian**\nOpen 11 AM - 11 PM daily">'+esc(menu.offers||'')+'</textarea>'+
    '<small class="fhint">Each line shows as its own point. Wrap text in **double asterisks** to make it <b>bold</b>. Leave blank to hide the section from customers.</small></div>'+
    '<div class="sheet-actions"><button class="cancel" onclick="closeSheet()">Cancel</button><button class="save" onclick="saveOffers()">Save</button></div>');
  setTimeout(()=>{const el=document.getElementById('f_offers');if(el)el.focus();},0);
}
function saveOffers(){
  if(!authed)return;
  menu.offers=document.getElementById('f_offers').value.trim();
  menu.offersTitle=document.getElementById('f_offerstitle').value.trim();
  save();closeSheet();renderOffers();toast('Offers & notes updated');
}
function toggleAll(){
  const ids=shownCatIds();
  if(!ids.length)return;
  const collapse=!ids.every(id=>collapsed.has(id));   // if not all collapsed -> collapse; else expand
  ids.forEach(id=>{
    if(collapse)collapsed.add(id);else collapsed.delete(id);
    const head=document.getElementById('c-'+id);
    const wrap=head&&head.nextElementSibling;
    if(head)head.classList.toggle('collapsed',collapse);
    if(wrap&&wrap.classList.contains('cat-items'))wrap.classList.toggle('collapsed',collapse);
  });
  const btn=document.querySelector('.accbtn');
  if(btn)btn.innerHTML=collapse?IC_EXPAND+' Expand all':IC_COLLAPSE+' Collapse all';
}

function selOpt(btn){
  const box=btn.parentNode;
  box.querySelectorAll('.opt').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  const pr=btn.getAttribute('data-price');
  if(pr){const info=btn.closest('.info');const pe=info&&info.querySelector('.price');if(pe&&!pe.classList.contains('offer')){const p=parseInt(pr,10)||0;pe.className='price'+(p>0?'':' zero');pe.innerHTML=fmtPrice(p);}}
}

function toggleCat(cid){
  const nowCollapsed=!collapsed.has(cid);
  if(nowCollapsed)collapsed.add(cid);else collapsed.delete(cid);
  // while a search is active, items stay visible regardless of collapse state
  if(document.getElementById('search').value.trim())return;
  const head=document.getElementById('c-'+cid);
  const wrap=head&&head.nextElementSibling;
  if(head)head.classList.toggle('collapsed',nowCollapsed);
  if(wrap&&wrap.classList.contains('cat-items'))wrap.classList.toggle('collapsed',nowCollapsed);
}

function findCat(cid){return menu.categories.find(c=>c.id===cid);}
function findItem(cid,iid){const c=findCat(cid);return c&&c.items.find(i=>i.id===iid);}
function openSheet(html){document.getElementById('sheet').innerHTML='<button class="sheet-close" type="button" aria-label="Close" onclick="closeSheet()"><svg class="ico" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button><div class="sheet-body">'+html+'</div>';document.getElementById('overlay').classList.add('show');}
function closeSheet(){document.getElementById('overlay').classList.remove('show');}
document.getElementById('overlay').addEventListener('click',e=>{if(e.target.id==='overlay')closeSheet();});

function itemForm(cid,it){
  const veg=it?it.veg:true;
  const avail=it?it.available!==false:true;
  const pop=it?!!it.popular:false;
  return '<h3>'+(it?'Edit item':'Add item')+'</h3>'+
    '<div class="fld"><label>Availability</label><div class="veg-toggle"><button type="button" id="av_y" class="'+(avail?'sel':'')+'" onclick="setAvail(true)">Available</button><button type="button" id="av_n" class="'+(avail?'':'sel')+'" onclick="setAvail(false)">Unavailable</button></div></div>'+
    '<div class="fld"><label>Name</label><input id="f_name" value="'+esc(it?it.name:'')+'" placeholder="e.g. Belgian Chocolate Waffle"></div>'+
    '<div class="fld"><label>Description</label><textarea id="f_desc" placeholder="Short description">'+esc(it?it.desc:'')+'</textarea></div>'+
    '<div class="fld"><label>Price ('+CUR+')</label><input id="f_price" type="number" min="0" step="1" value="'+(it?(it.price||0):0)+'"></div>'+
    '<div class="fld"><label>Offer price ('+CUR+') &mdash; optional</label><input id="f_special" type="number" min="0" step="1" value="'+(it&&it.special!=null?it.special:'')+'" placeholder="Leave blank for none"><small class="fhint">If set, the regular price shows struck-through next to this offer price.</small></div>'+
    '<div class="fld"><label>Type</label><div class="veg-toggle"><button type="button" id="veg_v" class="'+(veg?'sel':'')+'" onclick="setVeg(true)">Veg</button><button type="button" id="veg_n" class="'+(veg?'':'sel')+'" onclick="setVeg(false)">Non-veg</button></div></div>'+
    '<div class="fld"><label>Must Try (featured carousel)</label><div class="veg-toggle"><button type="button" id="mt_y" class="'+(pop?'sel':'')+'" onclick="setPopular(true)">&#9733; Must Try</button><button type="button" id="mt_n" class="'+(pop?'':'sel')+'" onclick="setPopular(false)">Regular</button></div><small class="fhint">Adds this item to the &ldquo;Must Try&rdquo; row at the top of the menu. Needs a photo to appear there.</small></div>'+
    '<div class="fld"><label>Badge</label><select id="f_badge">'+['','bestseller','new','spicy'].map(v=>'<option value="'+v+'"'+(((it&&it.badge)||'')===v?' selected':'')+'>'+({'':'None',bestseller:'★ Bestseller','new':'New',spicy:'🌶️ Spicy'}[v])+'</option>').join('')+'</select><small class="fhint">Shows a small label on the item card.</small></div>'+
    '<div class="fld"><label>Image (optional)</label>'+
      '<div class="img-row"><input id="f_img" value="'+esc(it?it.image:'')+'" placeholder="Paste a URL or upload" oninput="prevImg()">'+
      '<button type="button" class="upl-btn" id="f_uplbtn" onclick="document.getElementById(\'f_file\').click()">Upload</button></div>'+
      '<input type="file" id="f_file" accept="image/*" style="display:none" onchange="uploadImg(this)">'+
      '<small class="fhint">Upload a photo from your device, or paste an image URL.</small>'+
      '<img class="imgprev" id="f_prev"></div>'+
    '<div class="fld"><label>Options label (optional)</label><input id="f_optlabel" value="'+esc(it&&it.options?it.options.label||'':'')+'" placeholder="e.g. Chocolate"></div>'+
    '<div class="fld"><label>Option choices &mdash; comma separated (optional)</label><input id="f_optchoices" value="'+esc(it&&it.options&&it.options.choices?it.options.choices.map(c=>(c&&typeof c==='object')?(c.price!=null?c.name+':'+c.price:c.name):c).join(', '):'')+'" placeholder="e.g. Dark, White, Milk  or  Single:250, Double:400"><small class="fhint">Leave blank for no options. Add a price per choice with a colon, e.g. Single:250, Double:400. First choice shows as selected.</small></div>'+
    '<div class="sheet-actions"><button class="cancel" onclick="closeSheet()">Cancel</button><button class="save" onclick="saveItem(\''+cid+'\',\''+(it?it.id:'')+'\')">Save</button></div>';
}
function setVeg(v){_veg=v;document.getElementById('veg_v').classList.toggle('sel',v);document.getElementById('veg_n').classList.toggle('sel',!v);}
function setAvail(v){_avail=v;document.getElementById('av_y').classList.toggle('sel',v);document.getElementById('av_n').classList.toggle('sel',!v);}
function setPopular(v){_popular=v;document.getElementById('mt_y').classList.toggle('sel',v);document.getElementById('mt_n').classList.toggle('sel',!v);}
function prevImg(){const u=document.getElementById('f_img').value.trim();const p=document.getElementById('f_prev');if(u){p.src=u;p.style.display='block';p.onerror=()=>{p.style.display='none';};}else p.style.display='none';}
// Take a device photo, shrink it in the browser, upload the small file to Supabase
// Storage, and store only its short public URL in the menu (keeps the menu JSON tiny).
const IMG_BUCKET='menu-images';   // public bucket in Supabase → Storage
const IMG_MAX_DIM=900;            // longest edge, px — sharp on phones, small on the wire
const IMG_QUALITY=0.72;           // JPEG quality
function shrinkToBlob(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      URL.revokeObjectURL(url);
      let {width:w,height:h}=img;
      if(Math.max(w,h)>IMG_MAX_DIM){const s=IMG_MAX_DIM/Math.max(w,h);w=Math.round(w*s);h=Math.round(h*s);}
      const cv=document.createElement('canvas');cv.width=w;cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      cv.toBlob(b=>b?resolve(b):reject(new Error('Could not encode image')),'image/jpeg',IMG_QUALITY);
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Could not read that image'));};
    img.src=url;
  });
}
async function uploadImg(input){
  if(!authed){toast('Unlock first');return;}
  const file=input.files&&input.files[0];input.value='';
  if(!file)return;
  if(!/^image\//.test(file.type)){toast('Please choose an image file');return;}
  if(file.size>15*1024*1024){toast('Image too large (max 15 MB)');return;}
  const btn=document.getElementById('f_uplbtn');const label=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='Uploading…';}
  try{
    const blob=await shrinkToBlob(file);
    const path='items/'+Date.now().toString(36)+'-'+Math.floor(performance.now()).toString(36)+'.jpg';
    const {error}=await sb.storage.from(IMG_BUCKET).upload(path,blob,{cacheControl:'31536000',upsert:false,contentType:'image/jpeg'});
    if(error)throw error;
    const {data}=sb.storage.from(IMG_BUCKET).getPublicUrl(path);
    const url=data&&data.publicUrl;
    if(!url)throw new Error('No public URL returned');
    const inp=document.getElementById('f_img');if(inp)inp.value=url;
    prevImg();toast('Image uploaded');
  }catch(err){
    toast('Upload failed: '+((err&&err.message)||err));
  }finally{
    if(btn){btn.disabled=false;btn.textContent=label||'Upload';}
  }
}
function addItem(cid){_veg=true;_avail=true;_popular=false;openSheet(itemForm(cid,null));setTimeout(prevImg,0);}
function editItem(cid,iid){const it=findItem(cid,iid);_veg=!!it.veg;_avail=it.available!==false;_popular=!!it.popular;openSheet(itemForm(cid,it));setTimeout(prevImg,0);}
function saveItem(cid,iid){
  if(!authed)return;
  const name=document.getElementById('f_name').value.trim();
  if(!name){toast('Please enter a name');return;}
  const obj={name:name,desc:document.getElementById('f_desc').value.trim(),price:Math.max(0,parseInt(document.getElementById('f_price').value||'0',10)||0),veg:_veg,available:_avail,image:document.getElementById('f_img').value.trim()};
  const choices=document.getElementById('f_optchoices').value.split(',').map(s=>s.trim()).filter(Boolean)
    .map(tok=>{const m=tok.match(/^(.+?):\s*(\d+)\s*$/);return m?{name:m[1].trim(),price:parseInt(m[2],10)}:tok;});
  if(choices.length)obj.options={label:document.getElementById('f_optlabel').value.trim()||'Options',choices:choices};
  if(_popular)obj.popular=true;
  const badge=(document.getElementById('f_badge')||{}).value||'';
  if(badge)obj.badge=badge;
  const special=parseInt(document.getElementById('f_special').value||'',10)||0;
  if(special>0)obj.special=special;
  const cat=findCat(cid);
  if(iid){const ex=findItem(cid,iid);Object.assign(ex,obj);if(!choices.length)delete ex.options;if(!_popular)delete ex.popular;if(!badge)delete ex.badge;if(!(special>0))delete ex.special;}else{obj.id=uid('it');cat.items.push(obj);}
  save();closeSheet();render();renderChips();toast(iid?'Item updated':'Item added');
}
function delItem(cid,iid){if(!authed)return;const cat=findCat(cid);const it=findItem(cid,iid);if(confirm('Delete "'+it.name+'"?')){cat.items=cat.items.filter(i=>i.id!==iid);save();render();renderChips();toast('Item deleted');}}

function addCat(){openSheet('<h3>Add category</h3><div class="fld"><label>Category name</label><input id="c_name" placeholder="e.g. Cold Coffee"></div><div class="sheet-actions"><button class="cancel" onclick="closeSheet()">Cancel</button><button class="save" onclick="saveCat()">Add</button></div>');}
function saveCat(){if(!authed)return;const n=document.getElementById('c_name').value.trim();if(!n){toast('Enter a name');return;}menu.categories.push({id:uid('cat'),category:n,items:[]});save();closeSheet();render();renderChips();toast('Category added');}
function delCat(cid){if(!authed)return;const c=findCat(cid);if(confirm('Delete category "'+c.category+'" and its '+c.items.length+' items?')){menu.categories=menu.categories.filter(x=>x.id!==cid);if(activeCat===cid)activeCat='ALL';save();render();renderChips();toast('Category deleted');}}

// ---- Bulk offer / "today" pricing ----
function offerCount(){let n=0;menu.categories.forEach(c=>c.items.forEach(it=>{if(it.special!=null)n++;}));return n;}
function currentOfferPrice(){for(const c of menu.categories){for(const it of c.items){if(it.special!=null)return it.special;}}return '';}
function openOfferTool(){
  if(!authed){openAuth();return;}
  const active=offerCount();
  // one checklist: tick whole categories and/or individual items (pre-checked if already on offer)
  let list='<div class="of-tools"><input id="of_search" class="of-search" placeholder="Search items…" oninput="offerFilter()"><label class="of-selall"><input type="checkbox" id="of_all" onchange="offerToggleAll(this)"> All</label></div>';
  menu.categories.forEach(c=>{
    list+='<div class="of-cat"><label class="of-catall"><input type="checkbox" class="of-catcheck" data-cat="'+c.id+'" onchange="offerToggleCat(this)"> '+esc(c.category)+' <span class="of-catn">'+c.items.length+'</span></label>';
    c.items.forEach(it=>{
      list+='<label class="of-item"><input type="checkbox" class="of-check" data-cat="'+c.id+'" value="'+it.id+'"'+(it.special!=null?' checked':'')+' onchange="offerSyncCats()"><span>'+esc(it.name)+'</span></label>';
    });
    list+='</div>';
  });
  openSheet('<h3>Offer pricing</h3>'+
    '<div class="fld"><label>Offer price ('+CUR+')</label><input id="of_price" type="number" min="0" step="1" value="'+(active?currentOfferPrice():'')+'" placeholder="e.g. 99"></div>'+
    '<div class="fld"><label>Choose categories &amp; items</label><div class="of-list" id="of_list">'+list+'</div></div>'+
    '<small class="fhint">Tick whole <b>categories</b> and/or individual <b>items</b>. Apply sets the offer price on everything ticked (and removes it from anything unticked). The regular price shows struck-through next to it.</small>'+
    (active?'<p class="fhint" style="margin:6px 0 12px">Currently '+active+' item'+(active===1?'':'s')+' on offer.</p>':'')+
    '<div class="sheet-actions"><button class="cancel" onclick="clearOffers()">Clear all offers</button><button class="save" onclick="applyOffer()">Apply offer</button></div>');
  offerSyncCats();
}
function offerToggleAll(cb){document.querySelectorAll('#of_list .of-check').forEach(c=>{if(c.closest('.of-item').style.display!=='none')c.checked=cb.checked;});offerSyncCats();}
function offerToggleCat(cb){document.querySelectorAll('.of-check[data-cat="'+cb.getAttribute('data-cat')+'"]').forEach(c=>{if(c.closest('.of-item').style.display!=='none')c.checked=cb.checked;});offerSyncCats();}
// Reflect category & master checkbox state (checked / indeterminate) from the item checkboxes.
function offerSyncCats(){
  menu.categories.forEach(c=>{
    const boxes=[...document.querySelectorAll('.of-check[data-cat="'+c.id+'"]')];if(!boxes.length)return;
    const on=boxes.filter(b=>b.checked).length,cc=document.querySelector('.of-catcheck[data-cat="'+c.id+'"]');
    if(cc){cc.checked=on===boxes.length;cc.indeterminate=on>0&&on<boxes.length;}
  });
  const all=[...document.querySelectorAll('#of_list .of-check')],on=all.filter(b=>b.checked).length,m=document.getElementById('of_all');
  if(m){m.checked=all.length>0&&on===all.length;m.indeterminate=on>0&&on<all.length;}
}
function offerFilter(){
  const q=(document.getElementById('of_search').value||'').trim().toLowerCase();
  document.querySelectorAll('#of_list .of-item').forEach(l=>{l.style.display=(!q||l.textContent.toLowerCase().includes(q))?'':'none';});
  document.querySelectorAll('#of_list .of-cat').forEach(c=>{const any=[...c.querySelectorAll('.of-item')].some(l=>l.style.display!=='none');c.style.display=any?'':'none';});
}
function applyOffer(){
  if(!authed)return;
  const p=parseInt(document.getElementById('of_price').value||'0',10)||0;
  if(p<=0){toast('Enter an offer price');return;}
  const checked=new Set([...document.querySelectorAll('.of-check:checked')].map(c=>c.value));
  if(!checked.size){toast('Tick at least one category or item');return;}
  let n=0;
  menu.categories.forEach(c=>c.items.forEach(it=>{if(checked.has(it.id)){it.special=p;n++;}else delete it.special;}));
  save();closeSheet();render();renderChips();toast('Offer '+CUR+p+' set on '+n+' item'+(n===1?'':'s'));
}
function clearOffers(){
  if(!authed)return;
  const n=offerCount();
  if(!n){toast('No offers to clear');return;}
  if(!confirm('Remove offer pricing from all '+n+' item'+(n===1?'':'s')+'?'))return;
  menu.categories.forEach(c=>c.items.forEach(it=>{delete it.special;}));
  save();closeSheet();render();renderChips();toast('Cleared all offers');
}

// ---- Editable site / page texts (owner-editable, stored with the menu) ----
const SITE_DEFAULTS={
  brand:'Waffle Castle',
  location:'WAGHODIA · VADODARA',
  tagline:'Taste the Royal Waffle',
  subline:'Browse & order at the counter',
  contactTitle:'Visit Us',
  phone:'+91 91730 40112',
  whatsapp:'+91 91730 40112',
  instaHandle:'@waffle_castle_waghodia',
  instaUrl:'https://instagram.com/waffle_castle_waghodia',
  address:'GF-31, Phoenix Resicom, Near Vaikunth Char Rasta, Waghodia Road, Madhavpura, Vadodara - 390019',
  mapUrl:'https://www.google.com/maps/dir/?api=1&destination=22.2984426%2C73.2488259&destination_place_id=Waffle+Castle+Vadodara+Waghodia',
  hoursLabel:'Open daily',
  hours:'11:00 AM – 11:00 PM',
  discTitle:'In-store orders only',
  discText:'This menu is applicable for **in-store orders only**. Prices are **not applicable** on online ordering platforms like Zomato / Swiggy, etc.'
};
const SITE_KEYS=Object.keys(SITE_DEFAULTS);
function SITE(k){const v=menu&&menu.site&&menu.site[k];return (v!=null&&String(v).trim()!=='')?v:SITE_DEFAULTS[k];}
function digits(s){return String(s||'').replace(/[^\d]/g,'');}
// Push the current texts into the static DOM elements (safe to call anytime).
function applySiteTexts(){
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('s_brand',SITE('brand'));set('s_footBrand',SITE('brand'));set('s_copyBrand',SITE('brand'));
  set('s_location',SITE('location'));set('s_tagline',SITE('tagline'));set('s_subline',SITE('subline'));
  set('s_contactTitle',SITE('contactTitle'));set('s_phone',SITE('phone'));set('s_insta',SITE('instaHandle'));
  set('s_address',SITE('address'));set('s_hoursLabel',SITE('hoursLabel'));set('s_hours',SITE('hours'));
  set('s_discTitle',SITE('discTitle'));
  const dt=document.getElementById('s_discText');if(dt)dt.innerHTML=fmtOffer(SITE('discText'));   // supports **bold**
  const tel='tel:+'+digits(SITE('phone'));
  document.querySelectorAll('.callbtn,#s_callCard').forEach(a=>a.setAttribute('href',tel));
  const wa=document.getElementById('s_waCard');if(wa)wa.setAttribute('href','https://wa.me/'+digits(SITE('whatsapp')));
  const ig=document.getElementById('s_igCard');if(ig)ig.setAttribute('href',SITE('instaUrl'));
  const dir=document.getElementById('s_dir');if(dir)dir.setAttribute('href',SITE('mapUrl'));
  try{document.title=SITE('brand')+' - Menu';}catch(e){}
}
const SITE_FORM=[['brand','Brand name'],['location','Location line'],['tagline','Banner tagline'],['subline','Banner subline'],
  ['contactTitle','Contact heading'],['phone','Phone (shown)'],['whatsapp','WhatsApp number'],['instaHandle','Instagram handle'],
  ['instaUrl','Instagram link'],['address','Address',1],['mapUrl','Google Maps link',1],['hoursLabel','Hours label'],
  ['hours','Hours'],['discTitle','Disclaimer title'],['discText','Disclaimer text (use **bold**)',1]];
function openSiteEditor(){
  if(!authed){openAuth();return;}
  const fields=SITE_FORM.map(([k,label,ta])=>'<div class="fld"><label>'+label+'</label>'+
    (ta?'<textarea id="st_'+k+'">'+esc(SITE(k))+'</textarea>':'<input id="st_'+k+'" value="'+esc(SITE(k))+'">')+'</div>').join('');
  openSheet('<h3>Edit page texts</h3>'+fields+
    '<small class="fhint">These update the header, banner and contact page for everyone. Menu items &amp; offers are edited from their own cards.</small>'+
    '<div class="sheet-actions"><button class="cancel" onclick="closeSheet()">Cancel</button><button class="save" onclick="saveSite()">Save</button></div>');
}
function saveSite(){
  if(!authed)return;
  menu.site=menu.site||{};
  SITE_KEYS.forEach(k=>{const el=document.getElementById('st_'+k);if(el)menu.site[k]=el.value.trim();});
  save();applySiteTexts();closeSheet();toast('Page texts updated');
}

// ---- Owner authentication (gates edit / delete) ----
function reflectAuth(){
  document.getElementById('gear').style.display=authed?'inline-flex':'none';
  if(!authed&&manage){manage=false;document.body.classList.remove('manage');document.getElementById('gear').classList.remove('on');}
}
function openAuth(){
  openSheet('<h3><svg class="ico" viewBox="0 0 24 24" style="width:18px;height:18px;vertical-align:-3px"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Owner login</h3>'+
    '<div class="fld"><label>Password</label><input id="f_pass" type="password" placeholder="Enter password" autocomplete="current-password"></div>'+
    '<div class="sheet-actions"><button class="cancel" onclick="closeSheet()">Cancel</button><button class="save" onclick="tryAuth()">Unlock</button></div>');
  setTimeout(()=>{const el=document.getElementById('f_pass');if(el){el.focus();el.addEventListener('keydown',e=>{if(e.key==='Enter')tryAuth();});}},0);
}
function tryAuth(){
  const el=document.getElementById('f_pass');if(!el)return;
  const pw=el.value;
  toast('Signing in…');
  sb.auth.signInWithPassword({email:OWNER_EMAIL,password:pw}).then(({data,error})=>{
    if(error||!data||!data.session){toast(error&&/confirm/i.test(error.message)?'Confirm the owner email in Supabase':'Wrong password');const e2=document.getElementById('f_pass');if(e2){e2.value='';e2.focus();}return;}
    authed=true;
    closeSheet();reflectAuth();
    manage=true;document.body.classList.add('manage');document.getElementById('gear').classList.add('on');
    render();toast('Unlocked — Manage mode ON');
    seedIfEmpty();
  });
}
// On first login, if the cloud menu is empty, publish the current (built-in) menu so the DB has data.
async function seedIfEmpty(){
  try{const {data}=await sb.from('menu').select('id').eq('id',1).maybeSingle();
    if(!data){await save();toast('Menu published to cloud');}}catch(e){}
}
function lock(){
  authed=false;manage=false;try{sb.auth.signOut();}catch(e){}
  document.body.classList.remove('manage');document.getElementById('gear').classList.remove('on');
  reflectAuth();render();toast('Locked');
}
// Owner editing is reachable only via the secret admin link (ADMIN_HASH), then the password.
function maybeAdmin(){if(!authed&&location.hash.toLowerCase()===ADMIN_HASH.toLowerCase())openAuth();}
window.addEventListener('hashchange',maybeAdmin);
document.getElementById('lockBtn').onclick=lock;
document.getElementById('gear').onclick=()=>{
  if(!authed){openAuth();return;}
  manage=!manage;document.body.classList.toggle('manage',manage);document.getElementById('gear').classList.toggle('on',manage);render();toast(manage?'Manage mode ON':'Manage mode OFF');
};
document.getElementById('search').addEventListener('input',render);
// ---- CSV export / import (full menu) ----
const CSV_COLS=['id','category','name','description','price','offer_price','veg','available','must_try','badge','image','option_label','option_choices'];
function csvCell(v){v=String(v==null?'':v);return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}
function menuToCSV(){
  const rows=[CSV_COLS.join(',')];
  menu.categories.forEach(cat=>cat.items.forEach(it=>{
    rows.push([it.id,cat.category,it.name,it.desc||'',it.price||0,it.special||'',it.veg?'Veg':'Non-veg',
      it.available===false?'No':'Yes',it.popular?'Yes':'No',it.badge||'',it.image||'',
      it.options&&it.options.label?it.options.label:'',
      it.options&&it.options.choices?it.options.choices.map(c=>(c&&typeof c==='object')?(c.price!=null?c.name+':'+c.price:c.name):c).join('|'):''].map(csvCell).join(','));
  }));
  return rows.join('\r\n');
}
function parseCSV(text){
  const rows=[];let row=[],cur='',i=0,inq=false;text=text.replace(/^﻿/,'');
  while(i<text.length){const c=text[i];
    if(inq){if(c==='"'){if(text[i+1]==='"'){cur+='"';i+=2;continue;}inq=false;i++;continue;}cur+=c;i++;continue;}
    if(c==='"'){inq=true;i++;continue;}
    if(c===','){row.push(cur);cur='';i++;continue;}
    if(c==='\r'){i++;continue;}
    if(c==='\n'){row.push(cur);rows.push(row);row=[];cur='';i++;continue;}
    cur+=c;i++;}
  if(cur!==''||row.length){row.push(cur);rows.push(row);}
  return rows;
}
function csvToMenu(text){
  const rows=parseCSV(text).filter(r=>r.some(c=>String(c).trim()!==''));
  if(rows.length<2)throw 'Empty CSV';
  const H=rows[0].map(h=>h.trim().toLowerCase());
  const col=n=>H.indexOf(n);
  const ci={id:col('id'),cat:col('category'),name:col('name'),desc:col('description')<0?col('desc'):col('description'),
    price:col('price'),veg:col('veg'),avail:[col('available'),col('enabled'),col('enable'),col('status'),col('show')].find(i=>i>=0)??-1,
    mt:[col('must_try'),col('musttry'),col('featured'),col('popular')].find(i=>i>=0)??-1,
    badge:col('badge'),sp:[col('offer_price'),col('special'),col('offer')].find(i=>i>=0)??-1,img:col('image'),ol:col('option_label'),oc:col('option_choices')};
  if(ci.cat<0||ci.name<0)throw 'CSV needs at least "category" and "name" columns';
  const get=(row,k)=>ci[k]>=0&&row[ci[k]]!=null?String(row[ci[k]]).trim():'';
  const cats=[],byName={};
  for(let r=1;r<rows.length;r++){
    const row=rows[r],cn=get(row,'cat'),nm=get(row,'name');
    if(!cn||!nm)continue;
    let cat=byName[cn];if(!cat){cat={id:uid('cat'),category:cn,items:[]};byName[cn]=cat;cats.push(cat);}
    const vraw=get(row,'veg').toLowerCase(),araw=get(row,'avail').toLowerCase();
    const it={id:get(row,'id')||uid('it'),name:nm,desc:get(row,'desc'),
      price:Math.max(0,parseInt(get(row,'price')||'0',10)||0),
      veg:!(vraw==='non-veg'||vraw==='nonveg'||vraw==='false'||vraw==='no'||vraw==='n'),
      available:!['no','false','n','0','unavailable','off','disable','disabled','hide','hidden','inactive','x'].includes(araw),
      image:get(row,'img')};
    const mtraw=get(row,'mt').toLowerCase();
    if(['yes','true','1','y','must try','musttry','featured','popular','star'].includes(mtraw))it.popular=true;
    const bdraw=get(row,'badge').toLowerCase().replace(/[^a-z]/g,'');
    if(['bestseller','new','spicy'].includes(bdraw))it.badge=bdraw;
    const spraw=parseInt(get(row,'sp'),10)||0;
    if(spraw>0)it.special=spraw;
    const oc=get(row,'oc');
    if(oc){const ch=oc.split(/[|;]/).map(s=>s.trim()).filter(Boolean).map(tok=>{const m=tok.match(/^(.+?):\s*(\d+)\s*$/);return m?{name:m[1].trim(),price:parseInt(m[2],10)}:tok;});if(ch.length)it.options={label:get(row,'ol')||'Options',choices:ch};}
    cat.items.push(it);
  }
  if(!cats.length)throw 'No valid rows found';
  return {restaurant:menu.restaurant,tagline:menu.tagline,source:menu.source,offers:menu.offers||'',offersTitle:menu.offersTitle||'',site:menu.site,categories:cats};
}
document.getElementById('exportBtn').onclick=()=>{
  const blob=new Blob(['﻿'+menuToCSV()],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='waffle-castle-menu.csv';a.click();
  toast('Exported menu CSV');
};
document.getElementById('importBtn').onclick=()=>{if(!authed){toast('Unlock first');return;}document.getElementById('fileIn').click();};
document.getElementById('fileIn').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=()=>{try{const d=csvToMenu(r.result);if(!confirm('Replace the whole menu with '+d.categories.reduce((a,c)=>a+c.items.length,0)+' items from this CSV?'))return;menu=d;save();activeCat='ALL';collapsed.clear();render();renderChips();toast('Menu updated from CSV');}catch(err){toast('CSV error: '+err);}};
  r.readAsText(f);e.target.value='';};
document.getElementById('resetBtn').onclick=()=>{if(!authed){toast('Unlock first');return;}if(confirm('Reset to the original built-in menu? This replaces the live menu for everyone.')){menu=JSON.parse(JSON.stringify(window.DEFAULT_MENU));activeCat='ALL';collapsed.clear();save();render();renderChips();toast('Menu reset');}};

// Back-to-top crown button
const toTop=document.getElementById('toTop');
// Back-to-top button + iOS Instagram-style bottom bar shrink on scroll-down / expand on scroll-up.
// Uses a direction accumulator (robust against mobile momentum / address-bar jitter), rAF-throttled,
// and only writes classes when the state actually flips (keeps the CSS transition buttery).
const _tabbar=document.querySelector('.tabbar');
let _lastY=0,_acc=0,_navShrunk=false,_ticking=false;
function _setNav(shrink){
  if(shrink===_navShrunk)return;
  _navShrunk=shrink;
  if(_tabbar)_tabbar.classList.toggle('shrunk',shrink);
  document.body.classList.toggle('nav-shrunk',shrink);
}
function _onScroll(){
  const y=Math.max(0,(window.scrollY||(document.scrollingElement&&document.scrollingElement.scrollTop)||0));
  if(toTop)toTop.classList.toggle('show',y>420);
  const dy=y-_lastY;
  if((dy>0)!==(_acc>0))_acc=0;      // direction flipped → reset the accumulator
  _acc+=dy;
  if(y<=24)_setNav(false);           // near the top → always full size
  else if(_acc>14)_setNav(true);     // moved down enough → shrink
  else if(_acc<-14)_setNav(false);   // moved up enough → expand
  _lastY=y;_ticking=false;
}
window.addEventListener('scroll',()=>{if(!_ticking){_ticking=true;requestAnimationFrame(_onScroll);}},{passive:true});
if(toTop)toTop.onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
// Interactive mascot — royal greetings
const GREETINGS=['Welcome to the castle!','Browse the menu & order at the counter','Your royal treat awaits!','Feast like royalty!'];
let _g=0;
const mascot=document.getElementById('mascot');
if(mascot)mascot.onclick=()=>{toast(GREETINGS[_g++%GREETINGS.length]);};

const _yr=document.getElementById('year');if(_yr)_yr.textContent=new Date().getFullYear();

// ---- Bottom tab navigation (Menu / Offers / Contact) ----
const TABS=['menu','offers','contact'];
function showTab(name){
  if(TABS.indexOf(name)<0)name='menu';
  TABS.forEach(t=>{
    const panel=document.getElementById('tab-'+t);
    if(panel){panel.classList.toggle('active',t===name);panel.setAttribute('aria-hidden',t===name?'false':'true');}
  });
  document.querySelectorAll('.tabbtn').forEach(b=>{
    const on=b.dataset.tab===name;
    b.classList.toggle('active',on);b.setAttribute('aria-selected',on?'true':'false');
  });
  document.body.classList.remove('tab-menu','tab-offers','tab-contact');
  document.body.classList.add('tab-'+name);
  window.scrollTo({top:0,behavior:'auto'});
}
document.querySelectorAll('.tabbtn').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
showTab('menu');

// ---- Boot: restore owner session, load live menu from cloud, subscribe to realtime updates ----
async function boot(){
  renderSkeleton();   // shimmer placeholders while the live menu loads from the cloud
  try{const {data}=await sb.auth.getSession();authed=!!(data&&data.session);}catch(e){}
  await loadMenu();
  reflectAuth();renderChips();render();applySiteTexts();maybeAdmin();
  try{
    sb.channel('menu-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'menu'},payload=>{
        if(payload&&payload.new&&payload.new.data){menu=payload.new.data;renderChips();render();applySiteTexts();}
      }).subscribe();
  }catch(e){}
}
boot();
