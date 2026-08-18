const CUR='₹';
// ▼▼▼ Backend (Supabase) — safe to be public; writes are protected by Row Level Security ▼▼▼
const SUPABASE_URL='https://pyhtrkylkykqwklrzitm.supabase.co';
const SUPABASE_KEY='sb_publishable_th2b-0LngMIeET39bLchaA_RacvqIZ-';
const OWNER_EMAIL='jashpalrohit002@gmail.com';   // owner login (email hidden from UI; only password is typed)
const ADMIN_HASH='#wc-admin';                    // secret link to reach the owner login
// ▲▲▲ CHANGE THESE ▲▲▲
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let menu=null, activeCat='ALL', manage=false, idCounter=0, _veg=true, _avail=true;
// an item is visible to customers unless explicitly marked unavailable; owners (manage) see all
function isVisible(it){return manage||it.available!==false;}
let authed=false;
const collapsed=new Set();   // category ids that are collapsed
let offersOpen=false;        // "Offers & Notes" panel starts collapsed; expands on click

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

function openCatMenu(){document.getElementById('catMenu').classList.add('show');const b=document.getElementById('catBtn');b.classList.add('open');b.setAttribute('aria-expanded','true');}
function closeCatMenu(){document.getElementById('catMenu').classList.remove('show');const b=document.getElementById('catBtn');b.classList.remove('open');b.setAttribute('aria-expanded','false');}
// builds the category dropdown (name kept as renderChips since it's called throughout)
function renderChips(){
  const vcount=c=>c.items.filter(isVisible).length;
  const total=menu.categories.reduce((a,c)=>a+vcount(c),0);
  let curName='All Categories';
  if(activeCat!=='ALL'){const c=findCat(activeCat);if(c)curName=c.category;}
  document.getElementById('catCur').textContent=curName;
  const box=document.getElementById('catMenu');
  let h='<button type="button" class="catopt'+(activeCat==='ALL'?' active':'')+'" data-cat="ALL">All Categories <span class="n">'+total+'</span></button>';
  menu.categories.forEach(c=>{if(!manage&&!vcount(c))return;h+='<button type="button" class="catopt'+(activeCat===c.id?' active':'')+'" data-cat="'+c.id+'">'+esc(c.category)+' <span class="n">'+vcount(c)+'</span></button>';});
  box.innerHTML=h;
  box.querySelectorAll('.catopt').forEach(op=>op.onclick=()=>{
    activeCat=op.dataset.cat;
    if(activeCat!=='ALL')collapsed.delete(activeCat);   // selecting a category opens it
    closeCatMenu();
    renderChips();render();
    if(activeCat!=='ALL'){const el=document.getElementById('c-'+activeCat);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});}
  });
}

