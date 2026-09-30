// ▼▼▼ Same Supabase project & owner login as the menu (../app.js) ▼▼▼
const SUPABASE_URL='https://pyhtrkylkykqwklrzitm.supabase.co';
const SUPABASE_KEY='sb_publishable_th2b-0LngMIeET39bLchaA_RacvqIZ-';
const OWNER_EMAIL='jashpalrohit002@gmail.com';
// ▲▲▲ Tables & functions are created by attendance/schema.sql ▲▲▲
let sb=null;
try{sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);}catch(e){}

let authed=false, tab='punch';
let kiosk=[];                 // [{id,name,role,shift,shift_start,open_since}] from kiosk_staff()
let staff=[];                 // owner: full staff list
let rows=[];                  // owner: attendance rows for the loaded period
let view='month';             // calendar view: 'month' | 'year'
let calY, calM, calStaff='ALL', loadedKey='';
let pin='', pinStaff=null, busy=false;
const PIN_MAX=6, PIN_MIN=4;
const now0=new Date(); calY=now0.getFullYear(); calM=now0.getMonth();

// ---- helpers ----
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function toast(m,bad){const t=document.getElementById('toast');t.textContent=m;t.classList.toggle('bad',!!bad);t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2400);}
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const WD=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const pad=n=>String(n).padStart(2,'0');
const dayKey=d=>{d=new Date(d);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const fmtTime=d=>new Date(d).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true});
const fmtDay=d=>new Date(d).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
const hhmm=d=>{d=new Date(d);return pad(d.getHours())+':'+pad(d.getMinutes());};
function fmtDur(min){min=Math.max(0,Math.round(min));const h=Math.floor(min/60),m=min%60;return h?(h+'h'+(m?' '+m+'m':'')):m+'m';}
const initial=n=>(String(n||'?').trim()[0]||'?').toUpperCase();
const staffName=id=>{const s=staff.find(x=>x.id===id)||kiosk.find(x=>x.id===id)||pres.staff.find(x=>x.id===id);return s?s.name:'(removed)';};
const isToday=d=>dayKey(d)===dayKey(new Date());
// An open shift older than 16h is a forgotten punch out (matches schema.sql): it counts 0 until fixed.
const STALE_MS=16*3600e3;
const isMissingOut=r=>!r.punch_out&&Date.now()-new Date(r.punch_in)>STALE_MS;
function rowMins(r){const end=r.punch_out?new Date(r.punch_out):(isMissingOut(r)?null:new Date());return end?(end-new Date(r.punch_in))/60000:0;}
function dbErr(e){
  const m=(e&&e.message)||String(e||'');
  if(/kiosk_staff|att_save_staff|att_presence|kiosk_punch|relation .*(staff|attendance)|PGRST20[25]/i.test(m+(e&&e.code||'')))
    return 'Attendance database is not set up yet — run attendance/schema.sql in Supabase.';
  return m||'Something went wrong';
}

const IC={
  lock:'<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  unlock:'<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',
  back:'<svg class="ico" viewBox="0 0 24 24"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>',
  prev:'<svg class="ico" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>',
  next:'<svg class="ico" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>',
  plus:'<svg class="ico" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  dl:'<svg class="ico" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  check:'<svg class="ico" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
  cal:'<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  rupee:'<svg class="ico" viewBox="0 0 24 24"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 0 0-10"/></svg>',
  person:'<svg class="ico" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  users:'<svg class="ico" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></svg>'
};

// ---- bottom sheet (same markup as the menu app) ----
function openSheet(html){document.getElementById('sheet').innerHTML='<button class="sheet-close" type="button" aria-label="Close" onclick="closeSheet()"><svg class="ico" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button><div class="sheet-body">'+html+'</div>';document.getElementById('overlay').classList.add('show');}
function closeSheet(){document.getElementById('overlay').classList.remove('show');pinStaff=null;pin='';}
document.getElementById('overlay').addEventListener('click',e=>{if(e.target.id==='overlay')closeSheet();});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')return closeSheet();
  if(!pinStaff||busy)return;               // physical keyboard support for the PIN pad
  if(/^[0-9]$/.test(e.key))pinKey(e.key);
  else if(e.key==='Backspace')pinKey('back');
  else if(e.key==='Enter')doPunch();
});

// ============================================================
// Punch tab (kiosk — no login; PIN checked server-side)
// ============================================================
function tickClock(){
  const d=new Date();
  document.getElementById('clock').textContent=d.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true});
  document.getElementById('today').textContent=d.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}
async function loadKiosk(){
  if(!sb)return renderKiosk('Could not load the app. Check your internet connection and refresh.');
  const {data,error}=await sb.rpc('kiosk_staff');
  if(error)return renderKiosk(dbErr(error));
  kiosk=data||[];renderKiosk();
}
function renderKiosk(err){
  const g=document.getElementById('kioskGrid');
  const on=kiosk.filter(s=>s.open_since).length;
  document.getElementById('onShift').textContent=err||!kiosk.length?'':on+' on shift';
  if(err){g.innerHTML='<div class="att-empty">'+esc(err)+'</div>';return;}
  if(!kiosk.length){g.innerHTML='<div class="att-empty">No staff yet. The owner can add staff from the <b>Staff</b> tab.</div>';return;}
  g.innerHTML=kiosk.map((s,i)=>{
    const inn=!!s.open_since;
    return '<button type="button" class="k-tile'+(inn?' in':'')+'" style="animation-delay:'+Math.min(i,8)*40+'ms" onclick="openPin(\''+s.id+'\')">'+
      '<span class="k-av">'+esc(initial(s.name))+'</span>'+
      '<span class="k-name">'+esc(s.name)+'</span>'+
      ((s.role||s.shift)?'<span class="k-role">'+esc([s.role,SHIFTS[s.shift]&&SHIFTS[s.shift].label].filter(Boolean).join(' · '))+'</span>':'')+
      '<span class="k-st">'+(inn?'<i></i>In since '+fmtTime(s.open_since):'Off')+'</span>'+(inn?lateChip(lateMins(s.open_since,s.shift_start)):'')+
    '</button>';
  }).join('');
}
function openPin(id){
  const s=kiosk.find(x=>x.id===id);if(!s)return;
  pinStaff=s;pin='';busy=false;
  const inn=!!s.open_since;
  const keys=['1','2','3','4','5','6','7','8','9','clear','0','back'].map(k=>
    '<button type="button" class="key'+(k.length>1?' fn':'')+'" onclick="pinKey(\''+k+'\')" aria-label="'+(k==='back'?'Delete':k==='clear'?'Clear':k)+'">'+(k==='back'?IC.back:k==='clear'?'Clear':k)+'</button>').join('');
  openSheet('<div class="pin-head"><span class="k-av">'+esc(initial(s.name))+'</span><div><h3>'+esc(s.name)+'</h3>'+
      '<div class="pin-sub">'+(inn?'On shift since <b>'+fmtTime(s.open_since)+'</b> &middot; '+fmtDur((Date.now()-new Date(s.open_since))/60000):'Not punched in')+'</div></div></div>'+
    '<div class="pin-label">Enter your PIN</div>'+
    '<div class="pin-dots" id="pinDots"></div>'+
    '<div class="pin-err" id="pinErr"></div>'+
    '<div class="keypad">'+keys+'</div>'+
    '<button type="button" class="punch-btn '+(inn?'out':'in')+'" id="punchBtn" onclick="doPunch()" disabled>'+(inn?'Punch Out':'Punch In')+'</button>');
  drawPin();
}
function drawPin(){
  const d=document.getElementById('pinDots');if(!d)return;
  const n=Math.max(PIN_MIN,pin.length);
  d.innerHTML=Array.from({length:n},(_,i)=>'<i class="'+(i<pin.length?'on':'')+'"></i>').join('');
  const b=document.getElementById('punchBtn');if(b)b.disabled=busy||pin.length<PIN_MIN;
}
function pinKey(k){
  if(busy)return;
  const e=document.getElementById('pinErr');if(e)e.textContent='';
  if(k==='back')pin=pin.slice(0,-1);else if(k==='clear')pin='';else if(pin.length<PIN_MAX)pin+=k;
  drawPin();
}
async function doPunch(){
  if(!pinStaff||busy||pin.length<PIN_MIN)return;
  busy=true;drawPin();
  const b=document.getElementById('punchBtn');const label=b?b.textContent:'';if(b)b.textContent='Checking…';
  const s=pinStaff;
  let res,error;
  try{({data:res,error}=await sb.rpc('kiosk_punch',{p_staff:s.id,p_pin:pin}));}catch(e){error=e;}
  busy=false;
  if(error||!res||!res.ok){
    pin='';drawPin();if(b)b.textContent=label;
    const msg=error?dbErr(error):res&&res.error||'Could not punch';
    const e=document.getElementById('pinErr');if(e)e.textContent=msg;
    const dots=document.getElementById('pinDots');if(dots){dots.classList.remove('shake');void dots.offsetWidth;dots.classList.add('shake');}
    return;
  }
  const inn=res.action==='in';
  openSheet('<div class="punch-done '+(inn?'in':'out')+'"><span class="pd-ic">'+IC.check+'</span>'+
    '<h3>'+(inn?'Punched in':'Punched out')+' at '+fmtTime(res.at)+'</h3>'+
    (inn&&lateMins(res.at,s.shift_start)?'<p class="late-line">Late by <b>'+fmtLate(lateMins(res.at,s.shift_start))+'</b> — shift started at '+tLabel(s.shift_start)+'</p>':'')+
    '<p>'+(inn?'Have a great shift, <b>'+esc(res.name)+'</b>!':'Thanks <b>'+esc(res.name)+'</b> &mdash; you worked <b>'+fmtDur((new Date(res.at)-new Date(res.since))/60000)+'</b> today.')+'</p></div>');
  pinStaff=null;
  setTimeout(()=>{if(document.querySelector('.punch-done'))closeSheet();},3200);
  loadKiosk();
  if(tab==='calendar'){loadedKey='';loadCalendar();}
}