function fmtPrice(p){p=parseInt(p,10)||0;return p>0?'<span class="cur">'+CUR+'</span>'+p:'Price on request';}
// choices may be plain strings ("Dark") or {name, price} for per-option pricing
function normChoices(opts){if(!opts||!opts.choices)return null;return opts.choices.map(c=>(c&&typeof c==='object')?{name:c.name,price:(c.price==null?null:c.price)}:{name:c,price:null});}
function itemRow(cat,it){
  const img=it.image?'<img loading="lazy" src="'+esc(it.image)+'" alt="'+esc(it.name)+'" onerror="this.parentNode.innerHTML=\'<div class=&quot;noimg&quot;></div>\'">':'<div class="noimg"></div>';
  const diet='<span class="diet '+(it.veg?'':'n')+'"><i></i></span>';
  let opts='', shownPrice=it.price||0;
  const ch=normChoices(it.options);
  if(ch&&ch.length){
    if(ch[0].price!=null)shownPrice=ch[0].price;
    opts='<div class="opts"><span class="opts-lbl">'+esc(it.options.label||'Options')+':</span>'+
      ch.map((c,i)=>'<button type="button" class="opt'+(i===0?' sel':'')+'" data-price="'+(c.price==null?'':c.price)+'" onclick="selOpt(this)">'+esc(c.name)+(c.price!=null?' <b class="opt-price">'+CUR+c.price+'</b>':'')+'</button>').join('')+
      '</div>';
  }
  const price='<div class="price'+(shownPrice>0?'':' zero')+'">'+fmtPrice(shownPrice)+'</div>';
  const unavail=it.available===false;
  const tag=unavail?'<span class="ntag">Unavailable</span>':'';
  let acts='';
  if(manage)acts='<div class="row-actions"><button class="mini" onclick="editItem(\''+cat.id+'\',\''+it.id+'\')">Edit</button><button class="mini danger" onclick="delItem(\''+cat.id+'\',\''+it.id+'\')">Delete</button></div>';
  return '<div class="item'+(unavail?' unavail':'')+'"><div class="thumb">'+img+'</div><div class="info"><div class="name">'+diet+esc(it.name)+tag+'</div>'+(it.desc?'<div class="desc">'+esc(it.desc)+'</div>':'')+opts+price+acts+'</div></div>';
}

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
    items.forEach(it=>catsHtml+=itemRow(cat,it));
    if(manage)catsHtml+='<button class="additem" onclick="addItem(\''+cat.id+'\')">+ Add item to '+esc(cat.category)+'</button>';
    catsHtml+='</div></div>';
  });
  let top='';
  if(!f&&shownCats.length>1){
    const allColl=shownCats.every(id=>collapsed.has(id));
    top='<div class="acc-tools"><button class="accbtn" onclick="toggleAll()">'+(allColl?IC_EXPAND+' Expand all':IC_COLLAPSE+' Collapse all')+'</button></div>';
  }
  let html=top+catsHtml;
  if(manage)html+='<button class="addcat" onclick="addCat()">+ Add new category</button>';
  if(!shown&&!manage)html='<div class="empty">No items match your search.</div>';
  app.classList.toggle('noanim', !!f);   // skip entrance animation while searching
  app.innerHTML=html;
  document.getElementById('count').textContent=menu.categories.reduce((a,c)=>a+c.items.length,0)+' items in '+menu.categories.length+' categories';
  renderOffers();
}
// ---- Offers & Notes (collapsible; owner-editable, stored with the menu in Supabase) ----
// Escape first (safe), then turn **wrapped** text into bold. Owner writes **like this**.
function fmtOffer(s){return esc(s).replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>');}
const IC_OFFER='<svg class="ico offers-ico" viewBox="0 0 24 24"><path d="M20 12v9H4v-9"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>';
function renderOffers(){
  const box=document.getElementById('offersWrap');
  if(!box)return;
  const txt=(menu&&menu.offers?String(menu.offers):'').trim();
  // Hide entirely from customers when there's nothing to show; owners always see it (to add content).
  if(!txt&&!manage){box.innerHTML='';document.body.classList.remove('has-offers','offers-open');return;}
  document.body.classList.add('has-offers');   // lifts the back-to-top button & footer above the dock
  document.body.classList.toggle('offers-open',offersOpen);   // hide the back-to-top FAB while the panel is open
  const lines=txt.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  let body;
  if(lines.length)body=lines.map(l=>'<div class="offer-line">'+fmtOffer(l)+'</div>').join('');
  else body='<div class="offers-empty">No offers or notes yet. Tap Edit to add some.</div>';
  const editBtn=manage?'<button class="mini offers-edit" onclick="event.stopPropagation();editOffers()">Edit</button>':'';
  const open=offersOpen;
  // Panel is rendered ABOVE the button so the sticky dock expands upward on click.
  box.innerHTML=
    '<div class="offers-panel'+(open?'':' collapsed')+'"><div class="offers-panel-inner">'+body+'</div></div>'+
    '<button type="button" class="offers-head'+(open?' open':'')+'" aria-expanded="'+(open?'true':'false')+'" onclick="toggleOffers()">'+
      IC_OFFER+'<span class="offers-title">'+esc(menu&&menu.offersTitle?menu.offersTitle:'Offers & Notes')+'</span>'+editBtn+
      '<span class="chev"><svg class="ico" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></span>'+
    '</button>';
}
function setOffersOpen(open){
  offersOpen=open;
  const panel=document.querySelector('.offers-panel');
  const head=document.querySelector('.offers-head');
  if(panel)panel.classList.toggle('collapsed',!open);
  if(head)head.classList.toggle('open',open);
  document.body.classList.toggle('offers-open',open);
}
function toggleOffers(){setOffersOpen(!offersOpen);}
// Tapping anywhere outside the dock closes the expanded panel
document.addEventListener('click',e=>{if(offersOpen&&!e.target.closest('.offers-wrap'))setOffersOpen(false);});
// Esc closes it too
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&offersOpen)setOffersOpen(false);});
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
  save();closeSheet();setOffersOpen(true);renderOffers();toast('Offers & notes updated');
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
  if(pr){const info=btn.closest('.info');const pe=info&&info.querySelector('.price');if(pe){const p=parseInt(pr,10)||0;pe.className='price'+(p>0?'':' zero');pe.innerHTML=fmtPrice(p);}}
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
function openSheet(html){document.getElementById('sheet').innerHTML=html;document.getElementById('overlay').classList.add('show');}
function closeSheet(){document.getElementById('overlay').classList.remove('show');}
document.getElementById('overlay').addEventListener('click',e=>{if(e.target.id==='overlay')closeSheet();});