// ============================================================
// Owner login (same Supabase account as the menu)
// ============================================================
function reflectAuth(){
  const b=document.getElementById('authBtn');
  b.innerHTML=authed?IC.unlock:IC.lock;b.classList.toggle('on',authed);
  b.title=authed?'Owner: logged in (tap to lock)':'Owner login';b.setAttribute('aria-label',b.title);
}
function loginCard(what){
  return '<div class="page-head">'+IC.lock+'<h2>'+what+'</h2></div>'+
    '<div class="att-card att-login"><p>This section is for the owner. Log in with the same password as the menu.</p>'+
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
document.getElementById('authBtn').onclick=()=>{if(authed)lock();else{showTab('staff');setTimeout(()=>{const p=document.getElementById('f_pass');if(p)p.focus();},50);}};
function setAuthed(v){
  if(v===authed)return;
  authed=v;reflectAuth();loadedKey='';staff=[];rows=[];pres={staff:[],days:new Map()};
  if(authed){
    const w=document.getElementById(tab==='staff'?'staffWrap':'calendarWrap');
    if(tab!=='punch')w.innerHTML='<div class="att-card" style="margin-top:16px"><div class="sk-line w90"></div><div class="sk-line w70" style="margin-top:10px"></div></div>';
    loadStaff().then(renderTab);
  }else renderTab();
}

// ============================================================
// Staff tab (owner) — profile, shift, Aadhaar, address, salary
// ============================================================
const STAFF_COLS='id,name,role,phone,active,shift,shift_start,shift_end,aadhaar,address,salary,joined_on,work_days,created_at';
const DAY_NAMES=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];   // index + 1 = ISO weekday
const offDays=s=>{const w=s.work_days&&s.work_days.length?s.work_days:[1,2,3,4,5,6,7];return DAY_NAMES.filter((_,i)=>!w.includes(i+1));};
const SHIFTS={morning:{label:'Morning',start:'11:00',end:'17:00'},evening:{label:'Evening',start:'17:00',end:'23:00'},full:{label:'Full time',start:'11:00',end:'23:00'}};
// ---- Late punch-in: the first punch-in of a day after the staff member's shift start ----
function lateMins(punchIn,shiftStart){
  if(!punchIn||!shiftStart)return 0;
  const d=new Date(punchIn),[h,m]=String(shiftStart).split(':').map(Number),start=new Date(d);start.setHours(h,m||0,0,0);
  return Math.max(0,Math.floor((d-start)/60000));
}
function fmtLate(min){const h=Math.floor(min/60),m=min%60;return h?h+' hr'+(m?' '+m+' min':''):m+' min';}
const lateChip=min=>min>0?'<span class="late-chip">Late '+fmtLate(min)+'</span>':'';
const shiftStartOf=id=>{const s=staff.find(x=>x.id===id)||kiosk.find(x=>x.id===id);return s&&s.shift_start;};
// staff|day → minutes late for that day's first punch-in (owner rows)
function lateByDay(rows){
  const first={};rows.forEach(r=>{const k=r.staff_id+'|'+dayKey(r.punch_in);if(!first[k]||r.punch_in<first[k].punch_in)first[k]=r;});
  const out={};Object.entries(first).forEach(([k,r])=>{const m=lateMins(r.punch_in,shiftStartOf(r.staff_id));if(m>0)out[k]={min:m,id:r.id};});
  return out;
}
const tLabel=t=>t?new Date('1970-01-01T'+t.slice(0,5)).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true}):'';
const shiftLabel=s=>{const sh=SHIFTS[s.shift];if(!sh)return '';const t=s.shift_start&&s.shift_end?' '+tLabel(s.shift_start)+'–'+tLabel(s.shift_end):'';return sh.label+t;};
const maskAadhaar=a=>a&&a.length===12?'XXXX XXXX '+a.slice(8):'';
const fmtAadhaar=a=>a&&a.length===12?a.replace(/(\d{4})(\d{4})(\d{4})/,'$1 $2 $3'):(a||'');
const rupees=n=>n==null||n===''?'':'₹'+Number(n).toLocaleString('en-IN');
async function loadStaff(){
  const {data,error}=await sb.from('staff').select(STAFF_COLS).order('name');
  if(error){toast(dbErr(error),true);return false;}
  staff=data||[];return true;
}
function renderStaff(){
  const w=document.getElementById('staffWrap');
  if(!authed){w.innerHTML=loginCard('Staff');return;}
  const open=new Set(kiosk.filter(s=>s.open_since).map(s=>s.id));
  const list=staff.map(s=>{
    const st=!s.active?'<span class="st-chip off">Inactive</span>':open.has(s.id)?'<span class="st-chip in"><i></i>On shift</span>':'<span class="st-chip">Off</span>';
    const sh=shiftLabel(s),aad=maskAadhaar(s.aadhaar);
    return '<button type="button" class="c-card att-staff'+(s.active?'':' inactive')+'" onclick="editStaff(\''+s.id+'\')">'+
      '<span class="c-ic k-av">'+esc(initial(s.name))+'</span>'+
      '<span class="c-txt"><b>'+esc(s.name)+(s.role?' <span class="role">'+esc(s.role)+'</span>':'')+'</b>'+
        '<span class="chips">'+st+(sh?'<span class="shift-chip '+esc(s.shift)+'">'+esc(sh)+'</span>':'')+'</span>'+
        (s.phone?'<small>'+esc(s.phone)+'</small>':'')+
        (aad?'<small>Aadhaar '+aad+'</small>':'')+
        '<small>'+(offDays(s).length?'Weekly off: <b class="sal">'+offDays(s).join(', ')+'</b>':'Works all 7 days')+'</small>'+
        (s.salary!=null?'<small>Salary <b class="sal">'+rupees(s.salary)+'</b>/month</small>':'')+'</span>'+
      '<span class="c-go">'+IC.next+'</span></button>';
  }).join('');
  w.innerHTML='<div class="page-head">'+IC.users+'<h2>Staff</h2><span class="att-count">'+staff.filter(s=>s.active).length+' active</span></div>'+
    '<div class="contact-cards">'+(list||'<div class="att-empty">No staff yet. Add your first team member below.</div>')+
    '<button class="att-btn" onclick="editStaff()">'+IC.plus+' Add staff member</button></div>';
}
let _act=true,_shift='',_days=[1,2,3,4,5,6,7];
function editStaff(id){
  const s=id?staff.find(x=>x.id===id):null;
  _act=s?s.active:true;_shift=s?s.shift||'':'';_days=s&&s.work_days&&s.work_days.length?[...s.work_days]:[1,2,3,4,5,6,7];
  const v=k=>esc(s&&s[k]!=null?s[k]:'');
  const t=k=>s&&s[k]?s[k].slice(0,5):'';
  openSheet('<h3>'+(s?'Edit staff member':'Add staff member')+'</h3>'+
    '<div class="fld"><label>Full name</label><input id="s_name" value="'+v('name')+'" placeholder="e.g. Ravi Patel" autocomplete="off"></div>'+
    '<div class="fld two"><div><label>Role (optional)</label><input id="s_role" value="'+v('role')+'" placeholder="e.g. Cook"></div>'+
      '<div><label>Phone</label><input id="s_phone" type="tel" value="'+v('phone')+'" placeholder="+91 …"></div></div>'+
    '<div class="fld"><label>Shift</label><div class="veg-toggle">'+
      Object.entries(SHIFTS).map(([k,sh])=>'<button type="button" id="sh_'+k+'" class="'+(_shift===k?'sel':'')+'" onclick="setShift(\''+k+'\')">'+sh.label+'</button>').join('')+'</div></div>'+
    '<div class="fld two"><div><label>Shift starts</label><input id="s_start" type="time" value="'+t('shift_start')+'"></div>'+
      '<div><label>Shift ends</label><input id="s_end" type="time" value="'+t('shift_end')+'"></div></div>'+
    '<div class="fld"><label>Working days</label><div class="wd-pick" id="wdPick">'+
      DAY_NAMES.map((d,i)=>'<button type="button" data-d="'+(i+1)+'" class="'+(_days.includes(i+1)?'sel':'')+'" onclick="toggleDay('+(i+1)+')">'+d+'</button>').join('')+'</div>'+
      '<small class="fhint" id="wdHint"></small></div>'+
    '<div class="fld"><label>Aadhaar number</label><input id="s_aadhaar" inputmode="numeric" maxlength="14" value="'+esc(fmtAadhaar(s&&s.aadhaar))+'" placeholder="1234 5678 9012" oninput="aadhaarInput(this)" autocomplete="off"></div>'+
    '<div class="fld"><label>Address</label><textarea id="s_address" placeholder="House, street, area, city">'+v('address')+'</textarea></div>'+
    '<div class="fld two"><div><label>Monthly salary (₹)</label><input id="s_salary" type="number" min="0" step="1" inputmode="numeric" value="'+(s&&s.salary!=null?Math.round(s.salary):'')+'" placeholder="e.g. 15000"></div>'+
      '<div><label>Joining date</label><input id="s_joined" type="date" value="'+(s&&s.joined_on?s.joined_on:dayKey(new Date()))+'"></div></div>'+
    '<small class="fhint" style="margin:-6px 0 12px;display:block">Absent days are counted from the joining date.</small>'+
    '<div class="fld"><label>'+(s?'New PIN (optional)':'PIN for punching in')+'</label><input id="s_pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password" placeholder="'+(s?'Leave blank to keep the current PIN':'4 to 6 digits')+'">'+
      '<small class="fhint">Staff type this PIN on the Punch screen. Use 6 digits for better security.</small></div>'+
    '<div class="fld"><label>Status</label><div class="veg-toggle"><button type="button" id="a_y" class="'+(_act?'sel':'')+'" onclick="setAct(true)">Active</button><button type="button" id="a_n" class="'+(_act?'':'sel')+'" onclick="setAct(false)">Inactive</button></div>'+
      '<small class="fhint">Inactive staff are hidden from the Punch screen and not marked absent; their history is kept.</small></div>'+
    '<div class="sheet-actions">'+(s?'<button class="cancel danger" onclick="delStaff(\''+s.id+'\')">Delete</button>':'<button class="cancel" onclick="closeSheet()">Cancel</button>')+
      '<button class="save" id="s_save" onclick="saveStaff('+(s?'\''+s.id+'\'':'null')+')">Save</button></div>');
  drawDays();
  setTimeout(()=>{const n=document.getElementById('s_name');if(n&&!s)n.focus();},50);
}
function toggleDay(d){
  if(_days.includes(d)){if(_days.length===1)return toast('Keep at least one working day',true);_days=_days.filter(x=>x!==d);}
  else _days=[..._days,d].sort();
  drawDays();
}
function drawDays(){
  document.querySelectorAll('#wdPick button').forEach(b=>b.classList.toggle('sel',_days.includes(+b.dataset.d)));
  const off=DAY_NAMES.filter((_,i)=>!_days.includes(i+1)),h=document.getElementById('wdHint');
  if(h)h.textContent=off.length?'Weekly holiday: '+off.join(', ')+' — shown as Holiday, not Absent.':'Works every day — no weekly holiday.';
}
function setAct(v){_act=v;document.getElementById('a_y').classList.toggle('sel',v);document.getElementById('a_n').classList.toggle('sel',!v);}
// Picking a shift fills in its usual timing (still editable) unless custom times were typed.
function setShift(k){
  const prev=SHIFTS[_shift],st=document.getElementById('s_start'),en=document.getElementById('s_end');
  const untouched=(!st.value&&!en.value)||(prev&&st.value===prev.start&&en.value===prev.end);
  _shift=_shift===k?'':k;
  Object.keys(SHIFTS).forEach(x=>document.getElementById('sh_'+x).classList.toggle('sel',x===_shift));
  if(_shift&&untouched){st.value=SHIFTS[_shift].start;en.value=SHIFTS[_shift].end;}
}
function aadhaarInput(el){const d=el.value.replace(/\D/g,'').slice(0,12);el.value=d.replace(/(\d{4})(?=\d)/g,'$1 ');}
async function saveStaff(id){
  const v=k=>document.getElementById(k).value.trim();
  const name=v('s_name'),p=v('s_pin'),aad=v('s_aadhaar').replace(/\D/g,''),sal=v('s_salary');
  if(!name)return toast('Enter a name',true);
  if(aad&&aad.length!==12)return toast('Aadhaar number must be 12 digits',true);
  if(sal&&!(Number(sal)>=0))return toast('Enter a valid salary',true);
  if(p&&!/^\d{4,6}$/.test(p))return toast('PIN must be 4 to 6 digits',true);
  if(!id&&!p)return toast('Set a PIN',true);
  const data={name,role:v('s_role'),phone:v('s_phone'),shift:_shift,shift_start:v('s_start'),shift_end:v('s_end'),
    aadhaar:aad,address:v('s_address'),salary:sal,joined_on:v('s_joined'),work_days:_days,active:_act};
  const b=document.getElementById('s_save');b.disabled=true;
  const {error}=await sb.rpc('att_save_staff',{p_id:id,p_data:data,p_pin:p});
  b.disabled=false;
  if(error)return toast(dbErr(error),true);
  closeSheet();toast(id?'Staff updated':'Staff added');loadedKey='';
  await Promise.all([loadStaff(),loadKiosk()]);renderStaff();
}
async function delStaff(id){
  const s=staff.find(x=>x.id===id);
  if(!confirm('Delete '+(s?s.name:'this staff member')+' and ALL their attendance history?\n\nTip: set them to Inactive instead to keep the history.'))return;
  const {error}=await sb.from('staff').delete().eq('id',id);
  if(error)return toast(dbErr(error),true);
  closeSheet();toast('Staff deleted');loadedKey='';
  await Promise.all([loadStaff(),loadKiosk()]);renderStaff();
}