function itemForm(cid,it){
  const veg=it?it.veg:true;
  const avail=it?it.available!==false:true;
  return '<h3>'+(it?'Edit item':'Add item')+'</h3>'+
    '<div class="fld"><label>Availability</label><div class="veg-toggle"><button type="button" id="av_y" class="'+(avail?'sel':'')+'" onclick="setAvail(true)">Available</button><button type="button" id="av_n" class="'+(avail?'':'sel')+'" onclick="setAvail(false)">Unavailable</button></div></div>'+
    '<div class="fld"><label>Name</label><input id="f_name" value="'+esc(it?it.name:'')+'" placeholder="e.g. Belgian Chocolate Waffle"></div>'+
    '<div class="fld"><label>Description</label><textarea id="f_desc" placeholder="Short description">'+esc(it?it.desc:'')+'</textarea></div>'+
    '<div class="fld"><label>Price ('+CUR+')</label><input id="f_price" type="number" min="0" step="1" value="'+(it?(it.price||0):0)+'"></div>'+
    '<div class="fld"><label>Type</label><div class="veg-toggle"><button type="button" id="veg_v" class="'+(veg?'sel':'')+'" onclick="setVeg(true)">Veg</button><button type="button" id="veg_n" class="'+(veg?'':'sel')+'" onclick="setVeg(false)">Non-veg</button></div></div>'+
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
function addItem(cid){_veg=true;_avail=true;openSheet(itemForm(cid,null));setTimeout(prevImg,0);}
function editItem(cid,iid){const it=findItem(cid,iid);_veg=!!it.veg;_avail=it.available!==false;openSheet(itemForm(cid,it));setTimeout(prevImg,0);}
function saveItem(cid,iid){
  if(!authed)return;
  const name=document.getElementById('f_name').value.trim();
  if(!name){toast('Please enter a name');return;}
  const obj={name:name,desc:document.getElementById('f_desc').value.trim(),price:Math.max(0,parseInt(document.getElementById('f_price').value||'0',10)||0),veg:_veg,available:_avail,image:document.getElementById('f_img').value.trim()};
  const choices=document.getElementById('f_optchoices').value.split(',').map(s=>s.trim()).filter(Boolean)
    .map(tok=>{const m=tok.match(/^(.+?):(\d+)$/);return m?{name:m[1].trim(),price:parseInt(m[2],10)}:tok;});
  if(choices.length)obj.options={label:document.getElementById('f_optlabel').value.trim()||'Options',choices:choices};
  const cat=findCat(cid);
  if(iid){const ex=findItem(cid,iid);Object.assign(ex,obj);if(!choices.length)delete ex.options;}else{obj.id=uid('it');cat.items.push(obj);}
  save();closeSheet();render();renderChips();toast(iid?'Item updated':'Item added');
}
function delItem(cid,iid){if(!authed)return;const cat=findCat(cid);const it=findItem(cid,iid);if(confirm('Delete "'+it.name+'"?')){cat.items=cat.items.filter(i=>i.id!==iid);save();render();renderChips();toast('Item deleted');}}

function addCat(){openSheet('<h3>Add category</h3><div class="fld"><label>Category name</label><input id="c_name" placeholder="e.g. Cold Coffee"></div><div class="sheet-actions"><button class="cancel" onclick="closeSheet()">Cancel</button><button class="save" onclick="saveCat()">Add</button></div>');}
function saveCat(){if(!authed)return;const n=document.getElementById('c_name').value.trim();if(!n){toast('Enter a name');return;}menu.categories.push({id:uid('cat'),category:n,items:[]});save();closeSheet();render();renderChips();toast('Category added');}
function delCat(cid){if(!authed)return;const c=findCat(cid);if(confirm('Delete category "'+c.category+'" and its '+c.items.length+' items?')){menu.categories=menu.categories.filter(x=>x.id!==cid);if(activeCat===cid)activeCat='ALL';save();render();renderChips();toast('Category deleted');}}

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
document.getElementById('catBtn').onclick=e=>{e.stopPropagation();document.getElementById('catMenu').classList.contains('show')?closeCatMenu():openCatMenu();};
document.addEventListener('click',e=>{if(!e.target.closest('.catnav'))closeCatMenu();});
document.getElementById('search').addEventListener('input',render);
// ---- CSV export / import (full menu) ----
const CSV_COLS=['id','category','name','description','price','veg','available','image','option_label','option_choices'];
function csvCell(v){v=String(v==null?'':v);return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}
function menuToCSV(){
  const rows=[CSV_COLS.join(',')];
  menu.categories.forEach(cat=>cat.items.forEach(it=>{
    rows.push([it.id,cat.category,it.name,it.desc||'',it.price||0,it.veg?'Veg':'Non-veg',
      it.available===false?'No':'Yes',it.image||'',
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
    price:col('price'),veg:col('veg'),avail:[col('available'),col('enabled'),col('enable'),col('status'),col('show')].find(i=>i>=0)??-1,img:col('image'),ol:col('option_label'),oc:col('option_choices')};
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
    const oc=get(row,'oc');
    if(oc){const ch=oc.split(/[|;]/).map(s=>s.trim()).filter(Boolean).map(tok=>{const m=tok.match(/^(.+?):(\d+)$/);return m?{name:m[1].trim(),price:parseInt(m[2],10)}:tok;});if(ch.length)it.options={label:get(row,'ol')||'Options',choices:ch};}
    cat.items.push(it);
  }
  if(!cats.length)throw 'No valid rows found';
  return {restaurant:menu.restaurant,tagline:menu.tagline,source:menu.source,offers:menu.offers||'',offersTitle:menu.offersTitle||'',categories:cats};
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
if(toTop){
  window.addEventListener('scroll',()=>{toTop.classList.toggle('show',window.scrollY>420);},{passive:true});
  toTop.onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
}
// Interactive mascot — royal greetings
const GREETINGS=['Welcome to the castle!','Browse the menu & order at the counter','Your royal treat awaits!','Feast like royalty!'];
let _g=0;
const mascot=document.getElementById('mascot');
if(mascot)mascot.onclick=()=>{toast(GREETINGS[_g++%GREETINGS.length]);};

const _yr=document.getElementById('year');if(_yr)_yr.textContent=new Date().getFullYear();

// ---- Boot: restore owner session, load live menu from cloud, subscribe to realtime updates ----
async function boot(){
  try{const {data}=await sb.auth.getSession();authed=!!(data&&data.session);}catch(e){}
  await loadMenu();
  reflectAuth();renderChips();render();maybeAdmin();
  try{
    sb.channel('menu-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'menu'},payload=>{
        if(payload&&payload.new&&payload.new.data){menu=payload.new.data;renderChips();render();}
      }).subscribe();
  }catch(e){}
}
boot();