// ============================================================
// Calendar tab — everyone sees Present / Absent; the owner also sees punch times & hours
// ============================================================
// pres.staff: [{id,name,role,shift,active,joined_on}]  pres.days: Map(staffId → Set('YYYY-MM-DD'))
let pres={staff:[],days:new Map()};
function periodRange(){
  return view==='year'?[new Date(calY,0,1),new Date(calY+1,0,1)]:[new Date(calY,calM,1),new Date(calY,calM+1,1)];
}
// Supabase caps a query at 1000 rows, so page through a long period (a full year can exceed that).
async function fetchRows(from,to){
  const out=[];const PAGE=1000;
  for(let i=0;;i+=PAGE){
    const {data,error}=await sb.from('attendance').select('id,staff_id,punch_in,punch_out,note')
      .gte('punch_in',from.toISOString()).lt('punch_in',to.toISOString()).order('punch_in').range(i,i+PAGE-1);
    if(error)throw error;
    out.push(...data);
    if(data.length<PAGE)return out;
  }
}
async function loadCalendar(){
  const [from,to]=periodRange();
  const key=(authed?'o':'p')+view+from.toISOString();
  if(key!==loadedKey){
    document.getElementById('calendarWrap').innerHTML=calHead()+'<div class="att-card"><div class="sk-line w90"></div><div class="sk-line w70" style="margin-top:10px"></div></div>';
    try{
      if(authed){
        rows=await fetchRows(from,to);
        const days=new Map();rows.forEach(r=>{const k=dayKey(r.punch_in);(days.get(r.staff_id)||days.set(r.staff_id,new Set()).get(r.staff_id)).add(k);});
        pres={staff:staff.map(s=>({id:s.id,name:s.name,role:s.role,shift:s.shift,active:s.active,joined_on:s.joined_on,work_days:s.work_days})),days};
      }else{
        if(!sb)throw new Error('Could not load the app. Check your internet connection and refresh.');
        const last=new Date(to);last.setDate(last.getDate()-1);
        const {data,error}=await sb.rpc('att_presence',{p_from:dayKey(from),p_to:dayKey(last)});
        if(error)throw error;
        rows=[];const days=new Map();
        ((data&&data.days)||[]).forEach(x=>(days.get(x.s)||days.set(x.s,new Set()).get(x.s)).add(x.d));
        pres={staff:(data&&data.staff)||[],days};
      }
      loadedKey=key;
    }catch(e){document.getElementById('calendarWrap').innerHTML=calHead()+'<div class="att-empty">'+esc(dbErr(e))+'</div>';return;}
  }
  renderCalendar();
}
const monthKeys=(y,m)=>Array.from({length:new Date(y,m+1,0).getDate()},(_,i)=>y+'-'+pad(m+1)+'-'+pad(i+1));
const periodKeys=()=>view==='year'?Array.from({length:12},(_,m)=>monthKeys(calY,m)).flat():monthKeys(calY,calM);
const presentOn=(s,k)=>!!(pres.days.get(s.id)&&pres.days.get(s.id).has(k));
// Nothing about a person is shown for days before their joining date.
const joinedBy=(s,k)=>!s.joined_on||k>=s.joined_on;
// Working days are ISO weekdays (1 = Mon … 7 = Sun); any other day is that person's weekly holiday.
const ALL_DAYS=[1,2,3,4,5,6,7];
const isoDow=k=>(new Date(k+'T00:00').getDay()+6)%7+1;
const worksOn=(s,k)=>(s.work_days&&s.work_days.length?s.work_days:ALL_DAYS).includes(isoDow(k));
// 'P' present · 'H' weekly holiday · 'A' absent · '' not counted
// (before joining, inactive, a working day that is today or later and not yet punched)
function status(s,k){
  if(!joinedBy(s,k))return '';
  if(presentOn(s,k))return 'P';          // working on a holiday still counts as present
  if(!s.active)return '';
  if(!worksOn(s,k))return 'H';           // shown for upcoming days too, so the week is planned
  if(k>=dayKey(new Date()))return '';
  return 'A';
}
// People in the current filter who had joined by the end of this period:
// active staff, plus inactive staff who were present in it
function people(){
  const keys=periodKeys(),last=keys[keys.length-1];
  const list=calStaff==='ALL'?pres.staff:pres.staff.filter(s=>s.id===calStaff);
  return list.filter(s=>joinedBy(s,last)&&(s.active||keys.some(k=>status(s,k)==='P')));
}
// Holidays are only counted up to today (upcoming ones are shown on the calendar but not totalled)
function countPA(ppl,keys){const t=dayKey(new Date());let p=0,a=0,h=0;ppl.forEach(s=>keys.forEach(k=>{const st=status(s,k);if(st==='P')p++;else if(st==='A')a++;else if(st==='H'&&k<=t)h++;}));return {p,a,h};}
const pct=(p,a)=>p+a?Math.round(p*100/(p+a))+'%':'—';
// Owner punch rows in the filter, leaving out anything dated before that person's joining date
function shown(){
  const byId=new Map(pres.staff.map(s=>[s.id,s]));
  return rows.filter(r=>{const s=byId.get(r.staff_id);return (calStaff==='ALL'||r.staff_id===calStaff)&&(!s||joinedBy(s,dayKey(r.punch_in)));});
}
function calHead(){
  const title=view==='year'?String(calY):MONTHS[calM]+' '+calY;
  if(calStaff!=='ALL'&&pres.staff.length&&!pres.staff.some(s=>s.id===calStaff))calStaff='ALL';
  const opts='<option value="ALL">All staff</option>'+pres.staff.map(s=>'<option value="'+s.id+'"'+(calStaff===s.id?' selected':'')+'>'+esc(s.name)+(s.active?'':' (inactive)')+'</option>').join('');
  return '<div class="page-head">'+IC.cal+'<h2>Attendance</h2>'+
      '<div class="seg"><button type="button" class="'+(view==='month'?'sel':'')+'" onclick="setView(\'month\')">Month</button><button type="button" class="'+(view==='year'?'sel':'')+'" onclick="setView(\'year\')">Year</button></div></div>'+
    '<div class="cal-bar"><button type="button" class="cal-nav" aria-label="Previous" onclick="shiftPeriod(-1)">'+IC.prev+'</button>'+
      '<div class="cal-title">'+title+'</div>'+
      '<button type="button" class="cal-nav" aria-label="Next" onclick="shiftPeriod(1)">'+IC.next+'</button></div>'+
    '<div class="fld cal-filter"><select id="calStaff" onchange="calStaff=this.value;renderCalendar()">'+opts+'</select></div>';
}
function setView(v){view=v;loadCalendar();}
function shiftPeriod(d){
  if(view==='year')calY+=d;else{calM+=d;if(calM<0){calM=11;calY--;}if(calM>11){calM=0;calY++;}}
  loadCalendar();
}
function goMonth(m){view='month';calM=m;loadCalendar();}
// Per-person attendance totals for the period (owner only): present / absent / holiday, hours, missing punch-outs
function summaryTable(){
  const keys=periodKeys(),ppl=people();
  if(!ppl.length)return '<div class="att-empty">No staff to show for this period.</div>';
  const rs=shown();
  const late=Object.entries(lateByDay(rs));
  const sum=ppl.map(s=>{const c=countPA([s],keys),mine=rs.filter(r=>r.staff_id===s.id),lt=late.filter(([k])=>k.startsWith(s.id+'|'));
    return {s,p:c.p,a:c.a,h:c.h,mins:mine.reduce((x,r)=>x+rowMins(r),0),miss:mine.filter(isMissingOut).length,ld:lt.length,lm:lt.reduce((a,[,v])=>a+v.min,0)};});
  const tot=sum.reduce((t,x)=>({p:t.p+x.p,a:t.a+x.a,h:t.h+x.h,mins:t.mins+x.mins,miss:t.miss+x.miss,ld:t.ld+x.ld,lm:t.lm+x.lm}),{p:0,a:0,h:0,mins:0,miss:0,ld:0,lm:0});
  const cells=x=>'<td><span class="pa p">'+x.p+'</span></td><td><span class="pa a">'+x.a+'</span></td><td><span class="pa h">'+x.h+'</span></td>'+
    '<td>'+pct(x.p,x.a)+'</td><td>'+(x.mins?fmtDur(x.mins):'—')+'</td>'+
    '<td>'+(x.ld?'<span class="late-chip">'+x.ld+' day'+(x.ld===1?'':'s')+' · '+fmtLate(x.lm)+'</span>':'—')+'</td>'+
    '<td>'+(x.miss?'<span class="miss-chip">'+x.miss+'</span>':'—')+'</td>';
  return '<div class="tbl-scroll"><table class="att-table"><thead><tr><th>Staff</th><th>Present</th><th>Absent</th><th>Holiday</th><th>Attendance</th><th>Hours</th><th>Late</th><th>No out</th></tr></thead><tbody>'+
    sum.map(x=>'<tr><td><b>'+esc(x.s.name)+'</b>'+(SHIFTS[x.s.shift]?'<small class="tshift">'+SHIFTS[x.s.shift].label+'</small>':'')+'</td>'+cells(x)+'</tr>').join('')+
    (sum.length>1?'<tr class="tot"><td>Total</td>'+cells(tot)+'</tr>':'')+
    '</tbody></table></div>'+
    '<p class="att-foot">Attendance = present &divide; (present + absent). Holidays are the weekly off days set on each staff member, counted up to today. Late = first punch-in of the day after the shift start time.</p>';
}
// ---- Salary (owner only), shown in its own section right below the calendar ----
// Payable per month = salary × paid days ÷ days in that month (31, 30, 28 or 29), paid days = present + holidays.
// Full attendance always pays the full salary; one day is worth salary ÷ days in that month.
function salaryTable(){
  const ppl=people();
  if(!ppl.length)return '<div class="att-empty">No staff to show for this period.</div>';
  const months=view==='year'?Array.from({length:12},(_,m)=>m):[calM];
  const dim=m=>new Date(calY,m+1,0).getDate();
  const rows_=ppl.map(s=>{
    const f=staff.find(x=>x.id===s.id),sal=f&&f.salary!=null?Number(f.salary):null;
    let paid=0,a=0,pay=0;
    months.forEach(m=>{const c=countPA([s],monthKeys(calY,m));paid+=c.p+c.h;a+=c.a;if(sal!=null)pay+=sal*(c.p+c.h)/dim(m);});
    return {s,sal,paid,a,pay:sal==null?null:Math.round(pay)};
  });
  const add=(x,y)=>y==null?x:(x||0)+y;
  const tot=rows_.reduce((t,r)=>({paid:t.paid+r.paid,a:t.a+r.a,sal:add(t.sal,r.sal),pay:add(t.pay,r.pay)}),{paid:0,a:0,sal:null,pay:null});
  const perDay=sal=>sal==null?'—':'₹'+(sal/dim(calM)).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const month=view==='month';
  // Payable first so it is visible on a phone without scrolling sideways
  const cells=r=>'<td class="num pay">'+(r.pay!=null?rupees(r.pay):'—')+'</td>'+
    '<td><span class="pa p">'+r.paid+'</span></td><td><span class="pa a">'+r.a+'</span></td>'+
    '<td class="num">'+(r.sal!=null?rupees(r.sal):'—')+'</td>'+(month?'<td class="num">'+perDay(r.sal)+'</td>':'');
  return '<div class="tbl-scroll"><table class="att-table"><thead><tr><th>Staff</th><th class="num">Payable</th>'+
      '<th>Paid days</th><th>Unpaid (absent)</th><th class="num">Salary / month</th>'+(month?'<th class="num">Per day</th>':'')+'</tr></thead><tbody>'+
    rows_.map(r=>'<tr><td><b>'+esc(r.s.name)+'</b></td>'+cells(r)+'</tr>').join('')+
    (rows_.length>1?'<tr class="tot"><td>Total</td>'+cells(tot)+'</tr>':'')+
    '</tbody></table></div>'+
    '<p class="att-foot">'+(month?'<b>'+MONTHS[calM]+' has '+dim(calM)+' days.</b> ':'')+
      'Payable = salary &times; paid days &divide; days in the month. Paid days = present + holidays; only absent days are unpaid, and nothing is paid before the joining date. '+
      (month?'The current month counts up to today.':'Each month uses its own length (31, 30, 28 or 29 days) and the year adds them up; the current month counts up to today.')+'</p>';
}
// When one person is picked and this period starts before they joined, say so
function joinNote(){
  if(calStaff==='ALL')return '';
  const s=pres.staff.find(x=>x.id===calStaff),keys=periodKeys();
  if(!s||!s.joined_on||keys[0]>=s.joined_on)return '';
  const when=new Date(s.joined_on+'T00:00').toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});
  return '<div class="join-note">'+esc(s.name)+(keys[keys.length-1]<s.joined_on?' joins on ':' joined on ')+'<b>'+when+'</b>. Nothing is shown before that date.</div>';
}
function renderCalendar(){
  const w=document.getElementById('calendarWrap');
  const ppl=people(),today=dayKey(new Date()),one=calStaff!=='ALL'?ppl[0]:null;
  // main = calendar column; side = owner's salary + summary (beside the calendar on desktop, below it on phones)
  let main,side='',wide='';
  if(view==='month'){
    const byDay={};shown().forEach(r=>(byDay[dayKey(r.punch_in)]=byDay[dayKey(r.punch_in)]||[]).push(r));
    const lead=(new Date(calY,calM,1).getDay()+6)%7;   // Monday-first grid
    let cells=WD.map(d=>'<div class="cal-wd">'+d+'</div>').join('');
    for(let i=0;i<lead;i++)cells+='<div class="cal-day blank"></div>';
    monthKeys(calY,calM).forEach((k,i)=>{
      const rs=byDay[k]||[],miss=authed&&rs.some(isMissingOut);
      let cls='',meta='';
      if(one){   // one person: the whole cell is green (present), red (absent) or blue (holiday)
        const st=status(one,k);
        cls=st==='P'?' pres':st==='A'?' abs':st==='H'?' hol':!joinedBy(one,k)?' pre':'';
        if(st==='P')meta=authed?'<span class="m p">'+(Math.round(rs.reduce((a,r)=>a+rowMins(r),0)/6)/10)+'h</span>':'<span class="m p">P</span>';
        else if(st==='A')meta='<span class="m a">A</span>';
        else if(st==='H')meta='<span class="m h">H</span>';
      }else{     // all staff: present / absent / holiday counts (upcoming holidays included)
        let p=0,a=0,h=0;ppl.forEach(s=>{const st=status(s,k);if(st==='P')p++;else if(st==='A')a++;else if(st==='H')h++;});
        if(p)cls=' has';
        meta=(p?'<span class="m p">'+p+'</span>':'')+(a?'<span class="m a">'+a+'</span>':'')+(h?'<span class="m h">'+h+'</span>':'');
      }
      cells+='<button type="button" class="cal-day'+cls+(k===today?' today':'')+(k>today?' future':'')+'" onclick="openDay(\''+k+'\')">'+
        '<span class="d">'+(i+1)+'</span>'+(miss?'<i class="miss" title="Missing punch out"></i>':'')+(meta?'<span class="ms">'+meta+'</span>':'')+'</button>';
    });
    main=joinNote()+'<div class="att-card"><div class="cal-grid">'+cells+'</div>'+
      '<div class="cal-legend"><span><i class="lg p"></i>Present</span><span><i class="lg a"></i>Absent</span><span><i class="lg h"></i>Holiday</span><span><i class="lg today"></i>Today</span>'+
        (authed?'<span><i class="miss"></i>Missing punch out</span>':'')+'</div></div>';
    if(authed)side='<h3 class="att-sub">'+IC.rupee+' '+MONTHS[calM]+' salary</h3><div class="att-card">'+salaryTable()+'</div>'+
        '<h3 class="att-sub">'+MONTHS[calM]+' attendance summary</h3><div class="att-card">'+summaryTable()+'</div>';
  }else{
    const nowY=new Date().getFullYear(),nowM=new Date().getMonth(),rs=shown();
    const cards=Array.from({length:12},(_,m)=>{
      const c=countPA(ppl,monthKeys(calY,m));
      const mr=rs.filter(r=>new Date(r.punch_in).getMonth()===m),mins=mr.reduce((a,r)=>a+rowMins(r),0),miss=authed&&mr.some(isMissingOut);
      const fut=calY>nowY||(calY===nowY&&m>nowM);
      return '<button type="button" class="yr-month'+(c.p?' has':'')+(fut?' future':'')+(calY===nowY&&m===nowM?' today':'')+'" onclick="goMonth('+m+')">'+
        '<span class="yn">'+MONTHS[m].slice(0,3)+'</span>'+
        (c.p+c.a?'<span class="yh">'+(authed&&mins?fmtDur(mins):pct(c.p,c.a))+'</span>'+
          '<span class="yd"><span class="pa p">P '+c.p+'</span> <span class="pa a">A '+c.a+'</span>'+(c.h?' <span class="pa h">H '+c.h+'</span>':'')+'</span>':'<span class="yd">—</span>')+
        (miss?'<i class="miss" title="Missing punch out"></i>':'')+'</button>';
    }).join('');
    // Staff × month hours (owner only)
    let matrix='';
    if(authed&&ppl.length){
      matrix='<div class="tbl-scroll"><table class="att-table matrix"><thead><tr><th>Staff</th>'+MONTHS.map(m=>'<th>'+m.slice(0,3)+'</th>').join('')+'<th>Total</th></tr></thead><tbody>'+
        ppl.map(s=>{
          let total=0;
          const tds=Array.from({length:12},(_,m)=>{
            const v=rs.filter(r=>r.staff_id===s.id&&new Date(r.punch_in).getMonth()===m).reduce((a,r)=>a+rowMins(r),0);
            total+=v;return '<td>'+(v?fmtDur(v):'—')+'</td>';
          }).join('');
          return '<tr><td><b>'+esc(s.name)+'</b></td>'+tds+'<td><b>'+fmtDur(total)+'</b></td></tr>';
        }).join('')+'</tbody></table></div>';
    }
    main=joinNote()+'<div class="yr-grid">'+cards+'</div>';
    if(authed)side='<h3 class="att-sub">'+IC.rupee+' '+calY+' salary</h3><div class="att-card">'+salaryTable()+'</div>'+
        '<h3 class="att-sub">'+calY+' attendance summary</h3><div class="att-card">'+summaryTable()+'</div>';
    if(matrix)wide='<h3 class="att-sub">Hours by month</h3><div class="att-card">'+matrix+'</div>';
  }
  w.innerHTML='<div class="cal-layout'+(side?' two':'')+'"><div class="cal-main">'+calHead()+main+'</div>'+
      (side?'<div class="cal-side">'+side+'</div>':'')+'</div>'+wide+(authed?
    '<div class="att-actions"><button class="att-btn" onclick="editEntry()">'+IC.plus+' Add entry</button>'+
    '<button class="att-btn" onclick="exportCSV()">'+IC.dl+' Export '+(view==='year'?calY:MONTHS[calM].slice(0,3)+' '+calY)+' CSV</button></div>':
    '<p class="att-note">Showing Present / Absent / Holiday only. The owner can log in to see punch times and summaries.</p>');
}
function openDay(k){
  const d=new Date(k+'T00:00'),ppl=people();
  const P=ppl.filter(s=>status(s,k)==='P'),A=ppl.filter(s=>status(s,k)==='A'),H=ppl.filter(s=>status(s,k)==='H');
  const nameList=(list,cls)=>list.map(s=>'<span class="who '+cls+'">'+esc(s.name)+(SHIFTS[s.shift]?' <small>'+SHIFTS[s.shift].label+'</small>':'')+'</span>').join('');
  const absent=(A.length?'<div class="day-sec"><div class="day-lbl a">Absent &middot; '+A.length+'</div><div class="who-list">'+nameList(A,'a')+'</div></div>':'')+
    (H.length?'<div class="day-sec"><div class="day-lbl h">Holiday (weekly off) &middot; '+H.length+'</div><div class="who-list">'+nameList(H,'h')+'</div></div>':'');
  if(!authed){
    openSheet('<h3>'+fmtDay(d)+'</h3>'+
      (P.length?'<div class="day-sec"><div class="day-lbl p">Present &middot; '+P.length+'</div><div class="who-list">'+nameList(P,'p')+'</div></div>':'')+absent+
      (!P.length&&!A.length&&!H.length?'<div class="att-empty">'+(k>=dayKey(new Date())?'Nothing to show yet for this day.':'No attendance for this day.')+'</div>':''));
    return;
  }
  const rs=shown().filter(r=>dayKey(r.punch_in)===k).sort((a,b)=>a.punch_in<b.punch_in?-1:1);
  const lateDay=lateByDay(rs);
  const list=rs.map(r=>{
    const miss=isMissingOut(r),lt=lateDay[r.staff_id+'|'+k],isLate=lt&&lt.id===r.id;
    return '<div class="shift-row'+(isLate?' late':'')+'"><div class="sr-main"><b>'+esc(staffName(r.staff_id))+'</b>'+
      '<span class="sr-time"><span class="'+(isLate?'late-time':'')+'">'+fmtTime(r.punch_in)+'</span>'+(isLate?lateChip(lt.min):'')+' &rarr; '+(r.punch_out?fmtTime(r.punch_out)+(dayKey(r.punch_out)!==k?' (+1)':''):miss?'<span class="miss-chip">No punch out</span>':'<span class="st-chip in"><i></i>On shift</span>')+'</span>'+
      (r.note?'<span class="sr-note">'+esc(r.note)+'</span>':'')+'</div>'+
      '<span class="sr-dur">'+(rowMins(r)?fmtDur(rowMins(r)):'—')+'</span>'+
      '<button class="mini" onclick="editEntry('+r.id+')">Edit</button></div>';
  }).join('');
  const tot=rs.reduce((a,r)=>a+rowMins(r),0);
  openSheet('<h3>'+fmtDay(d)+'</h3>'+
    (rs.length?'<div class="day-lbl p">Present &middot; '+P.length+'</div>'+list+'<div class="day-tot">'+fmtDur(tot)+' total</div>':'')+absent+
    (!rs.length&&!A.length&&!H.length?'<div class="att-empty">No punches on this day.</div>':'')+
    '<div class="sheet-actions"><button class="save" onclick="editEntry(null,\''+k+'\')">+ Add entry</button></div>');
}
function editEntry(id,day){
  const r=id?rows.find(x=>x.id===id):null;
  if(!staff.length)return toast('Add staff first',true);
  const date=r?dayKey(r.punch_in):(day||dayKey(new Date()));
  const sel=r?r.staff_id:(calStaff!=='ALL'?calStaff:'');
  openSheet('<h3>'+(r?'Edit entry':'Add entry')+'</h3>'+
    '<div class="fld"><label>Staff</label><select id="e_staff">'+(sel?'':'<option value="">Choose…</option>')+staff.map(s=>'<option value="'+s.id+'"'+(s.id===sel?' selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select></div>'+
    '<div class="fld"><label>Date</label><input id="e_date" type="date" value="'+date+'"></div>'+
    '<div class="fld two"><div><label>Punch in</label><input id="e_in" type="time" value="'+(r?hhmm(r.punch_in):'10:00')+'"></div>'+
      '<div><label>Punch out</label><input id="e_out" type="time" value="'+(r&&r.punch_out?hhmm(r.punch_out):'')+'"></div></div>'+
    '<small class="fhint" style="margin:-6px 0 12px;display:block">Leave punch out blank if they are still on shift. An out time earlier than the in time counts as the next day.</small>'+
    '<div class="fld"><label>Note (optional)</label><input id="e_note" value="'+esc(r?r.note:'')+'" placeholder="e.g. Forgot to punch out"></div>'+
    '<div class="sheet-actions">'+(r?'<button class="cancel danger" onclick="delEntry('+r.id+')">Delete</button>':'<button class="cancel" onclick="closeSheet()">Cancel</button>')+
      '<button class="save" id="e_save" onclick="saveEntry('+(r?r.id:'null')+')">Save</button></div>');
}
async function saveEntry(id){
  const g=k=>document.getElementById(k).value;
  const sid=g('e_staff'),date=g('e_date'),tin=g('e_in'),tout=g('e_out');
  if(!sid)return toast('Choose a staff member',true);
  if(!date||!tin)return toast('Enter the date and punch-in time',true);
  const pin_=new Date(date+'T'+tin);
  let pout=null;
  if(tout){pout=new Date(date+'T'+tout);if(pout<pin_)pout.setDate(pout.getDate()+1);}
  const rec={staff_id:sid,punch_in:pin_.toISOString(),punch_out:pout?pout.toISOString():null,note:g('e_note').trim()};
  const b=document.getElementById('e_save');b.disabled=true;
  const {error}=id?await sb.from('attendance').update(rec).eq('id',id):await sb.from('attendance').insert(rec);
  b.disabled=false;
  if(error)return toast(dbErr(error),true);
  closeSheet();toast(id?'Entry updated':'Entry added');
  loadedKey='';loadCalendar();loadKiosk();
}
async function delEntry(id){
  if(!confirm('Delete this attendance entry?'))return;
  const {error}=await sb.from('attendance').delete().eq('id',id);
  if(error)return toast(dbErr(error),true);
  closeSheet();toast('Entry deleted');loadedKey='';loadCalendar();loadKiosk();
}
function exportCSV(){
  const cell=v=>{v=String(v==null?'':v);return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  const out=[['Date','Staff','Punch in','Punch out','Hours','Note'].join(',')];
  shown().forEach(r=>out.push([dayKey(r.punch_in),staffName(r.staff_id),fmtTime(r.punch_in),r.punch_out?fmtTime(r.punch_out):'',(rowMins(r)/60).toFixed(2),r.note].map(cell).join(',')));
  const blob=new Blob(['﻿'+out.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='attendance-'+(view==='year'?calY:calY+'-'+pad(calM+1))+(calStaff==='ALL'?'':'-'+staffName(calStaff).replace(/\W+/g,'_'))+'.csv';
  a.click();toast('Exported CSV');
}

// ============================================================
// Tabs + boot
// ============================================================
const TABS=['punch','calendar','staff'];
function renderTab(){if(tab==='calendar')loadCalendar();else if(tab==='staff')renderStaff();}
function showTab(name){
  if(!TABS.includes(name))name='punch';
  tab=name;
  TABS.forEach(t=>{const p=document.getElementById('tab-'+t);p.classList.toggle('active',t===name);p.setAttribute('aria-hidden',t===name?'false':'true');});
  document.querySelectorAll('.tabbtn').forEach(b=>{const on=b.dataset.tab===name;b.classList.toggle('active',on);b.setAttribute('aria-selected',on?'true':'false');});
  document.body.className='tab-'+name;
  if(name==='punch')loadKiosk();
  renderTab();
  window.scrollTo({top:0,behavior:'auto'});
}
document.querySelectorAll('.tabbtn').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));

async function boot(){
  tickClock();setInterval(tickClock,1000);
  reflectAuth();
  if(!sb){renderKiosk('Could not load the app. Check your internet connection and refresh.');return;}
  document.getElementById('kioskGrid').innerHTML='<div class="k-tile sk"></div>'.repeat(4);
  // authed only for the owner account (session is shared with the menu site on the same domain)
  sb.auth.onAuthStateChange((_e,session)=>setAuthed(!!(session&&session.user&&session.user.email===OWNER_EMAIL)));
  try{const {data}=await sb.auth.getSession();const s=data&&data.session;setAuthed(!!(s&&s.user&&s.user.email===OWNER_EMAIL));}catch(e){}
  await loadKiosk();
  // keep the kiosk fresh on a device left at the counter
  setInterval(()=>{if(tab==='punch'&&!document.hidden&&!pinStaff)loadKiosk();},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&tab==='punch')loadKiosk();});
}
boot();
