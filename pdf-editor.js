/* PDF Editor Pro - Phase 0 (Neev). Sirf Edit dabane par load hota hai (loader index.html me hai).
   Screen par kuch nahi dikhata. Original PDF ko kabhi chhuta nahi: sirf padhta hai, kaam working copy par. */
(function(){
'use strict';
if(window.PDFEditor)return;
const VERSION='0.5.1';
const MB=1048576;

/* ---------- Device / memory ---------- */
function env(){
 const o={version:VERSION,deviceMemoryGB:navigator.deviceMemory||null,cores:navigator.hardwareConcurrency||null,
  idb:!!window.indexedDB,touch:matchMedia('(pointer:coarse)').matches,
  jsHeapLimitMB:null,jsHeapUsedMB:null};
 try{if(performance.memory){o.jsHeapLimitMB=Math.round(performance.memory.jsHeapSizeLimit/MB);o.jsHeapUsedMB=Math.round(performance.memory.usedJSHeapSize/MB)}}catch(e){}
 return o}
/* Working copy kahan rakhein: chhoti file memory me, badi IndexedDB me. Kam RAM phone par limit kam. */
function chooseMode(size){
 const gb=navigator.deviceMemory||4,lim=gb<=2?12*MB:gb<=4?30*MB:60*MB;
 return (size<=lim||!window.indexedDB)?'memory':'idb'}

/* ---------- IndexedDB (chunked) ---------- */
const DB='pdfed_v1',CH=4*MB;
function idb(){return new Promise((ok,no)=>{const r=indexedDB.open(DB,1);
 r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('meta'))d.createObjectStore('meta',{keyPath:'id'});if(!d.objectStoreNames.contains('chunks'))d.createObjectStore('chunks')};
 r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error||new Error('IndexedDB nahi khula'))})}
const req=q=>new Promise((ok,no)=>{q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});
const done=t=>new Promise((ok,no)=>{t.oncomplete=()=>ok();t.onerror=()=>no(t.error);t.onabort=()=>no(t.error||new Error('IndexedDB abort'))});
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);

/* ---------- Working copy ----------
   create(blob,name) -> {id,mode,size,getBlob(),getBytes(),dispose()}
   blob sirf padha jata hai. Original kabhi change nahi hota. */
async function createCopy(blob,name){
 if(!blob||!blob.size)throw new Error('PDF khali hai');
 const size=blob.size,mode=chooseMode(size),id=uid();let u8=null;
 const T={type:'application/pdf'};
 if(mode=='memory'){
  u8=new Uint8Array(await blob.arrayBuffer());
 }else{
  const d=await idb();let n=0;
  try{
   /* ek chunk ek transaction: poori file heap me nahi aati */
   for(let off=0;off<size;off+=CH){
    const part=new Uint8Array(await blob.slice(off,Math.min(size,off+CH)).arrayBuffer());
    const t=d.transaction('chunks','readwrite');t.objectStore('chunks').put(part,id+':'+n);await done(t);n++}
   const t=d.transaction('meta','readwrite');t.objectStore('meta').put({id,name:name||'PDF',size,n,t:Date.now()});await done(t);
  }catch(e){await dropChunks(d,id,n+1).catch(()=>{});d.close();throw e}
  d.close()}
 const meta={id,name:name||'PDF',size,mode};
 async function chunksOf(){const d=await idb();try{const m=await req(d.transaction('meta').objectStore('meta').get(id));if(!m)throw new Error('Working copy nahi mili');
   const out=[];for(let i=0;i<m.n;i++)out.push(await req(d.transaction('chunks').objectStore('chunks').get(id+':'+i)));return out}finally{d.close()}}
 return Object.assign(meta,{
  async getBlob(){return mode=='memory'?new Blob([u8],T):new Blob(await chunksOf(),T)},
  async getBytes(){if(mode=='memory')return u8;const b=await new Blob(await chunksOf(),T).arrayBuffer();return new Uint8Array(b)},
  async dispose(){u8=null;if(mode=='idb'){const d=await idb();try{const m=await req(d.transaction('meta').objectStore('meta').get(id));await dropChunks(d,id,m?m.n:0);const t=d.transaction('meta','readwrite');t.objectStore('meta').delete(id);await done(t)}finally{d.close()}}}})}
async function dropChunks(d,id,n){const t=d.transaction('chunks','readwrite'),s=t.objectStore('chunks');for(let i=0;i<n;i++)s.delete(id+':'+i);await done(t)}
/* Purani chhodi hui copies (app kill hua ho) saaf: 3 din se purani. Draft recovery Phase 2 me judega. */
async function purgeOld(days){
 if(!window.indexedDB)return 0;const d=await idb();let c=0;
 try{const all=await req(d.transaction('meta').objectStore('meta').getAll()),lim=Date.now()-(days||3)*864e5;
  for(const m of all)if(m.t<lim){await dropChunks(d,m.id,m.n);const t=d.transaction('meta','readwrite');t.objectStore('meta').delete(m.id);await done(t);c++}}
 finally{d.close()}return c}

/* ---------- Libraries ki asli capability test ----------
   host = {PL,PJ,RBFK} index.html ke apne loaders (naya library load nahi karte). */
async function probe(host,opts){
 host=host||{};opts=opts||{};const R={env:env(),tests:[]};
 const add=(name,ok,note)=>{R.tests.push({name,ok,note})};
 /* pdf.js */
 try{if(host.PJ)await host.PJ();add('pdf.js load',!!window.pdfjsLib,window.pdfjsLib?('version '+(pdfjsLib.version||'?')):'nahi mila')}catch(e){add('pdf.js load',false,e.message)}
 /* pdf-lib: banao, save, wapas kholo */
 let L=null;
 try{if(host.PL)await host.PL();L=window.PDFLib;if(!L)throw new Error('PDFLib nahi mila');
  const d=await L.PDFDocument.create();d.addPage([200,200]);d.addPage([200,200]);const b=await d.save();
  const d2=await L.PDFDocument.load(b);add('pdf-lib banana/save/load',d2.getPageCount()==2,'2 page, '+b.length+' bytes')}
 catch(e){add('pdf-lib banana/save/load',false,e.message)}
 if(L){
  /* purana text edit: pdf-lib me API hi nahi */
  add('pdf-lib purana text edit',false,'Nahi ho sakta: pdf-lib sirf naya content jodti hai. Isliye Phase 2 me overlay.');
  /* encryption */
  const enc=typeof L.PDFDocument.prototype.encrypt=='function';
  add('pdf-lib password lagana',enc,enc?'hai':'Nahi hai (pdf-lib akeli encrypt nahi karti). Phase 11 me confirm: pdf-lib akeli encrypt nahi karti.');
  /* standard font me Hindi */
  try{const d=await L.PDFDocument.create(),f=await d.embedFont(L.StandardFonts.Helvetica),p=d.addPage([200,200]);
   p.drawText('\u0939\u093F\u0928\u094D\u0926\u0940',{font:f,size:12});add('Standard font me Hindi',false,'Chal gaya?? (ulta nikla)')}
  catch(e){add('Standard font me Hindi',false,'Nahi likh sakta (pakka): Hindi/Gujarati ke liye font embed karna hi padega.')}
  /* fontkit */
  try{if(host.RBFK)await host.RBFK();const fk=window.fontkit;add('fontkit (custom font embed)',!!fk,fk?'load ho gaya':'nahi mila');
   if(fk){const d=await L.PDFDocument.create();d.registerFontkit(fk);add('registerFontkit',true,'ok. Hindi/Gujarati ke liye font file (TTF) alag se lagegi, Phase 3 me.')}}
  catch(e){add('fontkit (custom font embed)',false,e.message)}}
 /* IndexedDB: 9 MB likho, padho, mita do */
 if(window.indexedDB){
  try{const t0=performance.now(),u=new Uint8Array(9*MB);for(let i=0;i<u.length;i+=4099)u[i]=i&255;
   const c=await createCopy(new Blob([u],{type:'application/pdf'}),'__probe__');
   /* probe ke liye zabardasti idb: chhoti copy memory me jati hai, isliye seedha chunk test */
   add('Working copy',true,'mode='+c.mode+' (9MB test)');await c.dispose();
   const d=await idb();const id='probe'+uid(),part=new Uint8Array(CH);let t=d.transaction('chunks','readwrite');t.objectStore('chunks').put(part,id);await done(t);
   const got=await req(d.transaction('chunks').objectStore('chunks').get(id));t=d.transaction('chunks','readwrite');t.objectStore('chunks').delete(id);await done(t);d.close();
   add('IndexedDB chunk likhna/padhna',!!got&&got.length==CH,Math.round(performance.now()-t0)+' ms')}
  catch(e){add('IndexedDB',false,e.message)}}
 else add('IndexedDB',false,'is browser me nahi hai: sab memory me rahega, badi PDF par limit kam.');
 /* storage quota */
 try{if(navigator.storage&&navigator.storage.estimate){const q=await navigator.storage.estimate();add('Storage',true,'use '+Math.round((q.usage||0)/MB)+' MB / quota '+Math.round((q.quota||0)/MB)+' MB')}}catch(e){}
 /* memory hadd (rule: working copy ke mode ki limit) */
 const gb=R.env.deviceMemoryGB||4;
 add('Memory hadd (is device ke liye)',true,'working copy memory me <= '+Math.round((gb<=2?12:gb<=4?30:60))+' MB, usse badi IndexedDB me');
 R.pass=R.tests.filter(t=>t.ok).length;R.fail=R.tests.length-R.pass;
 try{console.table(R.tests)}catch(e){}
 return R}

/* ================= PHASE 1: Edit button ke baad khali workspace ================= */
/* ctx = {name,size,total,page(0-based),getPage:k=>pdf.js page, file}
   Viewer ka PDF seedha padha jata hai (original ko chhuta nahi). Working copy pehle edit par banegi (Phase 2). */
let S=null;
const SVG=(d,w)=>'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="'+(w||2)+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';
const IC={back:SVG('<path d="M15 5l-7 7 7 7"/>'),more:SVG('<circle cx="12" cy="5.5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="18.5" r="1.3"/>'),
 prev:SVG('<path d="M15 5l-7 7 7 7"/>'),next:SVG('<path d="M9 5l7 7-7 7"/>'),minus:SVG('<path d="M5 12h14"/>'),plus:SVG('<path d="M12 5v14M5 12h14"/>'),
 fit:SVG('<path d="M4 6v12M20 6v12M7 12h10M7 12l3-3M7 12l3 3M17 12l-3-3M17 12l-3 3"/>'),
 theme:SVG('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),info:SVG('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>'),
 undo:SVG('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),redo:SVG('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>')};
const esc=t=>String(t==null?'':t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/* File/Blob/Uint8Array/{blob()} — kisi bhi roop me file ke bytes nikalo. */
async function fileBytes(f){if(!f)return null;
 if(f instanceof Uint8Array)return f;
 if(typeof f.arrayBuffer=='function')return new Uint8Array(await f.arrayBuffer());
 if(typeof f.blob=='function'){const b=await f.blob();if(b&&typeof b.arrayBuffer=='function')return new Uint8Array(await b.arrayBuffer())}
 return null}
function themePick(){try{const t=localStorage.getItem('pdeTheme');if(t=='dark'||t=='light')return t}catch(e){}
 const a=document.documentElement.getAttribute('data-theme');if(a=='light'||a=='dark')return a;
 try{return matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}catch(e){return 'dark'}}

function start(ctx,host){
 if(S)return;
 if(!ctx||typeof ctx.getPage!='function'||!(ctx.total>0))throw new Error('PDF ki jaankari nahi mili');
 const st=S={ctx,page:clamp(ctx.page|0,0,ctx.total-1),total:ctx.total,scale:0,pw:1,ph:1,pgObj:null,tk:0,rt:0,task:null,dirty:false,pushed:false,pinch:null,rtm:0,raf:0,fresh:true};
 const root=document.createElement('div');root.className='pde-root on';root.dataset.th=themePick();root.setAttribute('role','dialog');root.setAttribute('aria-label','PDF Editor');
 root.innerHTML=
  '<header class="pde-top"><button class="pde-btn pde-ic pde-back" data-a="back" aria-label="Back to Viewer" title="Back to Viewer (Esc)">'+IC.back+'<span class="pde-tx">Viewer</span></button>'+
  '<div class="pde-title"><b class="pde-name"></b><small class="pde-sub"></small></div>'+
  '<button class="pde-btn pde-ic" data-a="un" aria-label="Undo" title="Undo (Ctrl+Z)">'+IC.undo+'</button>'+
  '<button class="pde-btn pde-ic" data-a="re" aria-label="Redo" title="Redo (Ctrl+Y)">'+IC.redo+'</button>'+
  '<button class="pde-btn pde-ic" data-a="sv" aria-label="Save Draft" title="Save Draft (Ctrl+S)"><span class="pde-tx">Draft</span></button>'+
  '<button class="pde-btn pde-ic" data-a="ex" aria-label="Export PDF" title="Export PDF"><span class="pde-tx">Export</span></button>'+
  '<button class="pde-btn pde-ic" data-a="more" aria-label="More" aria-haspopup="true">'+IC.more+'</button></header>'+
  '<div class="pde-body"><aside class="pde-rail" aria-label="Tools"></aside>'+
  '<main class="pde-stage" tabindex="-1"><div class="pde-pg"><canvas></canvas></div><div class="pde-busy" hidden><span class="pde-busy-t">Page load ho raha hai…</span><i class="pde-busy-p"></i></div></main>'+
  '<aside class="pde-props" aria-label="Properties"></aside></div>'+
  '<footer class="pde-bar"><button class="pde-btn pde-ic" data-a="prev" aria-label="Previous page" title="Previous page (PageUp)">'+IC.prev+'</button>'+
  '<label class="pde-pn"><input type="number" inputmode="numeric" min="1" aria-label="Page number"><span></span></label>'+
  '<button class="pde-btn pde-ic" data-a="next" aria-label="Next page" title="Next page (PageDown)">'+IC.next+'</button><i class="pde-sp"></i>'+
  '<button class="pde-btn pde-ic" data-a="zo" aria-label="Zoom out" title="Zoom out (-)">'+IC.minus+'</button><b class="pde-zv">100%</b>'+
  '<button class="pde-btn pde-ic" data-a="zi" aria-label="Zoom in" title="Zoom in (+)">'+IC.plus+'</button>'+
  '<button class="pde-btn pde-ic" data-a="fw" aria-label="Fit width" title="Fit width (0)">'+IC.fit+'</button></footer>'+
  '<div class="pde-sh" hidden><div class="pde-shk" data-a="sx"></div><div class="pde-shc" role="menu"><i class="pde-shh"></i><div class="pde-shb"></div></div></div>';
 document.body.appendChild(root);
 const q=s=>root.querySelector(s),stage=q('.pde-stage'),pg=q('.pde-pg'),busy=q('.pde-busy'),pin=q('.pde-pn input'),pnT=q('.pde-pn span'),zv=q('.pde-zv'),sh=q('.pde-sh'),shb=q('.pde-shb');
 q('.pde-name').textContent=ctx.name||'PDF';
 const sub=()=>{q('.pde-sub').textContent=(st.total||ctx.total)+' pages'+(st.dirty?' · unsaved':'')+(st.autoSavedAt?' · Auto-saved '+st.autoSavedAt:'')};sub();
 const prevOv=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';
 const setBusy=v=>{busy.hidden=!v;if(!v)setProg(0,'Page load ho raha hai…')};
 /* Lambi kaam ki progress (export, compare, OCR, rasterise) — busy box me line + % */
 function setProg(p,msg){const t=q('.pde-busy-t');if(t)t.textContent=msg||'';const bar=q('.pde-busy-p');if(bar)bar.style.width=Math.round(clamp(p||0,0,1)*100)+'%'}
 const cap=()=>st.lowMem?3e6:((navigator.deviceMemory||4)<=2?6e6:12e6);
 const fitW=()=>Math.max(.1,(stage.clientWidth-24)/st.pw);
 const rng=()=>{const f=fitW();return[f*.3,f*6]};
 function lab(){pin.value=st.page+1;pin.max=st.total;pnT.textContent='/ '+st.total;zv.textContent=Math.round(st.scale*100/ (st.base||1))+'%';
  root.querySelector('[data-a=prev]').disabled=st.page<=0;root.querySelector('[data-a=next]').disabled=st.page>=st.total-1}
 /* 100% = fit width: viewer jaisa; zoom % usi ke hisaab se */
 function lay(){const w=Math.round(st.pw*st.scale),h=Math.round(st.ph*st.scale);pg.style.width=w+'px';pg.style.height=h+'px';const c=pg.querySelector('canvas');c.style.width=w+'px';c.style.height=h+'px';if(typeof ovCv!=='undefined'){ovCv.style.width=w+'px';ovCv.style.height=h+'px'}lab()}
 async function draw(){
  const pgo=st.pgObj;const rt=++st.rt;
  if(!pgo){ /* blank page: sirf safed page + overlay */
   const dpr=st.lowMem?1:Math.min(devicePixelRatio||1,2),cv=baseCv;
   cv.width=Math.max(1,Math.round(st.pw*st.scale*dpr));cv.height=Math.max(1,Math.round(st.ph*st.scale*dpr));
   const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);
   cv.style.width=pg.style.width;cv.style.height=pg.style.height;pg.appendChild(ovCv);drawOv();setBusy(0);return}
  if(st.task){try{st.task.cancel()}catch(e){}}
  const dpr=st.lowMem?1:Math.min(devicePixelRatio||1,2);let rs=st.scale*dpr;const area=st.pw*st.ph*rs*rs,c0=cap();if(area>c0)rs*=Math.sqrt(c0/area);
  const vp=pgo.getViewport({scale:rs,rotation:st.pages[st.page].rot||0}),cv=baseCv;cv.width=Math.max(1,Math.ceil(vp.width));cv.height=Math.max(1,Math.ceil(vp.height));
  const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);
  const t=pgo.render({canvasContext:x,viewport:vp});st.task=t;
  try{await t.promise}catch(e){if(e&&e.name=='RenderingCancelledException')return;if(rt!=st.rt)return;setBusy(0);toast('Page dikhane me dikkat: '+(e&&e.message||e));return}
  if(rt!=st.rt)return;
  cv.style.width=pg.style.width;cv.style.height=pg.style.height;pg.appendChild(ovCv);drawOv();setBusy(0)}
 async function show(k,keep){
  k=clamp(k,0,st.pages.length-1);const t=++st.tk;st.page=k;lab();setBusy(1);
  if(st.dirty)scheduleAutoSave();
  const pgd=st.pages[k];
  if(pgd.src<0&&!pgd.ext){ /* blank page */
   st.pw=595;st.ph=842;st.pgObj=null;
   if(!st.scale||!keep){st.base=fitW();if(!st.scale)st.scale=st.base}
   st.scale=clamp(st.scale,...rng());lay();stage.scrollTop=0;if(st.fresh){stage.scrollLeft=0;st.fresh=false}draw();return}
  let p;try{p=await getPdfPage(k)}catch(e){if(t==st.tk){setBusy(0);toast('Page nahi khula: '+(e&&e.message||e))}return}
  if(t!=st.tk||!p)return;
  const v=p.getViewport({scale:1,rotation:pgd.rot||0});st.pw=v.width;st.ph=v.height;st.pgObj=p;
  if(!st.scale||!keep){st.base=fitW();if(!st.scale)st.scale=st.base}
  st.scale=clamp(st.scale,...rng());lay();stage.scrollTop=0;if(st.fresh){stage.scrollLeft=0;st.fresh=false}draw()}
 function zoomAt(ns,cx,cy){
  const[lo,hi]=rng();ns=clamp(ns,lo,hi);if(Math.abs(ns-st.scale)<1e-4)return;
  const r=pg.getBoundingClientRect(),u=(cx-r.left)/st.scale,v=(cy-r.top)/st.scale;
  st.scale=ns;lay();const r2=pg.getBoundingClientRect();stage.scrollLeft+=r2.left+u*ns-cx;stage.scrollTop+=r2.top+v*ns-cy;
  clearTimeout(st.rtm);st.rtm=setTimeout(draw,130)}
 const mid=()=>{const r=stage.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2]};
 const zoomBy=f=>{const[cx,cy]=mid();zoomAt(st.scale*f,cx,cy)};
 const fitNow=()=>{st.base=fitW();const[cx,cy]=mid();zoomAt(st.base,cx,cy);stage.scrollLeft=0};
 function toast(t){const d=document.createElement('div');d.className='pde-toast';d.textContent=t;root.appendChild(d);setTimeout(()=>d.remove(),2600)}

 /* ================= PHASE 2–6: Text, Image, Shapes, Annotation, Page Manager ================= */
 /* Objects: page ke andar, displayed page space me (origin upar-left, PDF points).
    Rotation wale page par export ke liye pdfPt/imgPos se wapas map hota hai. */
 st.pages=[];for(let i=0;i<ctx.total;i++)st.pages.push({src:i,rot:0,objs:[]});
 /* Apni pdf.js copy: viewer band hote hi uska document destroy ho jata hai (viewer close par doc.destroy()),
    isliye editor page dikhane ke liye viewer par nirbhar nahi rahega. Bytes pencil dabate hi nikaale jate hain (edGo),
    taaki viewer band ho jane ke baad bhi page khul sakein. */
 st.ownDoc=null;st.ownDocP=null;st.fileBytes=null;
 st.ownDocP=(async()=>{try{
  let u8=null;
  if(ctx.dataP){try{u8=await ctx.dataP}catch(e){u8=null}}
  if(!u8)u8=await fileBytes(ctx.file);
  if(!u8||!u8.length)return null;
  st.fileBytes=u8;
  const H=host||{};
  if(!window.pdfjsLib&&typeof H.PJ=='function'){try{await H.PJ()}catch(e){}}
  if(!window.pdfjsLib)return null;
  const d=await window.pdfjsLib.getDocument({data:u8.slice()}).promise;
  st.ownDoc=d;return d}catch(e){return null}})();
 st.total=st.pages.length;st.extDocs={};st.sel=null;st.tool='select';st.subtool=null;
 st.hist=[];st.hi=-1;st.wc=null;st.wcTried=false;st.find=null;st.findHi=null;st.gesture=null;
 st.selPages=new Set();st.propHist=false;st.defT={txt:'',size:18,color:'#111111',bold:false,italic:false,align:'left'};st.noteTxt='';
 /* Phase 13–15 state */
 st.exOpts={preset:'original',dpi:150,comments:true,bg:true};
 st.lowMem=false;try{st.lowMem=localStorage.getItem('pdeLowMem')==='1'}catch(e){}
 st.autoSave=true;try{st.autoSave=localStorage.getItem('pdeAutoSave')!=='0'}catch(e){}
 st.autoSavedAt=null;st.autoTimer=null;st.cmp=null;st.aiTxt=null;st.aiRes='';
 st.testList=[];try{st.testList=JSON.parse(localStorage.getItem('pdeTestList')||'[]')}catch(e){st.testList=[]}
 const rail=q('.pde-rail'),props=q('.pde-props');
 const baseCv=pg.querySelector('canvas');
 const ovCv=document.createElement('canvas');ovCv.className='pde-ov';pg.appendChild(ovCv);
 const imgIn=document.createElement('input');imgIn.type='file';imgIn.accept='image/png,image/jpeg,image/webp';imgIn.hidden=true;root.appendChild(imgIn);
 const pgIn=document.createElement('input');pgIn.type='file';pgIn.accept='application/pdf,.pdf';pgIn.hidden=true;root.appendChild(pgIn);
 const curPg=()=>st.pages[st.page];
 const curObjs=()=>curPg().objs;
 const snap=()=>JSON.stringify({pages:st.pages});
 function reloadImgs(p){flatObjs(p?p.objs:[]).forEach(o=>{if((o.kind==='image'||o.kind==='sig')&&o.dataUrl&&!o._img)loadImg(o.dataUrl).then(im=>{o._img=im;drawOv()}).catch(()=>{})})}
 function applySnap(s){st.pages=JSON.parse(s);st.pages.forEach(reloadImgs);syncTotal();st.sel=null;renderProps()}
 function pushHist(){st.hist=st.hist.slice(0,st.hi+1);st.hist.push(snap());const hm=st.lowMem?20:50;if(st.hist.length>hm)st.hist.shift();st.hi=st.hist.length-1}
 function pushHistOnce(){if(st.propHist)return;st.propHist=true;pushHist()}
 function syncTotal(){st.total=st.pages.length;sub()}
 async function ensureWC(){if(st.wc||st.wcTried)return;st.wcTried=true;
  try{
   if(st.ownDocP){try{await st.ownDocP}catch(e){}}
   let b=st.fileBytes;if(!b)b=await fileBytes(ctx.file);
   if(b&&b.length)st.wc=await createCopy(new Blob([b],{type:'application/pdf'}),ctx.name||'PDF');
   else toast('Original file yahan nahi mili — Export memory se hoga')}
  catch(e){toast('Working copy nahi bani: '+(e&&e.message||e))}}
 function commit(){pushHist();st.aiTxt=null;markDirty(true);ensureWC();scheduleAutoSave()}
 function doUndo(){if(st.hi<=0){toast('Undo karne ko kuch nahi');return}st.hi--;applySnap(st.hist[st.hi]);markDirty(true);show(st.page,1)}
 function doRedo(){if(st.hi>=st.hist.length-1){toast('Redo karne ko kuch nahi');return}st.hi++;applySnap(st.hist[st.hi]);markDirty(true);show(st.page,1)}
 function loadImg(src){return new Promise((ok,no)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=()=>no(new Error('Image nahi khuli'));im.src=src})}
 async function getPdfPage(pos){const pgd=st.pages[pos];if(!pgd)return null;
  if(pgd.ext){const d=st.extDocs[pgd.ext.id];return d?d.doc.getPage(pgd.ext.idx+1):null}
  if(pgd.src>=0){
   if(st.ownDocP){try{const d=await Promise.race([st.ownDocP,new Promise(r=>setTimeout(()=>r(null),8000))]);if(d)return d.getPage(pgd.src+1)}catch(e){}}
   return ctx.getPage(pgd.src)}
  return null}
 async function pgDims(pos){const p=await getPdfPage(pos);if(!p)return[595,842];const v=p.getViewport({scale:1});return[v.width,v.height]}
 /* rotation maps: unrotated top-left <-> displayed top-left; displayed -> pdf-lib bottom-left */
 function rotPt(x,y,rot,W,H){rot=((rot%360)+360)%360;
  if(rot===90)return[H-y,x];if(rot===180)return[W-x,H-y];if(rot===270)return[y,W-x];return[x,y]}
 function pdfPt(dx,dy,rot,W,H){rot=((rot%360)+360)%360;
  if(rot===90)return[dy,dx];if(rot===180)return[W-dx,dy];if(rot===270)return[W-dy,H-dx];return[dx,H-dy]}
 function imgPos(dx,dy,w,h,rot,W,H){rot=((rot%360)+360)%360;
  const c=[[dx,dy],[dx+w,dy],[dx+w,dy+h],[dx,dy+h]].map(p=>pdfPt(p[0],p[1],rot,W,H));
  const xs=c.map(p=>p[0]),ys=c.map(p=>p[1]),mnX=Math.min.apply(null,xs),mxX=Math.max.apply(null,xs),mnY=Math.min.apply(null,ys),mxY=Math.max.apply(null,ys);
  /* pdf-lib rotate +deg = counter-clockwise about bottom-left: 90° -> {mxX,mnY}, 270° -> {mnX,mxY} */
  if(rot===90)return{x:mxX,y:mnY};if(rot===180)return{x:mxX,y:mxY};if(rot===270)return{x:mnX,y:mxY};return{x:mnX,y:mnY}}
 function rectPdf(o,rot,W,H){const c=[[o.x,o.y],[o.x+o.w,o.y],[o.x+o.w,o.y+o.h],[o.x,o.y+o.h]].map(p=>pdfPt(p[0],p[1],rot,W,H));
  const xs=c.map(p=>p[0]),ys=c.map(p=>p[1]);return{x:Math.min.apply(null,xs),y:Math.min.apply(null,ys),w:Math.max.apply(null,xs)-Math.min.apply(null,xs),h:Math.max.apply(null,ys)-Math.min.apply(null,ys)}}
 function wrapLines(txt,maxW,size,bold,italic){const x=wrapLines._c||(wrapLines._c=document.createElement('canvas').getContext('2d'));
  x.font=(italic?'italic ':'')+(bold?'bold ':'')+size+'px sans-serif';
  const out=[];for(const para of String(txt||'').split('\n')){let line='';
   for(const w of para.split(/\s+/)){const t=line?line+' '+w:w;if(x.measureText(t).width>maxW&&line){out.push(line);line=w}else line=t}
   out.push(line||' ')}return out.length?out:[' ']}
 const kindName=k=>({text:'Text',ovr:'Overlay text',image:'Image',shape:'Shape',draw:'Drawing',note:'Note',hl:'Highlight',ul:'Underline',strike:'Strikethrough',sig:'Signature',stamp:'Stamp',field:'Form field',redact:'Redaction',group:'Group'}[k]||k);
 const KNOWN_KINDS=['text','ovr','image','shape','draw','note','hl','ul','strike','sig','stamp','field','redact','group'];
 const dispName=(o,i)=>o.name||(kindName(o.kind)+' '+(i+1));
 function flatObjs(list){const out=[];(list||[]).forEach(o=>{out.push(o);if(o.kind==='group'&&(o.children||[]).length)out.push.apply(out,flatObjs(o.children))});return out}
 function stripImgs(list){(list||[]).forEach(o=>{delete o._img;if(o.kind==='group')stripImgs(o.children)})}
 function objBox(o){if(o.kind==='group'){const ch=o.children||[];if(!ch.length)return{x:o.x||0,y:o.y||0,w:0,h:0};
   const bs=ch.map(objBox),xs=bs.map(b=>b.x),ys=bs.map(b=>b.y),xe=bs.map(b=>b.x+b.w),ye=bs.map(b=>b.y+b.h);
   const mnX=Math.min.apply(null,xs),mnY=Math.min.apply(null,ys);return{x:mnX,y:mnY,w:Math.max.apply(null,xe)-mnX,h:Math.max.apply(null,ye)-mnY}}
  if(o.kind==='draw'&&o.pts&&o.pts.length){const xs=o.pts.map(p=>p[0]),ys=o.pts.map(p=>p[1]);
   return{x:Math.min.apply(null,xs),y:Math.min.apply(null,ys),w:Math.max.apply(null,xs)-Math.min.apply(null,xs),h:Math.max.apply(null,ys)-Math.min.apply(null,ys)}}
  return{x:o.x,y:o.y,w:o.w,h:o.h}}
 function hitTest(px,py){const os=curObjs();for(let i=os.length-1;i>=0;i--){const o=os[i];if(o.hidden)continue;const b=objBox(o);if(px>=b.x-6&&px<=b.x+b.w+6&&py>=b.y-6&&py<=b.y+b.h+6)return o}return null}
 function findObj(id,list){list=list||curObjs();for(const o of list){if(o.id===id)return o;if(o.kind==='group'){const f=findObj(id,o.children);if(f)return f}}return null}
 function parentOf(id,list){list=list||curObjs();for(const o of list){if(o.kind==='group'&&(o.children||[]).some(c=>c.id===id))return o;if(o.kind==='group'){const f=parentOf(id,o.children);if(f)return f}}return null}
 function removeObjDeep(o){const par=parentOf(o.id),arr=par?par.children:curObjs(),i=arr.indexOf(o);if(i>=0)arr.splice(i,1);if(st.sel===o.id)selectObj(null);drawOv()}
 function selectObj(id){st.sel=id;st.propHist=false;renderProps();drawOv()}
 function removeObj(o){removeObjDeep(o)}
 function drawObj(c,o){
  if(o.kind==='text'||o.kind==='ovr'){
   if(o.kind==='ovr'){c.fillStyle='#fff';c.fillRect(o.x,o.y,o.w,o.h)}
   const lines=wrapLines(o.txt||'',o.w||200,o.size||14,o.bold,o.italic);
   c.save();c.globalAlpha=o.opacity==null?1:o.opacity;c.fillStyle=o.color||'#111';
   c.font=(o.italic?'italic ':'')+(o.bold?'bold ':'')+(o.size||14)+'px sans-serif';c.textBaseline='alphabetic';
   const lh=(o.size||14)*1.25;
   lines.forEach((ln,i)=>{let lx=o.x;if(o.align==='center')lx=o.x+((o.w||200)-c.measureText(ln).width)/2;else if(o.align==='right')lx=o.x+(o.w||200)-c.measureText(ln).width;
    c.fillText(ln,lx,o.y+(i+1)*lh-(lh-(o.size||14))*0.5)});c.restore()}
  else if(o.kind==='image'){const im=o._img;
   if(!im){loadImg(o.dataUrl).then(i=>{o._img=i;drawOv()}).catch(()=>{});c.fillStyle='#ddd';c.fillRect(o.x,o.y,o.w,o.h)}
   else{c.save();c.globalAlpha=o.opacity==null?1:o.opacity;c.translate(o.x+o.w/2,o.y+o.h/2);c.rotate((o.rot||0)*Math.PI/180);c.scale(o.flipH?-1:1,o.flipV?-1:1);
    try{c.filter='brightness('+(o.br||100)+'%) contrast('+(o.ct||100)+'%) saturate('+(o.sat||100)+'%) grayscale('+(o.gray||0)+'%)'}catch(e){}
    c.drawImage(im,-o.w/2,-o.h/2,o.w,o.h);c.restore()}}
  else if(o.kind==='shape'){
   c.save();c.globalAlpha=o.opacity==null?1:o.opacity;c.fillStyle=o.fill||'#4c9aff';c.strokeStyle=o.stroke||'#111';c.lineWidth=o.lw||2;
   if(o.shape==='ellipse'){c.beginPath();c.ellipse(o.x+o.w/2,o.y+o.h/2,Math.abs(o.w)/2,Math.abs(o.h)/2,0,0,Math.PI*2);c.fill();c.stroke()}
   else if(o.shape==='line'||o.shape==='arrow'){c.beginPath();c.moveTo(o.x0,o.y0);c.lineTo(o.x1,o.y1);c.stroke();
    if(o.shape==='arrow'){const ang=Math.atan2(o.y1-o.y0,o.x1-o.x0),L=12;
     for(const s of [0.42,-0.42]){c.beginPath();c.moveTo(o.x1,o.y1);c.lineTo(o.x1+L*Math.cos(ang+Math.PI+s),o.y1+L*Math.sin(ang+Math.PI+s));c.stroke()}}}
   else if(o.shape==='rrect'){if(c.roundRect){c.beginPath();c.roundRect(o.x,o.y,o.w,o.h,10);c.fill();c.stroke()}else{c.fillRect(o.x,o.y,o.w,o.h);c.strokeRect(o.x,o.y,o.w,o.h)}}
   else{c.fillRect(o.x,o.y,o.w,o.h);c.strokeRect(o.x,o.y,o.w,o.h)}c.restore()}
  else if(o.kind==='draw'){c.save();c.globalAlpha=o.hl?0.4:(o.opacity==null?1:o.opacity);c.strokeStyle=o.color||'#111';c.lineWidth=o.lw||2;c.lineCap='round';c.lineJoin='round';
   c.beginPath();o.pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke();c.restore()}
  else if(o.kind==='hl'){c.save();c.globalAlpha=0.35;c.fillStyle=o.color||'#ffeb3b';c.fillRect(o.x,o.y,o.w,o.h);c.restore()}
  else if(o.kind==='ul'){c.save();c.strokeStyle=o.color||'#e11';c.lineWidth=2;c.beginPath();c.moveTo(o.x,o.y+o.h-1);c.lineTo(o.x+o.w,o.y+o.h-1);c.stroke();c.restore()}
  else if(o.kind==='strike'){c.save();c.strokeStyle=o.color||'#e11';c.lineWidth=2;c.beginPath();c.moveTo(o.x,o.y+o.h/2);c.lineTo(o.x+o.w,o.y+o.h/2);c.stroke();c.restore()}
  else if(o.kind==='note'){c.save();c.fillStyle='#ffd54a';c.strokeStyle='#8a6d00';c.lineWidth=1;
   c.fillRect(o.x,o.y,o.w,o.h);c.strokeRect(o.x,o.y,o.w,o.h);
   c.fillStyle='#111';c.font='bold 13px sans-serif';c.fillText(o.resolved?'✓':'!',o.x+8,o.y+17);c.restore()}
  else if(o.kind==='sig'){const im=o._img;
   if(!im){loadImg(o.dataUrl).then(i=>{o._img=i;drawOv()}).catch(()=>{});c.fillStyle='#ddd';c.fillRect(o.x,o.y,o.w,o.h)}
   else{c.save();c.globalAlpha=o.opacity==null?1:o.opacity;c.translate(o.x+o.w/2,o.y+o.h/2);c.rotate((o.rot||0)*Math.PI/180);
    c.drawImage(im,-o.w/2,-o.h/2,o.w,o.h);c.restore()}}
  else if(o.kind==='stamp'){c.save();c.globalAlpha=o.opacity==null?1:o.opacity;c.translate(o.x+o.w/2,o.y+o.h/2);c.rotate((o.rot||0)*Math.PI/180);
   c.strokeStyle=o.color||'#c62828';c.lineWidth=3;c.fillStyle=o.color||'#c62828';
   if(c.roundRect){c.beginPath();c.roundRect(-o.w/2,-o.h/2,o.w,o.h,8);c.stroke()}else c.strokeRect(-o.w/2,-o.h/2,o.w,o.h);
   c.font='bold '+Math.max(10,Math.round(o.h*0.42))+'px sans-serif';c.textAlign='center';c.textBaseline='middle';
   c.fillText((o.text||'STAMP').toUpperCase(),0,0);c.restore()}
  else if(o.kind==='field'){c.save();c.setLineDash([5,3]);c.strokeStyle=o.required?'#c62828':'#1a6fe0';c.lineWidth=1.5;
   c.fillStyle='rgba(26,111,224,0.06)';c.fillRect(o.x,o.y,o.w,o.h);c.strokeRect(o.x,o.y,o.w,o.h);c.setLineDash([]);
   c.fillStyle='#1a6fe0';c.font='11px sans-serif';c.textBaseline='alphabetic';
   const lbl=(o.name||'Field')+(o.ftype==='check'?' ☐':o.ftype==='radio'?' ○':'');
   c.fillText(lbl,o.x+4,o.y+14);
   if(o.ftype==='check'&&o.value){c.font='bold 16px sans-serif';c.fillText('✓',o.x+o.w/2-6,o.y+o.h/2+6)}
   else if(o.value!=null&&o.value!==''&&o.ftype!=='radio'){c.fillStyle='#111';c.font=(o.fontSize||12)+'px sans-serif';c.fillText(String(o.value).slice(0,40),o.x+4,o.y+o.h-6)}
   else if(o.ftype==='radio'&&(o.options||[]).length){c.fillStyle='#111';c.font='11px sans-serif';(o.options||[]).slice(0,4).forEach((op,i)=>{c.beginPath();c.arc(o.x+10,o.y+22+i*16,5,0,Math.PI*2);c.stroke();if(o.value===op){c.beginPath();c.arc(o.x+10,o.y+22+i*16,2.5,0,Math.PI*2);c.fill()}c.fillText(op,o.x+20,o.y+26+i*16)})}
   c.restore()}
  else if(o.kind==='redact'){c.save();
   if(o.state==='confirmed'){c.fillStyle='#000';c.fillRect(o.x,o.y,o.w,o.h)}
   else{c.fillStyle='rgba(0,0,0,0.55)';c.fillRect(o.x,o.y,o.w,o.h)}
   c.strokeStyle='#e11';c.lineWidth=2;c.setLineDash([6,4]);c.strokeRect(o.x,o.y,o.w,o.h);c.setLineDash([]);
   c.fillStyle='#fff';c.font='bold 11px sans-serif';c.fillText(o.state==='confirmed'?'REDACTED ✓':'REDACT? — confirm karo',o.x+4,o.y+14);c.restore()}
  else if(o.kind==='group'){(o.children||[]).forEach(ch=>{if(!ch.hidden)drawObj(c,ch)})}}
 function drawOv(){
  const dpr=st.lowMem?1:Math.min(devicePixelRatio||1,2);
  const bw=Math.max(1,Math.round(st.pw*st.scale*dpr)),bh=Math.max(1,Math.round(st.ph*st.scale*dpr));
  if(ovCv.width!==bw||ovCv.height!==bh){ovCv.width=bw;ovCv.height=bh}
  ovCv.style.width=pg.style.width;ovCv.style.height=pg.style.height;
  const c=ovCv.getContext('2d');c.clearRect(0,0,bw,bh);
  const s=bw/st.pw;c.save();c.scale(s,s);
  if(st.findHi&&st.findHi.page===st.page){c.fillStyle='rgba(255,235,59,.5)';c.strokeStyle='#e11';c.lineWidth=2;
   c.fillRect(st.findHi.x,st.findHi.y,st.findHi.w,st.findHi.h);c.strokeRect(st.findHi.x,st.findHi.y,st.findHi.w,st.findHi.h)}
  for(const o of curObjs()){if(!o.hidden)drawObj(c,o)}
  if(st.gesture)drawGesture(c,st.gesture);
  if(st.sel){const o=findObj(st.sel);
   if(o){const b=objBox(o);c.save();c.strokeStyle='#4c9aff';c.lineWidth=1.5;c.setLineDash([5,3]);c.strokeRect(b.x-3,b.y-3,b.w+6,b.h+6);
    c.setLineDash([]);c.fillStyle='#4c9aff';c.fillRect(b.x+b.w-2,b.y+b.h-2,8,8);c.restore()}}
  c.restore()}
 function drawGesture(c,g){
  c.save();c.strokeStyle='#4c9aff';c.lineWidth=2;c.setLineDash([6,4]);
  const r={x:Math.min(g.x0,g.x1),y:Math.min(g.y0,g.y1),w:Math.abs(g.x1-g.x0),h:Math.abs(g.y1-g.y0)};
  if(g.kind==='redact'){c.save();c.strokeStyle='#e11';c.fillStyle='rgba(0,0,0,0.5)';c.fillRect(r.x,r.y,r.w,r.h);c.strokeRect(r.x,r.y,r.w,r.h);c.restore()}
  else if(g.kind==='rect'||g.kind==='rrect'){if(g.kind==='rrect'&&c.roundRect){c.beginPath();c.roundRect(r.x,r.y,r.w,r.h,10);c.stroke()}else c.strokeRect(r.x,r.y,r.w,r.h)}
  else if(g.kind==='ellipse'){c.beginPath();c.ellipse(r.x+r.w/2,r.y+r.h/2,Math.abs(r.w)/2,Math.abs(r.h)/2,0,0,Math.PI*2);c.stroke()}
  else if(g.kind==='line'||g.kind==='arrow'){c.beginPath();c.moveTo(g.x0,g.y0);c.lineTo(g.x1,g.y1);c.stroke()}
  else if(g.kind==='draw'||g.kind==='hl'){c.beginPath();g.pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke()}
  c.restore()}
 function normRect(g){return{x:Math.min(g.x0,g.x1),y:Math.min(g.y0,g.y1),w:Math.abs(g.x1-g.x0),h:Math.abs(g.y1-g.y0)}}
 function finishGesture(g){
  const r=normRect(g);
  if(g.kind==='rect'||g.kind==='rrect')return r.w<4||r.h<4?null:{id:newId(),kind:'shape',shape:g.kind,x:r.x,y:r.y,w:r.w,h:r.h,fill:'#4c9aff',stroke:'#111111',lw:2,opacity:1};
  if(g.kind==='ellipse')return r.w<4||r.h<4?null:{id:newId(),kind:'shape',shape:'ellipse',x:r.x,y:r.y,w:r.w,h:r.h,fill:'#4c9aff',stroke:'#111111',lw:2,opacity:1};
  if(g.kind==='line'||g.kind==='arrow')return Math.hypot(g.x1-g.x0,g.y1-g.y0)<4?null:{id:newId(),kind:'shape',shape:g.kind,x:r.x,y:r.y,w:r.w,h:r.h,x0:g.x0,y0:g.y0,x1:g.x1,y1:g.y1,fill:'#111111',stroke:'#111111',lw:2,opacity:1};
  if(g.kind==='draw'){if(g.pts.length<2)return null;const xs=g.pts.map(p=>p[0]),ys=g.pts.map(p=>p[1]);
   return{id:newId(),kind:'draw',x:Math.min.apply(null,xs),y:Math.min.apply(null,ys),w:Math.max.apply(null,xs)-Math.min.apply(null,xs),h:Math.max.apply(null,ys)-Math.min.apply(null,ys),pts:g.pts,color:'#111111',lw:2,opacity:1}}
  if(g.kind==='hl'||g.kind==='ul'||g.kind==='strike')return r.w<4||r.h<4?null:{id:newId(),kind:g.kind,x:r.x,y:r.y,w:r.w,h:Math.max(r.h,g.kind==='hl'?12:4),color:g.kind==='hl'?'#ffeb3b':'#e11',opacity:1};
  if(g.kind==='redact')return r.w<4||r.h<4?null:{id:newId(),kind:'redact',x:r.x,y:r.y,w:r.w,h:r.h,reason:(st.redactReason||'').trim(),state:'marked',opacity:1};
  return null}
 function addTextAt(px,py){pushHist();
  const d=st.defT,lines=wrapLines(d.txt||'Text likho',200,d.size,d.bold,d.italic);
  const o={id:newId(),kind:'text',x:px,y:py,w:200,h:Math.max(24,lines.length*d.size*1.25),txt:d.txt||'Text likho',size:d.size,color:d.color,bold:d.bold,italic:d.italic,align:d.align,opacity:1};
  curObjs().push(o);markDirty(true);ensureWC();selectObj(o.id);toast('Text aa gaya — Properties me likho')}
 function addNoteAt(px,py){const t=(st.noteTxt||'').trim()||prompt('Note likho:');if(!t)return;pushHist();
  const o={id:newId(),kind:'note',x:px,y:py,w:26,h:26,txt:t,color:'#ffd54a',resolved:false,opacity:1};
  curObjs().push(o);markDirty(true);ensureWC();selectObj(o.id);toast('Note lag gaya')}
 function startDrag(ev,px,py,o){
  if(o.locked){toast('Locked hai — pehle unlock karo (Layers ya Properties se)');return}
  const sx=px,sy=py;let moved=false;pushHist();
  const kids=o.kind==='group'?(o.children||[]).map(c=>({c:c,x:c.x,y:c.y,pts:c.pts?c.pts.map(p=>[p[0],p[1]]):null,x0:c.x0,y0:c.y0,x1:c.x1,y1:c.y1})):null;
  const ox=o.x,oy=o.y;
  const mv=e2=>{const r=pg.getBoundingClientRect(),nx=(e2.clientX-r.left)/st.scale,ny=(e2.clientY-r.top)/st.scale;
   const dx=nx-sx,dy=ny-sy;
   if(kids){kids.forEach(k=>{k.c.x=k.x+dx;k.c.y=k.y+dy;if(k.pts)k.c.pts=k.pts.map(p=>[p[0]+dx,p[1]+dy]);if(k.x0!=null){k.c.x0=k.x0+dx;k.c.y0=k.y0+dy;k.c.x1=k.x1+dx;k.c.y1=k.y1+dy}})}
   else{o.x=ox+dx;o.y=oy+dy}
   moved=true;drawOv()};
  const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);
   if(moved){markDirty(true);ensureWC();renderProps()}else{st.hist.pop();st.hi=st.hist.length-1}};
  window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up)}
 function startDraw(ev,px,py){
  const kind=st.subtool;if(!kind){toast('Pehle sheet se tool chuno');return}
  pushHist();
  const g={kind,x0:px,y0:py,x1:px,y1:py,pts:[[px,py]]};st.gesture=g;
  const mv=e2=>{const r=pg.getBoundingClientRect(),nx=(e2.clientX-r.left)/st.scale,ny=(e2.clientY-r.top)/st.scale;
   g.x1=nx;g.y1=ny;if(g.kind==='draw'||g.kind==='hl')g.pts.push([nx,ny]);drawOv()};
  const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);
   st.gesture=null;const o=finishGesture(g);
   if(o){curObjs().push(o);markDirty(true);ensureWC();selectObj(o.id)}else{st.hist.pop();st.hi=st.hist.length-1}drawOv()};
  window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up)}
 pg.addEventListener('pointerdown',ev=>{
  if(ev.pointerType==='mouse'&&ev.button!==0)return;
  const r=pg.getBoundingClientRect(),px=(ev.clientX-r.left)/st.scale,py=(ev.clientY-r.top)/st.scale;
  if(st.tool==='select'){const o=hitTest(px,py);
   if(o){selectObj(o.id);ev.stopPropagation();startDrag(ev,px,py,o);return}
   selectObj(null);return}
  ev.stopPropagation();ev.preventDefault();
  if(st.tool==='text'){addTextAt(px,py);return}
  if(st.tool==='image'){toast('Image sheet se chuno — page ke beech me aa jayegi');return}
  if(st.subtool==='note'){addNoteAt(px,py);return}
  if(st.subtool==='erase'){const o=hitTest(px,py);if(o){pushHist();removeObj(o);markDirty(true);ensureWC();toast('Hata diya')}return}
  if(st.subtool==='sig-place'){placeSigAt(px,py);return}
  if(st.subtool==='stamp-place'){placeStampAt(px,py);return}
  if(st.subtool&&st.subtool.indexOf('field-')===0){addFieldAt(px,py,st.subtool.slice(6));return}
  startDraw(ev,px,py)});
 /* ----- Tools rail ----- */
 const TOOLS=[['select','👆','Select'],['text','T','Text'],['image','🖼','Image'],['shape','▭','Shapes'],['ann','✎','Note'],['pages','📄','Pages'],['layers','☰','Layers'],['sign','✍','Sign'],['ocr','🔍','OCR'],['form','🧾','Form'],['redact','⬛','Redact'],['cmp','🆚','Compare'],['ai','🧠','AI']];
 rail.innerHTML=TOOLS.map(t=>'<button class="pde-btn pde-tool'+(st.tool===t[0]?' on':'')+'" data-t="'+t[0]+'" title="'+t[2]+'"><span>'+t[1]+'</span><small>'+t[2]+'</small></button>').join('');
 rail.addEventListener('click',ev=>{const b=ev.target.closest('[data-t]');if(!b)return;setTool(b.dataset.t)});
 function setTool(t){st.tool=t;st.subtool=null;st.gesture=null;
  rail.querySelectorAll('.pde-tool').forEach(el=>el.classList.toggle('on',el.dataset.t===t));
  if(t==='text')textSheet();else if(t==='image')imageSheet();else if(t==='shape')shapeSheet();else if(t==='ann')annSheet();else if(t==='pages')pagesSheet();
  else if(t==='layers')layersSheet();else if(t==='sign')signSheet();else if(t==='ocr')ocrSheet();else if(t==='form')formSheet();else if(t==='redact')redactSheet();else if(t==='cmp')compareSheet();else if(t==='ai')aiSheet();else sheetX();
  drawOv()}
 /* ----- Sheets ----- */
 function textSheet(){sheet('<div class="pde-inf"><b>Text</b><p>Page par tap karo — text wahan aa jayega.</p></div>'+
  '<label class="pde-fld">Text<textarea id="pde-tx" rows="2" placeholder="Yahan likho…">'+esc(st.defT.txt)+'</textarea></label>'+
  '<div class="pde-row"><label class="pde-fld">Size<input id="pde-ts" type="number" value="'+st.defT.size+'" min="8" max="120"></label>'+
  '<label class="pde-fld">Rang<input id="pde-tc" type="color" value="'+st.defT.color+'"></label></div>'+
  '<div class="pde-row"><button class="pde-btn'+(st.defT.bold?' on':'')+'" data-a="tb">B</button><button class="pde-btn'+(st.defT.italic?' on':'')+'" data-a="ti">I</button>'+
  '<select id="pde-ta" class="pde-btn"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></div>'+
  '<h3 style="margin:14px 0 2px">Dhoondho / Badlo (Overlay)</h3>'+
  '<p class="pde-mu">Purana text change nahi hota — us par safed rang aur naya text lagta hai (Overlay).</p>'+
  '<label class="pde-fld">Dhoondho<input id="pde-fq" type="text" placeholder="Shabd likho"></label>'+
  '<div class="pde-row"><button class="pde-btn" data-a="fnd">Dhoondho</button><button class="pde-btn" data-a="fnp">Pichhla</button><button class="pde-btn" data-a="fnn">Agla</button></div>'+
  '<label class="pde-fld">Naya text<input id="pde-fr" type="text" placeholder="Badalne wala text"></label>'+
  '<div class="pde-row"><button class="pde-btn" data-a="frp">Overlay se badlo</button></div><span class="pde-mu" id="pde-fs"></span>');
  const tx=q('#pde-tx');if(tx)tx.addEventListener('input',()=>{st.defT.txt=tx.value});
  const ts=q('#pde-ts');if(ts)ts.addEventListener('input',()=>{st.defT.size=clamp(+ts.value||18,8,120)});
  const tc=q('#pde-tc');if(tc)tc.addEventListener('input',()=>{st.defT.color=tc.value});
  const ta=q('#pde-ta');if(ta){ta.value=st.defT.align;ta.addEventListener('change',()=>{st.defT.align=ta.value})}}
 function imageSheet(){sheet('<div class="pde-inf"><b>Image</b><p>Gallery se image chuno — page ke beech me aa jayegi. Phir drag karke ghumao, Properties se size / rotate / filter badlo.</p></div>'+
  '<button class="pde-btn" data-a="im-add">🖼 Image chuno</button>'+
  '<p class="pde-mu">PNG, JPG, WebP. Image sirf working copy me judti hai, original file nahi badalti.</p>')}
 function shapeSheet(){sheet('<div class="pde-inf"><b>Shapes & Drawing</b><p>Tool chuno, phir page par drag karo.</p></div>'+
  '<div class="pde-row"><button class="pde-btn" data-a="sh-rect">▭ Rect</button><button class="pde-btn" data-a="sh-rrect">▢ Round</button><button class="pde-btn" data-a="sh-ellipse">◯ Circle</button></div>'+
  '<div class="pde-row"><button class="pde-btn" data-a="sh-line">／ Line</button><button class="pde-btn" data-a="sh-arrow">→ Arrow</button><button class="pde-btn" data-a="sh-pencil">✏ Pencil</button></div>'+
  '<div class="pde-row"><button class="pde-btn" data-a="sh-hl">🖍 Highlighter</button><button class="pde-btn" data-a="sh-erase">⌫ Eraser</button></div>'+
  '<p class="pde-mu">Eraser: kisi object par tap karo, wo hat jayega.</p>')}
 function annSheet(){sheet('<div class="pde-inf"><b>Annotation</b><p>Highlight / Underline / Strike: page par drag karo. Note: tap karo, phir likho.</p></div>'+
  '<label class="pde-fld">Note text<input id="pde-nt" type="text" placeholder="Note likho…"></label>'+
  '<div class="pde-row"><button class="pde-btn" data-a="an-hl">Highlight</button><button class="pde-btn" data-a="an-ul">Underline</button><button class="pde-btn" data-a="an-strike">Strike</button></div>'+
  '<div class="pde-row"><button class="pde-btn" data-a="an-note">📌 Sticky Note</button><button class="pde-btn" data-a="cmts">💬 Comments</button></div>');
  const nt=q('#pde-nt');if(nt){nt.value=st.noteTxt;nt.addEventListener('input',()=>{st.noteTxt=nt.value})}}
 function commentsSheet(){const f=st.cmFilter||'all';
  const items=[];st.pages.forEach((p,pi)=>p.objs.forEach(o=>{if(['note','hl','ul','strike'].indexOf(o.kind)>=0)items.push({pi,o})}));
  const list=items.filter(x=>f==='all'||(f==='open'?x.o.kind==='note'&&!x.o.resolved:f==='resolved'?x.o.kind==='note'&&x.o.resolved:x.o.kind===f));
  let h='<div class="pde-inf"><b>Comments</b></div><label class="pde-fld">Filter<select id="pde-cf"><option value="all">Sab</option><option value="note">Note</option><option value="hl">Highlight</option><option value="ul">Underline</option><option value="strike">Strike</option><option value="open">Khule hue</option><option value="resolved">Resolved</option></select></label>';
  h+=list.length?list.map(x=>'<div class="pde-pgr"><span>Page '+(x.pi+1)+' · '+kindName(x.o.kind)+(x.o.txt?' — '+esc(x.o.txt):'')+(x.o.resolved?' ✓':'')+'</span>'+
   '<button class="pde-btn pde-ic" data-a="cm-go" data-pg="'+x.pi+'" data-id="'+x.o.id+'">Kholo</button>'+
   (x.o.kind==='note'?'<button class="pde-btn pde-ic" data-a="cm-ed" data-pg="'+x.pi+'" data-id="'+x.o.id+'">✎</button><button class="pde-btn pde-ic" data-a="cm-res" data-pg="'+x.pi+'" data-id="'+x.o.id+'">'+(x.o.resolved?'↺':'✓')+'</button>':'')+
   '<button class="pde-btn pde-ic" data-a="cm-del" data-pg="'+x.pi+'" data-id="'+x.o.id+'">🗑</button></div>').join(''):'<p class="pde-mu">Abhi koi annotation nahi hai.</p>';
  sheet(h);
  const cf=q('#pde-cf');if(cf){cf.value=f;cf.addEventListener('change',()=>{st.cmFilter=cf.value;commentsSheet()})}}
 function pagesSheet(){let h='<div class="pde-inf"><b>Pages</b><p>'+st.total+' pages</p></div>'+
  '<div class="pde-row"><button class="pde-btn" data-a="pg-add">＋ Blank</button><button class="pde-btn" data-a="pg-dup">Copy</button><button class="pde-btn" data-a="pg-rot">⟳ Ghumao</button><button class="pde-btn" data-a="pg-del">🗑 Hatao</button></div>'+
  '<div class="pde-row"><button class="pde-btn" data-a="pg-up">↑ Upar</button><button class="pde-btn" data-a="pg-dn">↓ Neeche</button><button class="pde-btn" data-a="pg-ins">PDF se jodo</button><button class="pde-btn" data-a="pg-ext">Chune hue nikalo</button></div>'+
  '<div class="pde-pgl">'+st.pages.map((p,i)=>'<label class="pde-pgr"><input type="checkbox" data-pgck="'+i+'"'+(st.selPages.has(i)?' checked':'')+'><span>Page '+(i+1)+(p.src<0&&!p.ext?' · Blank':'')+(p.ext?' · '+(st.extDocs[p.ext.id]?esc(st.extDocs[p.ext.id].name):'PDF'):'')+(p.rot?' · '+p.rot+'°':'')+(p.objs.length?' · ✎'+p.objs.length:'')+'</span><button class="pde-btn pde-ic" data-a="pg-go" data-pg="'+i+'">Kholo</button></label>').join('')+'</div>';
  sheet(h);
  shb.querySelectorAll('[data-pgck]').forEach(cb=>cb.addEventListener('change',()=>{const i=+cb.dataset.pgck;if(cb.checked)st.selPages.add(i);else st.selPages.delete(i)}))}
 /* ================= PHASE 7: Layers & object manager (§12) ================= */
 /* List me sirf editor ke objects hain. Original PDF ka content page artwork hai, list me nahi aata. */
 st.layerSel=new Set();st.ocr={};st.ocrLang='eng';st.ocrClean={br:100,ct:100,th:0,rot:0};st.meta={title:'',author:'',subject:'',keywords:''};
 st.flattenForm=false;st.redactReason='';st.pendingSig=null;st.pendingStamp=null;st.sigTpls=[];
 try{st.sigTpls=JSON.parse(localStorage.getItem('pde_sigs')||'[]')}catch(e){st.sigTpls=[]}
 function layerRow(o,i,depth){
  const sel=st.layerSel.has(o.id);
  return '<label class="pde-pgr" style="margin-left:'+(depth*14)+'px"><input type="checkbox" data-lyck="'+o.id+'"'+(sel?' checked':'')+'>'+
   '<span>'+esc(dispName(o,i))+' · '+esc(kindName(o.kind))+(o.locked?' 🔒':'')+(o.hidden?' 👁‍🗨':'')+'</span>'+
   '<button class="pde-btn pde-ic" data-a="ly-go" data-id="'+o.id+'">Kholo</button>'+
   '<button class="pde-btn pde-ic" data-a="ly-eye" data-id="'+o.id+'" title="Hide/Show">'+(o.hidden?'👁‍🗨':'👁')+'</button>'+
   '<button class="pde-btn pde-ic" data-a="ly-lock" data-id="'+o.id+'" title="Lock/Unlock">'+(o.locked?'🔒':'🔓')+'</button></label>'}
 function layersSheet(){
  const os=curObjs();
  let h='<div class="pde-inf"><b>Layers — is page ke editor objects</b><p>Original PDF ka content yahan list nahi hota — wo page artwork hai. Upar wala object sabse aage hai.</p></div>';
  h+='<div class="pde-row"><button class="pde-btn" data-a="ly-group">Group banao</button><button class="pde-btn" data-a="ly-hide-sel">Hide</button><button class="pde-btn" data-a="ly-lock-sel">Lock</button><button class="pde-btn" data-a="ly-del-sel" style="color:#ff6b6b">Hatao</button></div>';
  h+='<div class="pde-pgl">';
  for(let i=os.length-1;i>=0;i--){const o=os[i];h+=layerRow(o,i,0);
   if(o.kind==='group')(o.children||[]).forEach((c,j)=>{h+=layerRow(c,j,1)})}
  h+='</div>';
  if(!os.length)h+='<p class="pde-mu">Is page par abhi koi editor object nahi hai.</p>';
  sheet(h);
  shb.querySelectorAll('[data-lyck]').forEach(cb=>cb.addEventListener('change',()=>{if(cb.checked)st.layerSel.add(cb.dataset.lyck);else st.layerSel.delete(cb.dataset.lyck)}))}
 function groupSelected(){
  const ids=Array.from(st.layerSel).filter(id=>!parentOf(id));const os=curObjs();
  const items=ids.map(id=>os.find(o=>o.id===id)).filter(Boolean);
  if(items.length<2){toast('Group ke liye kam se kam 2 objects chuno (checkbox)');return}
  pushHist();items.forEach(o=>os.splice(os.indexOf(o),1));
  const g={id:newId(),kind:'group',children:items,name:'Group '+(os.filter(o=>o.kind==='group').length+1),opacity:1};
  os.push(g);st.layerSel.clear();markDirty(true);ensureWC();selectObj(g.id);layersSheet();toast('Group ban gaya — saath me move hoga')}
 function ungroupObj(o){
  const par=parentOf(o.id),arr=par?par.children:curObjs(),i=arr.indexOf(o);if(i<0)return;
  pushHist();arr.splice.apply(arr,[i,1].concat(o.children||[]));markDirty(true);ensureWC();selectObj(null);renderProps();drawOv();toast('Group khul gaya')}

 /* ================= PHASE 8: Signature & stamps (§9) ================= */
 /* Drawn/typed signature sirf tasveer hai — digital certificate wala signature nahi. */
 const STAMPS=[['Approved','#1b7a2e'],['Rejected','#c62828'],['Paid','#1b7a2e'],['Unpaid','#c62828'],['Received','#1a6fe0'],['Draft','#757575'],['Verified','#1a6fe0'],['Confidential','#c62828']];
 const sigIn=document.createElement('input');sigIn.type='file';sigIn.accept='image/*';sigIn.hidden=true;root.appendChild(sigIn);
 sigIn.addEventListener('change',async()=>{const f=sigIn.files[0];sigIn.value='';if(!f)return;
  try{const du=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(f)});
   st.pendingSig={dataUrl:du,name:f.name};toast('Signature image ready — "Page par lagao" dabao')}catch(e){toast('Image nahi khuli')}});
 function signSheet(){
  sheet('<div class="pde-inf"><b>Signature & Stamps</b><p>Ye sirf tasveer wala signature hai, digital certificate wala nahi.</p></div>'+
  '<canvas id="pde-sigpad" width="600" height="200" style="width:100%;touch-action:none;border:1px dashed var(--br);border-radius:12px;background:#fff;display:block"></canvas>'+
  '<div class="pde-row"><button class="pde-btn" data-a="sg-clear">Saaf karo</button><button class="pde-btn" data-a="sg-save">Template save karo</button></div>'+
  '<label class="pde-fld">Type karke signature<input id="pde-sgt" type="text" placeholder="Apna naam likho"></label>'+
  '<div class="pde-row"><select id="pde-sgf" class="pde-btn"><option value="cursive">Cursive</option><option value="\'Brush Script MT\',cursive">Brush Script</option><option value="\'Segoe Script\',cursive">Segoe Script</option><option value="\'Comic Sans MS\',cursive">Comic Sans</option></select>'+
  '<button class="pde-btn" data-a="sg-type">Type se banao</button></div>'+
  '<div class="pde-row"><button class="pde-btn" data-a="sg-import">Image se lao</button><button class="pde-btn" data-a="sg-place">Page par lagao</button></div>'+
  (st.pendingSig?'<p class="pde-mu">Signature ready ✓ — "Page par lagao" dabao, phir page par tap karo.</p>':'')+
  (st.sigTpls.length?'<h3 style="margin:14px 0 2px">Saved signatures</h3>'+st.sigTpls.map((t,i)=>'<div class="pde-pgr"><span>'+esc(t.name||('Signature '+(i+1)))+'</span><button class="pde-btn pde-ic" data-a="sg-use" data-i="'+i+'">Use karo</button><button class="pde-btn pde-ic" data-a="sg-del" data-i="'+i+'">🗑</button></div>').join(''):'')+
  '<h3 style="margin:14px 0 2px">Stamps</h3><div class="pde-row" style="flex-wrap:wrap">'+STAMPS.map((s,i)=>'<button class="pde-btn" data-a="st-place" data-i="'+i+'" style="color:'+s[1]+'">'+s[0]+'</button>').join('')+'</div>'+
  '<label class="pde-fld">Apna stamp text<input id="pde-stc" type="text" placeholder="jaise: VERIFIED"></label>'+
  '<button class="pde-btn" data-a="st-custom">Apna stamp lagao</button>');
  const cv=q('#pde-sigpad');if(cv){const x=cv.getContext('2d');x.strokeStyle='#111';x.lineWidth=3;x.lineCap='round';x.lineJoin='round';let dn=false,lp=null;
   const pos=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height]};
   cv.addEventListener('pointerdown',e=>{e.preventDefault();dn=true;lp=pos(e);try{cv.setPointerCapture(e.pointerId)}catch(z){}});
   cv.addEventListener('pointermove',e=>{if(!dn)return;const p=pos(e);x.beginPath();x.moveTo(lp[0],lp[1]);x.lineTo(p[0],p[1]);x.stroke();lp=p});
   const up=()=>{dn=false;if(cv.toDataURL)st.pendingSig={dataUrl:cv.toDataURL('image/png'),name:'Drawn signature'}};
   cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up)}}
 function placeSigAt(px,py){if(!st.pendingSig||!st.pendingSig.dataUrl){toast('Pehle signature banao, type karo ya image lao');return}
  pushHist();const o={id:newId(),kind:'sig',x:px-100,y:py-35,w:200,h:70,dataUrl:st.pendingSig.dataUrl,rot:0,opacity:1};
  curObjs().push(o);markDirty(true);ensureWC();st.subtool=null;selectObj(o.id);sheetX();toast('Signature lag gaya')}
 function placeStampAt(px,py){if(!st.pendingStamp){toast('Pehle stamp chuno');return}
  pushHist();const o={id:newId(),kind:'stamp',x:px-70,y:py-25,w:140,h:50,text:st.pendingStamp.text,color:st.pendingStamp.color,rot:0,opacity:1};
  curObjs().push(o);markDirty(true);ensureWC();st.subtool=null;selectObj(o.id);sheetX();toast('Stamp lag gaya')}

 /* ================= PHASE 9: OCR & scan editing (§13) ================= */
 /* Engine: Tesseract.js 5.1.1, CDN se sirf tap par load hota hai (main app wala hi URL).
    Bhasha: eng / hin / eng+hin. Gujarati data nahi hai, isliye wada nahi karte.
    OCR galti kar sakta hai — review ke bina export mat karo. */
 function ensureTesseract(){return new Promise((ok,no)=>{
  if(window.Tesseract)return ok(window.Tesseract);
  const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const t=setTimeout(()=>{s.remove();no(new Error('OCR engine load nahi hua — internet chahiye'))},30000);
  s.onload=()=>{clearTimeout(t);window.Tesseract?ok(window.Tesseract):no(new Error('OCR engine load nahi hua'))};
  s.onerror=()=>{clearTimeout(t);s.remove();no(new Error('OCR engine load nahi hua — internet chahiye'))};
  document.head.appendChild(s)})}
 async function renderPageCanvas(pi,dpi,clean){
  const p=await getPdfPage(pi);if(!p)throw new Error('Page nahi khula');
  const pgd=st.pages[pi],sc=(dpi||150)/72,vp=p.getViewport({scale:sc,rotation:pgd.rot||0});
  const cv=document.createElement('canvas');cv.width=Math.max(1,Math.ceil(vp.width));cv.height=Math.max(1,Math.ceil(vp.height));
  const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);
  await p.render({canvasContext:x,viewport:vp}).promise;
  const c=clean||st.ocrClean;
  if(c&&(c.br!==100||c.ct!==100||c.th>0||c.rot)){
   const c2=document.createElement('canvas');c2.width=cv.width;c2.height=cv.height;const x2=c2.getContext('2d');
   try{x2.filter='brightness('+(c.br||100)+'%) contrast('+(c.ct||100)+'%) grayscale('+(c.th>0?100:0)+'%)'}catch(e){}
   x2.save();x2.translate(c2.width/2,c2.height/2);x2.rotate((c.rot||0)*Math.PI/180);x2.drawImage(cv,-cv.width/2,-cv.height/2);x2.restore();
   if(c.th>0){const d=x2.getImageData(0,0,c2.width,c2.height),a=d.data,th=c.th*2.55;for(let i=0;i<a.length;i+=4){const g=a[i]*0.3+a[i+1]*0.59+a[i+2]*0.11,v=g>th?255:0;a[i]=a[i+1]=a[i+2]=v}x2.putImageData(d,0,0)}
   return c2}
  return cv}
 async function ocrPage(pi){
  const lang=st.ocrLang||'eng';
  setBusy(1);const stEl=q('#pde-ocrst');if(stEl)stEl.textContent='OCR engine load ho raha hai…';
  try{
   await ensureTesseract();
   if(stEl)stEl.textContent='Page padh raha hoon…';
   const cv=await renderPageCanvas(pi,150);
   const w=await window.Tesseract.createWorker(lang,1,{logger:m=>{if(stEl&&m.status==='recognizing text')stEl.textContent='Padh raha hoon… '+Math.round((m.progress||0)*100)+'%';else if(stEl&&m.status)stEl.textContent=m.status+'…'}});
   let res;try{res=await w.recognize(cv,{pdfTitle:(ctx.name||'PDF')},{pdf:true})}finally{try{await w.terminate()}catch(e){}}
   const sc=150/72,words=[];
   (res.data.words||[]).forEach(wd=>{const b=wd.bbox||{};words.push({t:wd.text,x0:(b.x0||0)/sc,y0:(b.y0||0)/sc,x1:(b.x1||0)/sc,y1:(b.y1||0)/sc,c:Math.round(wd.confidence||0)})});
   st.ocr[pi]={lang:lang,text:(res.data.text||'').trim(),words:words,pdf:res.data.pdf?new Uint8Array(res.data.pdf):null,ts:Date.now()};
   markDirty(true);ocrSheet();toast('OCR ho gaya — text check karke sahi karo')}
  catch(e){toast('OCR nahi hua: '+(e&&e.message||e));if(stEl)stEl.textContent='OCR nahi hua: '+(e&&e.message||e)}
  finally{setBusy(0)}}
 function ocrSheet(){
  const pi=st.page,d=st.ocr[pi],low=d?d.words.filter(w=>w.c<60):[];
  sheet('<div class="pde-inf"><b>OCR Studio — Page '+(pi+1)+'</b><p>OCR galti kar sakta hai. Export se pehle text check karo. Bhasha: English / Hindi (Gujarati nahi).</p></div>'+
  '<label class="pde-fld">Bhasha<select id="pde-ocl"><option value="eng">English</option><option value="hin">Hindi</option><option value="eng+hin">English + Hindi</option></select></label>'+
  '<div class="pde-row"><label class="pde-fld">Brightness<input id="pde-ocb" type="range" min="50" max="150" value="'+st.ocrClean.br+'"></label><label class="pde-fld">Contrast<input id="pde-occ" type="range" min="50" max="200" value="'+st.ocrClean.ct+'"></label></div>'+
  '<div class="pde-row"><label class="pde-fld">Threshold (saaf scan)<input id="pde-oct" type="range" min="0" max="100" value="'+st.ocrClean.th+'"></label><label class="pde-fld">Tedha seedha (°)<input id="pde-ocr" type="number" min="-10" max="10" value="'+st.ocrClean.rot+'"></label></div>'+
  '<div class="pde-row"><button class="pde-btn" data-a="oc-run">Is page ko padho</button></div>'+
  '<p class="pde-mu" id="pde-ocrst">'+(d?('Padha hua: '+d.words.length+' words · '+d.lang+' · '+new Date(d.ts).toLocaleTimeString()):'Abhi is page ka OCR nahi hua.')+'</p>'+
  (d?'<label class="pde-fld">Pehchana hua text (sahi kar sakte ho)<textarea id="pde-oct2" rows="6">'+esc(d.text)+'</textarea></label>'+
   (low.length?'<p class="pde-mu">Kam bharosa wale words ('+low.length+'): '+low.slice(0,12).map(w=>esc(w.t)+' ('+w.c+'%)').join(', ')+'</p>':'<p class="pde-mu">Sab words par bharosa theek hai.</p>')+
   '<div class="pde-row"><button class="pde-btn" data-a="oc-save">Text save karo</button><button class="pde-btn" data-a="oc-totext">Text objects banao</button></div>'+
   '<button class="pde-btn" data-a="oc-searchable">Searchable PDF banao</button>':'')+
  '<p class="pde-mu">Searchable PDF me page waisa hi dikhta hai, peeche chhupa text judta hai — search aur copy chalega.</p>');
  const l=q('#pde-ocl');if(l){l.value=st.ocrLang;l.addEventListener('change',()=>{st.ocrLang=l.value})}
  const b=q('#pde-ocb');if(b)b.addEventListener('input',()=>{st.ocrClean.br=+b.value});
  const c=q('#pde-occ');if(c)c.addEventListener('input',()=>{st.ocrClean.ct=+c.value});
  const t=q('#pde-oct');if(t)t.addEventListener('input',()=>{st.ocrClean.th=+t.value});
  const r=q('#pde-ocr');if(r)r.addEventListener('input',()=>{st.ocrClean.rot=clamp(+r.value||0,-10,10)})}
 function ocrToTextObjects(pi){
  const d=st.ocr[pi];if(!d||!d.words.length){toast('Pehle is page ka OCR karo');return}
  pushHist();const lines={};
  d.words.forEach(w=>{const k=Math.round(w.y0/8);(lines[k]=lines[k]||[]).push(w)});
  let n=0;
  Object.keys(lines).sort((a,b)=>a-b).forEach(k=>{const ws=lines[k].sort((a,b)=>a.x0-b.x0);
   const x0=Math.min.apply(null,ws.map(w=>w.x0)),y0=Math.min.apply(null,ws.map(w=>w.y0));
   const x1=Math.max.apply(null,ws.map(w=>w.x1)),y1=Math.max.apply(null,ws.map(w=>w.y1));
   const o={id:newId(),kind:'text',x:x0,y:y0,w:Math.max(20,x1-x0),h:Math.max(14,y1-y0+4),txt:ws.map(w=>w.t).join(' '),size:Math.max(8,Math.round((y1-y0)*0.9)),color:'#111111',bold:false,italic:false,align:'left',opacity:1};
   st.pages[pi].objs.push(o);n++});
  markDirty(true);ensureWC();drawOv();toast(n+' text lines ban gayi — OCR text hai, galti ho sakti hai')}
 async function exportSearchable(){
  const pages=Object.keys(st.ocr).map(Number).filter(pi=>st.ocr[pi]&&st.ocr[pi].pdf);
  if(!pages.length){toast('Pehle kisi page ka OCR karo');return}
  setBusy(1);
  try{
   if(!host||!host.PL)throw new Error('pdf-lib nahi mili');
   await host.PL();const F=window.PDFLib;if(!F)throw new Error('PDFLib nahi mili');
   let bytes=null;if(st.wc)bytes=await st.wc.getBytes();else if(ctx.file)bytes=new Uint8Array(await ctx.file.arrayBuffer());
   const out=await F.PDFDocument.create();
   const src=bytes?await F.PDFDocument.load(bytes.slice(),{ignoreEncryption:true}):null;
   for(let pi=0;pi<st.pages.length;pi++){
    const d=st.ocr[pi];
    if(d&&d.pdf){const od=await F.PDFDocument.load(d.pdf.slice());const cp=await out.copyPages(od,[0]);out.addPage(cp[0])}
    else if(src){const pgd=st.pages[pi];let doc2=src,idx=pgd.src;
     if(pgd.ext){doc2=await F.PDFDocument.load(st.extDocs[pgd.ext.id].bytes.slice(),{ignoreEncryption:true});idx=pgd.ext.idx}
     if(pgd.src<0&&!pgd.ext)out.addPage([595,842]);
     else{const cp=await out.copyPages(doc2,[idx]);const pg=cp[0];out.addPage(pg);if(pgd.rot)pg.setRotation(F.degrees(pgd.rot))}}
    else out.addPage([595,842])}
   const saved=await out.save();
   const chk=await F.PDFDocument.load(saved);if(chk.getPageCount()!==st.pages.length)throw new Error('Searchable check fail');
   const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([saved],{type:'application/pdf'}));a.download=(ctx.name||'PDF').replace(/\.pdf$/i,'')+'_searchable.pdf';document.body.appendChild(a);a.click();
   setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);
   toast('Searchable PDF ban gayi: '+pages.length+' page me chhupa text')}
  catch(e){toast('Searchable PDF nahi bani: '+(e&&e.message||e))}
  finally{setBusy(0)}}

 /* ================= PHASE 10: Forms & interactive fields (§11) ================= */
 /* Asli AcroForm fields (pdf-lib PDFForm). Signature field bhi text field hai — digital certificate nahi. */
 const FIELD_DEFS={text:['Text field',180,28],multi:['Multiline text',180,70],check:['Checkbox',24,24],radio:['Radio group',180,60],drop:['Dropdown',180,28],date:['Date field',140,28],sig:['Signature field',180,50]};
 function addFieldAt(px,py,ftype){
  const def=FIELD_DEFS[ftype];if(!def){toast('Field type nahi mila');return}
  pushHist();
  const n=curObjs().filter(o=>o.kind==='field').length+1;
  const o={id:newId(),kind:'field',ftype:ftype,x:px-def[1]/2,y:py-def[2]/2,w:def[1],h:def[2],
   name:(ftype==='radio'?'group':ftype)+'_'+n,value:ftype==='check'?false:'',placeholder:'',required:false,readonly:false,maxLen:0,fontSize:12,
   options:ftype==='radio'?['Option 1','Option 2']:ftype==='drop'?['Option 1','Option 2','Option 3']:null,opacity:1};
  curObjs().push(o);markDirty(true);ensureWC();st.subtool=null;selectObj(o.id);sheetX();toast(def[0]+' lag gaya — Properties me naam/value badlo')}
 function formSheet(){
  sheet('<div class="pde-inf"><b>Form Designer</b><p>Field chuno, phir page par tap karo. Export par asli AcroForm field banta hai — sirf box nahi. Signature field me type karke sign karte hain; ye digital certificate nahi hai.</p></div>'+
  '<div class="pde-row" style="flex-wrap:wrap">'+Object.keys(FIELD_DEFS).map(k=>'<button class="pde-btn" data-a="fm-'+k+'">'+FIELD_DEFS[k][0]+'</button>').join('')+'</div>'+
  '<div class="pde-row"><button class="pde-btn" data-a="fm-reset">Form reset karo</button></div>'+
  '<label class="pde-fld" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="pde-ffl" style="width:auto"'+(st.flattenForm?' checked':'')+'> Flatten karke export karo (field values plain text ban jayenge, form khatm)</label>'+
  '<p class="pde-mu">Field ka text standard font se dikhta hai — Hindi field value me sahi na dikhe to flatten use karo (canvas text).</p>');
  const fl=q('#pde-ffl');if(fl)fl.addEventListener('change',()=>{st.flattenForm=fl.checked;markDirty(true)})}

 /* ================= PHASE 11: Redaction & security (§15, §17) ================= */
 /* Asli redaction: confirm hone par export me wo page rasterise hota hai (150 DPI) aur redaction
    jagah kaala rang diya jata hai — neeche ka text/image sach me nikal jata hai. Sirf kaala box nahi. */
 function redactSheet(){
  const all=[];st.pages.forEach((p,pi)=>p.objs.forEach(o=>{if(o.kind==='redact')all.push({pi:pi,o:o})}));
  let h='<div class="pde-inf"><b>Redaction & Security</b><p>Redaction asli hai: confirm karne par wo page image ban jata hai aur neeche ka content hamesha ke liye nikal jata hai. Us page ka text phir select/search nahi hoga.</p></div>'+
  '<label class="pde-fld">Redaction reason<input id="pde-rdr" type="text" placeholder="jaise: Personal info" value="'+esc(st.redactReason)+'"></label>'+
  '<label class="pde-fld">Text dhoondh kar mark karo<input id="pde-rdq" type="text" placeholder="Shabd likho"></label>'+
  '<div class="pde-row"><button class="pde-btn" data-a="rd-find">Dhoondh kar mark karo</button><button class="pde-btn" data-a="rd-area">Area mark karo</button></div>'+
  '<div class="pde-row"><button class="pde-btn" data-a="rd-confirm-all">Sab confirm karo</button></div>';
  h+=all.length?all.map(x=>'<div class="pde-pgr"><span>Page '+(x.pi+1)+' · '+(x.o.reason?esc(x.o.reason):'Redaction')+' — '+(x.o.state==='confirmed'?'Confirmed ✓':'Marked (confirm nahi hua)')+'</span>'+
   '<button class="pde-btn pde-ic" data-a="rd-go" data-pg="'+x.pi+'" data-id="'+x.o.id+'">Kholo</button>'+
   '<button class="pde-btn pde-ic" data-a="rd-confirm" data-pg="'+x.pi+'" data-id="'+x.o.id+'">'+(x.o.state==='confirmed'?'↺':'✓')+'</button>'+
   '<button class="pde-btn pde-ic" data-a="rd-del" data-pg="'+x.pi+'" data-id="'+x.o.id+'">🗑</button></div>').join(''):'<p class="pde-mu">Abhi koi redaction nahi hai.</p>';
  h+='<p class="pde-mu">Password: is library (pdf-lib) se PDF encrypt nahi hoti, isliye yahan password nahi lagta. Main app me "Add password" server tool hai — wahan se lagao. Print/copy permission flags bhi yahan enforce nahi hote.</p>';
  sheet(h);
  const rr=q('#pde-rdr');if(rr)rr.addEventListener('input',()=>{st.redactReason=rr.value})}
 async function redactFind(){
  const qq=((q('#pde-rdq')||{}).value||'').trim();if(!qq){toast('Pehle shabd likho');return}
  await findRun(qq);const F=st.find;if(!F||!F.matches.length)return;
  pushHist();const reason=(st.redactReason||'').trim();
  F.matches.forEach(m=>{st.pages[m.page].objs.push({id:newId(),kind:'redact',x:m.x-2,y:m.y-2,w:m.w+4,h:m.h+4,reason:reason,state:'marked',opacity:1})});
  markDirty(true);ensureWC();st.findHi=null;drawOv();redactSheet();toast(F.matches.length+' jagah mark ho gayi — confirm karo, tabhi export me lagegi')}
 function metaSheet(){
  sheet('<div class="pde-inf"><b>Metadata</b><p>Export ki hui PDF me ye details jud jayengi.</p></div>'+
  '<label class="pde-fld">Title<input id="pde-mt" type="text" value="'+esc(st.meta.title)+'"></label>'+
  '<label class="pde-fld">Author<input id="pde-ma" type="text" value="'+esc(st.meta.author)+'"></label>'+
  '<label class="pde-fld">Subject<input id="pde-ms" type="text" value="'+esc(st.meta.subject)+'"></label>'+
  '<label class="pde-fld">Keywords (comma se alag)<input id="pde-mk" type="text" value="'+esc(st.meta.keywords)+'"></label>'+
  '<button class="pde-btn" data-a="mt-save">Save karo</button>')}
 function secSheet(){
  sheet('<div class="pde-inf"><b>Security</b></div>'+
  '<p class="pde-mu">Password protection: pdf-lib akeli PDF encrypt nahi karti, isliye is editor se password nahi lag sakta. Ye fake nahi karenge.</p>'+
  '<p class="pde-mu">Main app me "Add password" (Server tools) hai — password server ko bheja jata hai (https), wahan store nahi hota. Wahan se PDF lock kar sakte ho.</p>'+
  '<p class="pde-mu">Print / copy / edit permission flags bhi is library se enforce nahi hote — wo sirf ek nishan hota hai, suraksha nahi. Isliye yahan wo option nahi hai.</p>'+
  '<p class="pde-mu">Redaction ke liye Redact tool use karo — confirm hone par page rasterise hokar sach me saaf hota hai.</p>')}

 /* ================= PHASE 12: Document comparison (§16) ================= */
 /* Dusri PDF se page-by-page milaan. Text diff word-by-word (LCS), pixel diff
    sirf andaza hai (chhota render, laal nishaan) — exact image diff ka wada nahi. */
 const cmpIn=document.createElement('input');cmpIn.type='file';cmpIn.accept='application/pdf,.pdf';cmpIn.hidden=true;root.appendChild(cmpIn);
 cmpIn.addEventListener('change',async()=>{const f=cmpIn.files[0];cmpIn.value='';if(!f)return;
  try{if(!window.pdfjsLib){if(host&&host.PJ)await host.PJ()}if(!window.pdfjsLib)throw new Error('pdf.js nahi mili');
   const bytes=new Uint8Array(await f.arrayBuffer());
   const doc=await window.pdfjsLib.getDocument({data:bytes.slice()}).promise;
   st.cmp={name:f.name,doc:doc,bytes:bytes,results:null,sel:0,order:[]};
   toast('Dusri PDF load ho gayi: '+doc.numPages+' pages — "Compare karo" dabao');compareSheet()}
  catch(e){toast('PDF nahi khuli: '+(e&&e.message||e))}});
 function wordDiff(a,b){
  const n=a.length,m=b.length;
  if(n*m>4e6){const sa=new Set(a),sb=new Set(b);return{add:b.filter(x=>!sa.has(x)).length,del:a.filter(x=>!sb.has(x)).length,pairs:[],big:true}}
  const w=m+1,L=new Uint16Array((n+1)*w);
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)L[i*w+j]=a[i]===b[j]?L[(i+1)*w+j+1]+1:Math.max(L[(i+1)*w+j],L[i*w+j+1]);
  const pairs=[];let i=0,j=0,add=0,del=0;
  while(i<n&&j<m){if(a[i]===b[j]){pairs.push([' ',a[i]]);i++;j++}else if(L[(i+1)*w+j]>=L[i*w+j+1]){pairs.push(['-',a[i++]]);del++}else{pairs.push(['+',b[j++]]);add++}}
  while(i<n){pairs.push(['-',a[i++]]);del++}while(j<m){pairs.push(['+',b[j++]]);add++}
  return{add:add,del:del,pairs:pairs,big:false}}
 async function pageWordsFromPage(p){if(!p)return[];const tc=await p.getTextContent();
  return tc.items.map(x=>x.str).join(' ').replace(/\s+/g,' ').trim().split(' ').filter(Boolean)}
 async function pixDiff(pa,pb){
  const sc=0.8;
  const render=async p=>{const vp=p.getViewport({scale:sc});const cv=document.createElement('canvas');cv.width=Math.max(1,Math.ceil(vp.width));cv.height=Math.max(1,Math.ceil(vp.height));
   const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);await p.render({canvasContext:x,viewport:vp}).promise;return cv};
  const ref=pa||pb;if(!ref)return{pct:0,canvas:null};
  const ca=pa?await render(pa):(()=>{const vp=ref.getViewport({scale:sc});const cv=document.createElement('canvas');cv.width=Math.max(1,Math.ceil(vp.width));cv.height=Math.max(1,Math.ceil(vp.height));const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);return cv})();
  const cb=pb?await render(pb):ca;
  const cc=document.createElement('canvas');cc.width=ca.width;cc.height=ca.height;const x=cc.getContext('2d');
  x.drawImage(cb,0,0,ca.width,ca.height);
  const A=ca.getContext('2d').getImageData(0,0,ca.width,ca.height),B=x.getImageData(0,0,cc.width,cc.height),N=A.data.length;
  let d=0;for(let i=0;i<N;i+=4){const df=Math.max(Math.abs(A.data[i]-B.data[i]),Math.abs(A.data[i+1]-B.data[i+1]),Math.abs(A.data[i+2]-B.data[i+2]));if(df>48){d++;B.data[i]=255;B.data[i+1]=0;B.data[i+2]=0}}
  x.putImageData(B,0,0);
  return{pct:d*400/N,canvas:cc}}
 async function runCompare(){
  const C=st.cmp;if(!C||!C.doc){toast('Pehle dusri PDF chuno');return}
  const n=Math.min(st.pages.length,C.doc.numPages,40);
  setBusy(1);
  try{
   const results=[],aSets=[];
   for(let i=0;i<n;i++){
    setProg((i+1)/n,'Compare: page '+(i+1)+' / '+n);
    await new Promise(r=>setTimeout(r,0));
    const pa=await getPdfPage(i),pb=await C.doc.getPage(i+1);
    const wa=await pageWordsFromPage(pa),wb=await pageWordsFromPage(pb);
    aSets.push(new Set(wa.slice(0,200)));
    const d=wordDiff(wa,wb);
    let pct=null,diffCv=null;
    try{const r=await pixDiff(pa,pb);pct=r.pct;diffCv=r.canvas}catch(e){}
    results.push({i:i,add:d.add,del:d.del,pairs:d.pairs.slice(0,40),big:d.big,pc:pct,diffCv:diffCv,bad:d.add+d.del>0||(pct!=null&&pct>0.5)})}
   /* Page order ka andaza: B ke har page ka A me sabse milta-julta page dhoondho */
   const order=[];
   if(st.pages.length!==C.doc.numPages)order.push('Pages alag hain: is PDF me '+st.pages.length+', dusri me '+C.doc.numPages+'. Sirf pehle '+n+' compare hue.');
   for(let j=0;j<n;j++){
    const pb=await C.doc.getPage(j+1),wb=new Set((await pageWordsFromPage(pb)).slice(0,200));
    let best=-1,bestN=0;aSets.forEach((s,i)=>{let c=0;wb.forEach(w=>{if(s.has(w))c++});if(c>bestN){bestN=c;best=i}});
    if(best>=0&&best!==j&&bestN>=10)order.push('Dusri PDF ka page '+(j+1)+' is PDF ke page '+(best+1)+' jaisa hai ('+bestN+' shabd mile) — order badla lagta hai.')}
   C.results=results;C.order=order;C.sel=results.findIndex(r=>r.bad);if(C.sel<0)C.sel=0;
   toast(results.filter(r=>r.bad).length?results.filter(r=>r.bad).length+' page me farq mila':'Koi farq nahi mila ✓');
   compareSheet()}
  catch(e){toast('Compare nahi hua: '+(e&&e.message||e))}
  finally{setBusy(0)}}
 async function showCmpPage(i){
  const C=st.cmp;if(!C||!C.results)return;C.sel=i;
  const box=q('#pde-cmps');if(!box)return;
  box.innerHTML='<p class="pde-mu">Page '+(i+1)+' load ho raha hai…</p>';
  try{
   const pa=await getPdfPage(i),pb=await C.doc.getPage(i+1);
   const mk=async p=>{if(!p){const cv=document.createElement('canvas');cv.width=200;cv.height=280;const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,200,280);x.fillStyle='#999';x.font='14px sans-serif';x.fillText('Blank',70,140);return cv}
    const vp=p.getViewport({scale:0.45});const cv=document.createElement('canvas');cv.width=Math.max(1,Math.ceil(vp.width));cv.height=Math.max(1,Math.ceil(vp.height));
    const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);await p.render({canvasContext:x,viewport:vp}).promise;return cv};
   const ca=await mk(pa),cb=await mk(pb),r=C.results[i];
   box.innerHTML='<div class="pde-cmp"><div><b>Is PDF — Page '+(i+1)+'</b></div><div><b>'+esc(C.name)+' — Page '+(i+1)+'</b></div></div><div class="pde-cmp"></div>';
   const row=box.querySelectorAll('.pde-cmp')[1];row.appendChild(ca);row.appendChild(cb);
   if(r&&r.diffCv){const d=document.createElement('div');d.innerHTML='<b>Farq (laal = alag dikha, andaza '+(r.pc!=null?r.pc.toFixed(1)+'%':'-')+')</b>';box.appendChild(d);box.appendChild(r.diffCv)}
   if(r){const chg=[];for(let k=0;k<r.pairs.length;k++){if(r.pairs[k][0]==='-'){const nx=r.pairs[k+1];chg.push(r.pairs[k][1]+(nx&&nx[0]==='+'?' → '+nx[1]:' (hata)'))}}
    let sum=r.add+r.del?('Jode gaye: '+r.add+' · Hataye gaye: '+r.del):'Text same hai';
    if(chg.length)sum+=' · Badle: '+chg.slice(0,8).join(', ');
    if(r.pc!=null)sum+=' · Dikhne me '+r.pc.toFixed(1)+'% alag (andaza)';
    if(r.big)sum+=' · Bahut bade page — sirf ginati, poora diff nahi';
    box.insertAdjacentHTML('beforeend','<p class="pde-mu">'+esc(sum)+'</p>')}
  }catch(e){box.innerHTML='<p class="pde-mu">Page nahi dikh paya: '+esc(e.message||e)+'</p>'}}
 function compareSheet(){
  const C=st.cmp;
  let h='<div class="pde-inf"><b>Compare PDFs</b><p>Is PDF ko dusri PDF se milao — page by page. Text ka farq word-by-word, dikhne ka farq laal nishaan se (andaza).</p></div>';
  if(!C){h+='<button class="pde-btn" data-a="cmp-pick">Dusri PDF chuno</button>';sheet(h);return}
  h+='<p class="pde-mu">Dusri PDF: '+esc(C.name)+' · '+C.doc.numPages+' pages (is PDF me '+st.pages.length+')</p>';
  h+='<div class="pde-row"><button class="pde-btn" data-a="cmp-run">Compare karo</button><button class="pde-btn" data-a="cmp-pick">Dusri badlo</button></div>';
  if(C.results){
   const bad=C.results.filter(r=>r.bad);
   h+='<p class="pde-mu">'+(bad.length?bad.length+' page me farq mila':'Koi farq nahi mila ✓')+' (40 pages tak compare hota hai)</p>';
   if(C.order&&C.order.length)h+='<p class="pde-mu">'+C.order.map(esc).join('<br>')+'</p>';
   h+='<div class="pde-pgl">'+C.results.map((r,i)=>'<div class="pde-pgr"><span>Page '+(i+1)+' · '+(r.bad?('＋'+r.add+' −'+r.del+(r.pc!=null?' · '+r.pc.toFixed(1)+'% alag':'')):'Same ✓')+'</span><button class="pde-btn pde-ic" data-a="cmp-pg" data-i="'+i+'">Dekho</button></div>').join('')+'</div>';
   h+='<div id="pde-cmps"></div>';
   h+='<button class="pde-btn" data-a="cmp-rep">Report .txt download karo</button>'}
  sheet(h);
  if(C.results)showCmpPage(C.sel||0)}
 function cmpReport(){
  const C=st.cmp;if(!C||!C.results){toast('Pehle compare karo');return}
  const bad=C.results.filter(r=>r.bad);
  const lines=['Compare report','Is PDF: '+(ctx.name||'PDF')+' ('+st.pages.length+' pages)','Dusri PDF: '+C.name+' ('+C.doc.numPages+' pages)','Date: '+new Date().toLocaleString(),''];
  (C.order||[]).forEach(o=>lines.push(o));if(C.order&&C.order.length)lines.push('');
  lines.push(bad.length?bad.length+' page me farq mila':'Koi farq nahi mila');
  C.results.filter(r=>r.bad).forEach(r=>{lines.push('','Page '+(r.i+1)+': +'+r.add+' jode, -'+r.del+' hataye'+(r.pc!=null?', dikhne me '+r.pc.toFixed(1)+'% alag (andaza)':''));
   r.pairs.filter(p=>p[0]!==' ').slice(0,30).forEach(p=>lines.push(p[0]+' '+p[1]))});
  const blob=new Blob(['﻿'+lines.join('\n')],{type:'text/plain'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='compare_report.txt';document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);
  toast('Report download ho gayi')}

 /* ================= PHASE 13: Advanced export & compression (§19) ================= */
 /* PDF/A nahi dete — pdf-lib se PDF/A profile ki guarantee nahi hoti, isliye wada nahi.
    Quality: Original = sab PNG (bada, behtareen); High/Balanced/Compressed = photos JPEG,
    raster pages ka JPEG quality bhi kam hota hai. Signature PNG hi rehta hai (transparency). */
 const fmtSize=b=>b>=1048576?(b/1048576).toFixed(1)+' MB':Math.round(b/1024)+' KB';
 async function imageJpg(F,o,q){
  const im=o._img||await loadImg(o.dataUrl);if(!im)return null;o._img=im;
  const sc=st.exOpts.preset==='compressed'?1:2;
  const cv=document.createElement('canvas');cv.width=Math.max(2,Math.ceil(o.w*sc));cv.height=Math.max(2,Math.ceil(o.h*sc));
  const x=cv.getContext('2d');x.scale(sc,sc);x.fillStyle='#fff';x.fillRect(0,0,o.w,o.h);
  try{x.filter='brightness('+(o.br||100)+'%) contrast('+(o.ct||100)+'%) saturate('+(o.sat||100)+'%) grayscale('+(o.gray||0)+'%)'}catch(e){}
  x.translate(o.w/2,o.h/2);x.rotate((o.rot||0)*Math.PI/180);x.scale(o.flipH?-1:1,o.flipV?-1:1);
  x.drawImage(im,-o.w/2,-o.h/2,o.w,o.h);
  const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',q));if(!blob)return null;
  return F.embedJpg(new Uint8Array(await blob.arrayBuffer()))}
 function exportSheet(){
  const e=st.exOpts;
  sheet('<div class="pde-inf"><b>Export PDF</b><p>'+st.pages.length+' pages · Original PDF safe hai — export alag file banta hai.</p></div>'+
  '<label class="pde-fld">Quality<select id="pde-exq"><option value="original">Original (behtareen, bada size)</option><option value="high">High</option><option value="balanced">Balanced</option><option value="compressed">Compressed (chhota size)</option></select></label>'+
  '<label class="pde-fld">Raster pages ki DPI (redaction / blank / no-bytes pages)<select id="pde-exd"><option value="72">72 DPI (halka)</option><option value="150">150 DPI</option><option value="300">300 DPI (bada)</option></select></label>'+
  '<label class="pde-fld" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="pde-exc" style="width:auto"'+(e.comments?' checked':'')+'> Comments / annotations export karo (notes, highlight, underline, strike)</label>'+
  '<label class="pde-fld" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="pde-exb" style="width:auto"'+(e.bg?' checked':'')+'> Background images export karo</label>'+
  '<label class="pde-fld" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="pde-exf" style="width:auto"'+(st.flattenForm?' checked':'')+'> Flatten karke export karo (form fields plain text ban jayenge)</label>'+
  '<p class="pde-mu">PDF/A isme nahi hai — pdf-lib se PDF/A ki guarantee nahi hoti. Export ke baad asli size toast me dikhega.</p>'+
  '<button class="pde-btn" data-a="ex-go">Export PDF karo</button>'+
  '<div class="pde-row"><button class="pde-btn" data-a="ex-search">Searchable PDF</button><button class="pde-btn" data-a="ex-ext">Chune hue pages</button></div>'+
  '<div class="pde-row"><button class="pde-btn" data-a="ex-png">Is page ko PNG</button><button class="pde-btn" data-a="ex-jpg">Is page ko JPG</button></div>');
  const q1=q('#pde-exq');if(q1){q1.value=e.preset;q1.addEventListener('change',()=>{e.preset=q1.value;markDirty(true)})}
  const q2=q('#pde-exd');if(q2){q2.value=String(e.dpi);q2.addEventListener('change',()=>{e.dpi=+q2.value;markDirty(true)})}
  const q3=q('#pde-exc');if(q3)q3.addEventListener('change',()=>{e.comments=q3.checked;markDirty(true)});
  const q4=q('#pde-exb');if(q4)q4.addEventListener('change',()=>{e.bg=q4.checked;markDirty(true)});
  const q5=q('#pde-exf');if(q5)q5.addEventListener('change',()=>{st.flattenForm=q5.checked;markDirty(true)})}
 async function renderPageImage(fmt){
  setBusy(1);setProg(0.2,'Page bana raha hoon…');
  try{
   const pi=st.page,pgd=st.pages[pi],sc=(st.exOpts.dpi||150)/72;
   const p=await getPdfPage(pi);
   let cv;
   if(!p){cv=document.createElement('canvas');cv.width=Math.round(595*sc);cv.height=Math.round(842*sc);const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height)}
   else{const vp=p.getViewport({scale:sc,rotation:pgd.rot||0});cv=document.createElement('canvas');cv.width=Math.max(1,Math.ceil(vp.width));cv.height=Math.max(1,Math.ceil(vp.height));
    const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);await p.render({canvasContext:x,viewport:vp}).promise}
   const x=cv.getContext('2d');x.save();x.scale(sc,sc);
   for(const o of flatObjs(pgd.objs)){if(!o.hidden&&o.kind!=='redact')drawObj(x,o)}
   x.restore();
   const blob=await new Promise(r=>fmt==='jpg'?cv.toBlob(r,'image/jpeg',0.9):cv.toBlob(r,'image/png'));
   if(!blob)throw new Error('Image nahi bani');
   const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(ctx.name||'PDF').replace(/\.pdf$/i,'')+'_p'+(pi+1)+'.'+fmt;document.body.appendChild(a);a.click();
   setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);
   toast('Page '+fmt.toUpperCase()+' ban gaya · '+fmtSize(blob.size))}
  catch(e){toast('Image nahi bani: '+(e&&e.message||e))}
  finally{setBusy(0)}}

 /* ================= PHASE 14: AI editing assistant (§22) ================= */
 /* Server AI: main app ka apna server (window.srFetch + window.SR()).
    Endpoints: /v1/ai/summarize, /v1/ai/ask, /v1/ai/translate — sirf TEXT bheja jata hai,
    PDF file nahi. Server set nahi hai to sirf LOCAL suggestions milte hain — koi
    external AI service connect nahi hai, aur koi API key/endpoint invent nahi karte.
    Har suggestion sirf preview hai — user ki haan ke bina kuch nahi badalta. */
 function aiServerOk(){try{return typeof window.srFetch==='function'&&window.SR&&!!(window.SR().u&&window.SR().t)}catch(e){return false}}
 function aiServerHost(){try{return (window.SR().u||'').replace(/^https?:\/\//,'')}catch(e){return ''}}
 async function aiServerPost(path,obj){
  if(!aiServerOk())throw new Error('Server set nahi hai — main app me Server settings kholo aur URL + token daalo');
  if(!confirm('Ye text aapke server ('+aiServerHost()+') ko bheja jayega. Sirf text jayega, PDF file nahi. Aage badhein?'))throw new Error('Radd kar diya');
  const r=await window.srFetch(path,{method:'POST',body:new Blob([JSON.stringify(obj)],{type:'application/json'})},240000);
  let j;try{j=await r.json()}catch(e){throw new Error('Server ka jawab samajh nahi aaya')}
  const s=j.text||j.result||j.answer||j.summary||j.translation||'';if(!s)throw new Error('Server ne khali jawab diya');return s}
 async function docTextAll(){
  if(st.aiTxt)return st.aiTxt;
  const out=[];
  for(let pi=0;pi<st.pages.length;pi++){const pgd=st.pages[pi];
   if(pgd.src<0&&!pgd.ext){out.push({pi:pi,text:''});continue}
   let p=null;try{p=await getPdfPage(pi)}catch(e){}
   if(!p){out.push({pi:pi,text:''});continue}
   let tc;try{tc=await p.getTextContent()}catch(e){out.push({pi:pi,text:''});continue}
   out.push({pi:pi,text:tc.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('').replace(/[ \t]+/g,' ').trim()})}
  st.aiTxt=out;return out}
 function docTextFlat(pages){return (pages||[]).map(p=>p.text).join('\n').trim()}
 function wordCount(t){return t?t.split(/\s+/).filter(Boolean).length:0}
 function localSummary(pages,n){
  const text=docTextFlat(pages);if(!text)return[];
  const sents=text.split(/(?<=[.!?।])\s+/).map(s=>s.trim()).filter(s=>s.length>20);
  if(!sents.length)return[];
  const freq={};text.toLowerCase().split(/[^a-zA-Z\u0900-\u097F]+/).filter(w=>w.length>3).forEach(w=>{freq[w]=(freq[w]||0)+1});
  const scored=sents.map((s,i)=>({s:s,sc:s.toLowerCase().split(/[^a-zA-Z\u0900-\u097F]+/).reduce((a,w)=>a+(freq[w]||0),0)/Math.max(1,s.split(/\s+/).length),i:i}));
  scored.sort((a,b)=>b.sc-a.sc);return scored.slice(0,n||5).sort((a,b)=>a.i-b.i).map(x=>x.s)}
 async function headingDetect(){
  const heads=[];
  for(let pi=0;pi<st.pages.length;pi++){const pgd=st.pages[pi];if(pgd.src<0&&!pgd.ext)continue;
   let p=null;try{p=await getPdfPage(pi)}catch(e){}if(!p)continue;
   let tc;try{tc=await p.getTextContent()}catch(e){continue}
   const items=tc.items.filter(x=>x.str&&x.str.trim()).map(x=>({t:x.str.trim(),sz:Math.abs((x.transform||[0,0,0,0])[3])||0}));
   if(!items.length)continue;
   const maxSz=Math.max.apply(null,items.map(x=>x.sz));
   items.filter(x=>x.sz>=maxSz*0.85&&x.t.length>1&&x.t.length<120).slice(0,4).forEach(x=>heads.push({pi:pi,t:x.t,sz:Math.round(x.sz)}))}
  return heads}
 function formatChecks(){
  const out=[];
  st.pages.forEach((p,pi)=>{
   const objs=flatObjs(p.objs);
   objs.forEach(o=>{
    if((o.kind==='text'||o.kind==='ovr')&&o.size<8)out.push({pi:pi,t:'Chhota text ('+o.size+'pt): "'+String(o.txt||'').slice(0,30)+'"',fix:'size',id:o.id});
    if((o.kind==='text'||o.kind==='ovr')&&o.color){const m=/^#?([0-9a-f]{6})$/i.exec(o.color);
     if(m){const n=parseInt(m[1],16),r=(n>>16)&255,g=(n>>8)&255,b=n&255,lum=(0.299*r+0.587*g+0.114*b)/255;
      if(lum>0.85)out.push({pi:pi,t:'Halka rang — safed page par mushkil se dikhega: "'+String(o.txt||'').slice(0,30)+'"',fix:null,id:o.id})}}});
   for(let i=0;i<objs.length;i++)for(let j=i+1;j<objs.length;j++){const a=objBox(objs[i]),b=objBox(objs[j]);
    if(a.w&&b.w&&a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h)out.push({pi:pi,t:'Do objects ek ke upar ek hain: '+kindName(objs[i].kind)+' / '+kindName(objs[j].kind),fix:null,id:objs[i].id})}
  });
  return out}
 async function tableSuggest(){
  const out=[];
  for(let pi=0;pi<st.pages.length;pi++){const pgd=st.pages[pi];if(pgd.src<0&&!pgd.ext)continue;
   let p=null;try{p=await getPdfPage(pi)}catch(e){}if(!p)continue;
   let tc;try{tc=await p.getTextContent()}catch(e){continue}
   const rows={};
   tc.items.forEach(x=>{if(!x.str||!x.str.trim())return;const tr=x.transform||[0,0,0,0,0,0];const y=Math.round(tr[5]/6);(rows[y]=rows[y]||[]).push({x:tr[4],t:x.str.trim()})});
   let gridRows=0;Object.keys(rows).forEach(k=>{if(rows[k].length>=3)gridRows++});
   if(gridRows>=3)out.push({pi:pi,t:gridRows+' rows me 3+ columns jaisi layout hai — table ho sakta hai (suggestion hi hai, table nahi banaya)'})}
  return out}
 function aiShow(html){st.aiRes=html;const box=q('#pde-aires');if(box){box.style.display='block';box.innerHTML=html}}
 function aiSheet(){
  const srv=aiServerOk();
  let h='<div class="pde-inf"><b>AI Assistant</b><p>'+(srv?('Server AI: aapka server connected hai ('+esc(aiServerHost())+'). Text sirf aapki haan ke baad bheja jayega.'):('Local suggestions — koi external AI service connected nahi hai. Server AI ke liye main app me Server settings kholo.'))+'</p></div>';
  h+='<h3 style="margin:12px 0 2px">Local (phone par hi)</h3>'+
  '<div class="pde-row"><button class="pde-btn" data-a="ai-count">Ginati</button><button class="pde-btn" data-a="ai-sum">Saransh (local)</button></div>'+
  '<div class="pde-row"><button class="pde-btn" data-a="ai-head">Headings</button><button class="pde-btn" data-a="ai-spell">Spelling check</button></div>'+
  '<div class="pde-row"><button class="pde-btn" data-a="ai-fmt">Formatting check</button><button class="pde-btn" data-a="ai-tbl">Table suggestion</button></div>'+
  '<div class="pde-row"><button class="pde-btn" data-a="ai-title">Title suggest karo</button><button class="pde-btn" data-a="ai-explain">Selected paragraph</button></div>';
  if(srv){
   h+='<h3 style="margin:14px 0 2px">Server AI (aapka server)</h3>'+
   '<div class="pde-row"><label class="pde-fld">Style<select id="pde-ais"><option value="short">Chhota (5-6 line)</option><option value="points">Mukhya points</option><option value="detailed">Detail me</option></select></label>'+
   '<label class="pde-fld">Bhasha<select id="pde-ail"><option value="hi">Hindi</option><option value="en">English</option><option value="hinglish">Hinglish</option></select></label></div>'+
   '<button class="pde-btn" data-a="ai-srv-sum">Server se saransh banao</button>'+
   '<label class="pde-fld">Sawal<input id="pde-aiq" type="text" placeholder="jaise: last date kya hai?"></label>'+
   '<button class="pde-btn" data-a="ai-srv-ask">Server se poochho</button>'+
   '<label class="pde-fld">Anuvaad<select id="pde-ait"><option value="hi">Hindi</option><option value="en">English</option></select></label>'+
   '<button class="pde-btn" data-a="ai-srv-tr">Server se anuvaad karo</button>'}
  h+='<div id="pde-aires" class="pde-ai-res" style="display:'+(st.aiRes?'block':'none')+'">'+(st.aiRes||'')+'</div>';
  h+='<p class="pde-mu">Koi bhi suggestion khud nahi lagta — preview dekho, phir "Lagao" dabao. AI galti kar sakta hai; zaroori baat original se milakar dekho.</p>';
  sheet(h)}
 async function aiRun(kind){
  setBusy(1);
  try{
   if(kind==='count'){
    const pages=await docTextAll(),t=docTextFlat(pages);
    const empty=pages.filter(p=>!p.text).map(p=>p.pi+1);
    aiShow('<b>Ginati</b><br>Pages: '+st.pages.length+' · Shabd: '+wordCount(t)+' · Akshar: '+t.length+'<br>'+(empty.length?'Khali / bina text wale pages: '+empty.join(', '):'Har page me text hai.'))}
   else if(kind==='sum'){
    const pages=await docTextAll(),s=localSummary(pages,5);
    aiShow(s.length?('<b>Local saransh (sabse zaroori lines, phone par banaya)</b><br>• '+s.map(esc).join('<br>• ')):'Is PDF me saransh banane layak text nahi mila (scan ho to pehle OCR karo).')}
   else if(kind==='head'){
    const heads=await headingDetect();
    aiShow(heads.length?('<b>Structure — bade akshar wale headings</b><br>'+heads.map(x=>'Page '+(x.pi+1)+' · '+x.sz+'pt — '+esc(x.t)).join('<br>')):'Koi heading nahi mili.')}
   else if(kind==='spell'){
    const objs=[];st.pages.forEach((p,pi)=>flatObjs(p.objs).forEach(o=>{if((o.kind==='text'||o.kind==='ovr')&&o.txt)objs.push({pi:pi,o:o})}));
    if(!objs.length){aiShow('Editor me koi text object nahi hai — spelling check ke liye pehle text likho.');return}
    aiShow('<b>Spelling check</b><br>Browser ka spellcheck laal underline se galat shabd dikhata hai — khud check karke sahi karo. Ye poora grammar engine nahi hai.<br>'+
     objs.map((x,i)=>'<label class="pde-fld">Page '+(x.pi+1)+'<textarea data-ai-sp="'+i+'" rows="2" spellcheck="true" lang="hi">'+esc(x.o.txt)+'</textarea></label>').join('')+
     '<button class="pde-btn" data-a="ai-spell-apply">Sahi kiya hua text lagao</button>');
    st.aiSpellObjs=objs}
   else if(kind==='fmt'){
    const pages=await docTextAll(),checks=formatChecks();
    pages.forEach(p=>{if(!p.text&&!st.pages[p.pi].objs.length)checks.push({pi:p.pi,t:'Khali page — na text hai, na editor object',fix:null,id:null})});
    aiShow(checks.length?('<b>Formatting suggestions</b><br>'+checks.map((c,i)=>'Page '+(c.pi+1)+' — '+esc(c.t)+(c.fix==='size'?' <button class="pde-btn" data-a="ai-fix" data-i="'+i+'">10pt karo</button>':'')).join('<br>')):'Koi formatting dikkat nahi mili.');
    st.aiFmtChecks=checks}
   else if(kind==='tbl'){
    const out=await tableSuggest();
    aiShow(out.length?('<b>Table suggestions</b><br>'+out.map(x=>'Page '+(x.pi+1)+' — '+esc(x.t)).join('<br>')):'Kisi page me table jaisi layout nahi mili.')}
   else if(kind==='title'){
    const heads=await headingDetect();
    let t=heads.length?heads[0].t:null;
    if(!t){const o0=flatObjs(st.pages[0].objs).filter(o=>(o.kind==='text'||o.kind==='ovr')&&o.txt);if(o0.length){o0.sort((a,b)=>(b.size||0)-(a.size||0));t=o0[0].txt}}
    if(!t){aiShow('Title suggest karne layak bada text page 1 par nahi mila.');return}
    st.aiTitle=t;
    aiShow('<b>Suggested title</b><br>'+esc(t)+'<br><button class="pde-btn" data-a="ai-title-apply">Ye title lagao (Metadata)</button>')}
   else if(kind==='explain'){
    const o=st.sel?findObj(st.sel):null;
    if(o&&(o.kind==='text'||o.kind==='ovr')){
     aiShow('<b>Selected paragraph</b><br>Page '+(st.page+1)+' · Position ('+Math.round(o.x)+', '+Math.round(o.y)+') · '+wordCount(o.txt)+' shabd · '+(o.txt||'').length+' akshar<br><br>'+esc(o.txt||''))}
    else if(st.findHi){aiShow('<b>Selected paragraph</b><br>Page '+(st.findHi.page+1)+' par dhoondha hua match — wahan jao aur text padho. Koi text object select nahi hai.')}
    else aiShow('Pehle koi text object select karo (us par tap karo), phir "Selected paragraph" dabao.')}
  }catch(e){aiShow('Nahi hua: '+esc(e.message||e))}
  finally{setBusy(0)}}
 async function aiServerRun(kind){
  setBusy(1);
  try{
   const pages=await docTextAll();let t=docTextFlat(pages);
   if(!t||t.length<50){aiShow('Is PDF me text nahi mila (scan hai). Pehle "Searchable PDF" banao, phir yahan lao.');return}
   if(t.length>150000){t=t.slice(0,150000);toast('Text 150k akshar tak hi bheja gaya')}
   if(kind==='sum'){
    const style=((q('#pde-ais')||{}).value||'short'),lang=((q('#pde-ail')||{}).value||'hi');
    aiShow('Server saransh bana raha hai…');
    const s=await aiServerPost('/v1/ai/summarize',{text:t,lang:lang,style:style});
    st.aiLast=s;aiShow('<b>Server saransh</b><br>'+esc(s)+'<br><button class="pde-btn" data-a="ai-dl">.txt download karo</button>')}
   else if(kind==='ask'){
    const qq=((q('#pde-aiq')||{}).value||'').trim();if(!qq){aiShow('Pehle sawal likho.');return}
    const lang=((q('#pde-ail')||{}).value||'hi');
    aiShow('Server soch raha hai…');
    const s=await aiServerPost('/v1/ai/ask',{text:t,question:qq,lang:lang});
    st.aiLast=s;aiShow('<b>Sawal:</b> '+esc(qq)+'<br><b>Jawab:</b><br>'+esc(s)+'<br><button class="pde-btn" data-a="ai-dl">.txt download karo</button>')}
   else if(kind==='tr'){
    const to=((q('#pde-ait')||{}).value||'hi');
    aiShow('Server anuvaad kar raha hai…');
    const chunks=[];let c='';
    t.split(/\n{1,}/).forEach(p=>{if((c+'\n'+p).length>6000&&c){chunks.push(c);c=''}if(p.length>6000){for(let i=0;i<p.length;i+=6000)chunks.push(p.slice(i,i+6000))}else c+=(c?'\n':'')+p});
    if(c)chunks.push(c);
    const out=[];
    for(let i=0;i<chunks.length;i++){aiShow('Server anuvaad kar raha hai… '+(i+1)+' / '+chunks.length);out.push(await aiServerPost('/v1/ai/translate',{text:chunks[i],to:to}))}
    st.aiLast=out.join('\n\n');aiShow('<b>Anuvaad ('+esc(to)+')</b><br>'+esc(st.aiLast)+'<br><button class="pde-btn" data-a="ai-dl">.txt download karo</button>')}
  }catch(e){aiShow('Nahi hua: '+esc(e.message||e))}
  finally{setBusy(0)}}

 /* ----- Page operations ----- */
 function pageOp(fn){pushHist();fn();syncTotal();markDirty(true);ensureWC();st.sel=null;renderProps()}
 function pgAddBlank(){pageOp(()=>{st.pages.splice(st.page+1,0,{src:-1,rot:0,objs:[]})});show(st.page+1,0);pagesSheet()}
 function pgDup(){pageOp(()=>{const c=JSON.parse(JSON.stringify(st.pages[st.page]));const reId=x=>{x.id=newId();if(x.kind==='group')(x.children||[]).forEach(reId)};c.objs.forEach(reId);st.pages.splice(st.page+1,0,c);reloadImgs(c)});show(st.page+1,0);pagesSheet()}
 function pgDel(){if(st.pages.length<=1){toast('Kam se kam ek page rehna chahiye');return}pageOp(()=>{st.pages.splice(st.page,1)});show(Math.min(st.page,st.pages.length-1),0);pagesSheet()}
 function pgRot(){pageOp(()=>{const p=curPg();p.rot=((p.rot||0)+90)%360});show(st.page,0);pagesSheet()}
 function pgMove(d){const i=st.page,j=i+d;if(j<0||j>=st.pages.length)return;pageOp(()=>{const t=st.pages[i];st.pages[i]=st.pages[j];st.pages[j]=t});show(j,1);pagesSheet()}
 pgIn.addEventListener('change',async()=>{const f=pgIn.files[0];pgIn.value='';if(!f)return;
  try{if(!window.pdfjsLib){if(host&&host.PJ)await host.PJ()}if(!window.pdfjsLib)throw new Error('pdf.js nahi mili');
   const bytes=new Uint8Array(await f.arrayBuffer());
   const doc=await window.pdfjsLib.getDocument({data:bytes.slice()}).promise;
   pushHist();const id=newId();st.extDocs[id]={doc:doc,bytes:bytes,name:f.name};
   for(let i=0;i<doc.numPages;i++)st.pages.push({src:-1,ext:{id:id,idx:i},rot:0,objs:[]});
   syncTotal();markDirty(true);ensureWC();toast(doc.numPages+' pages jud gaye');pagesSheet()}
  catch(e){toast('PDF nahi judi: '+(e&&e.message||e))}});
 imgIn.addEventListener('change',async()=>{const f=imgIn.files[0];imgIn.value='';if(!f)return;
  try{const du=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(f)});
   const im=await loadImg(du);
   if(st.replacing&&st.sel){const o=findObj(st.sel);
    if(o&&o.kind==='image'){pushHist();o.dataUrl=du;o.mime=f.type;o._img=im;o.w=200;o.h=Math.round(200*im.naturalHeight/im.naturalWidth);markDirty(true);ensureWC();drawOv();renderProps();toast('Image badal gayi');return}}
   pushHist();const w=200,h=Math.round(200*im.naturalHeight/im.naturalWidth);
   const o={id:newId(),kind:'image',x:Math.max(0,(st.pw-w)/2),y:Math.max(0,(st.ph-h)/2),w:w,h:h,dataUrl:du,mime:f.type,rot:0,flipH:false,flipV:false,opacity:1,br:100,ct:100,sat:100,gray:0,_img:im};
   curObjs().push(o);markDirty(true);ensureWC();selectObj(o.id);toast('Image aa gayi — drag karke ghumao')}
  catch(e){toast('Image nahi khuli: '+(e&&e.message||e))}});
 /* ----- Find & overlay replace (Phase 2, §14) ----- */
 async function findRun(qq){qq=(qq||'').trim();if(!qq){toast('Pehle shabd likho');return}
  st.find={q:qq,matches:[],idx:-1};const fs=q('#pde-fs');if(fs)fs.textContent='Dhoondh raha hoon…';
  const low=qq.toLowerCase();
  for(let pi=0;pi<st.pages.length&&st.find.matches.length<200;pi++){
   const pgd=st.pages[pi];if(pgd.src<0&&!pgd.ext)continue;
   let p=null;try{p=await getPdfPage(pi)}catch(e){continue}if(!p)continue;
   let tc;try{tc=await p.getTextContent()}catch(e){continue}
   const v0=p.getViewport({scale:1}),W0=v0.width,H0=v0.height;
   for(const it of tc.items){if(!it.str)continue;const s=it.str;let from=0;
    while(true){const ix=s.toLowerCase().indexOf(low,from);if(ix<0)break;from=ix+low.length;
     const tr=it.transform||[1,0,0,1,0,0],fs2=Math.abs(tr[3])||12;
     const fullW=it.width||s.length*fs2*0.5,frac=ix/Math.max(1,s.length),wdt=fullW*(low.length/Math.max(1,s.length));
     const ux=tr[4]+frac*fullW,uy=H0-tr[5]-fs2,dp=rotPt(ux,uy,pgd.rot||0,W0,H0);
     st.find.matches.push({page:pi,x:dp[0],y:dp[1],w:Math.max(4,wdt),h:fs2})}}}
  const n=st.find.matches.length;if(fs)fs.textContent=n?n+' mile':'Nahi mila';
  if(n)findGo(1);else toast('Nahi mila')}
 async function findGo(d){const F=st.find;if(!F||!F.matches.length){toast('Pehle dhoondho');return}
  F.idx=(F.idx+d+F.matches.length)%F.matches.length;const m=F.matches[F.idx];st.findHi=m;
  await show(m.page,1);drawOv();const fs=q('#pde-fs');if(fs)fs.textContent=(F.idx+1)+' / '+F.matches.length+' · Page '+(m.page+1)}
 function findReplace(){const F=st.find;if(!F||!F.matches.length){toast('Pehle dhoondho');return}
  const rep=((q('#pde-fr')||{}).value||'').trim();if(!rep){toast('Naya text likho');return}
  const m=F.matches[F.idx<0?0:F.idx];pushHist();
  const o={id:newId(),kind:'ovr',x:m.x,y:m.y,w:Math.max(30,m.w+4),h:m.h+4,txt:rep,size:Math.max(8,Math.round(m.h)),color:'#111111',opacity:1};
  st.pages[m.page].objs.push(o);F.matches.splice(F.idx,1);F.idx--;st.findHi=null;
  markDirty(true);ensureWC();show(m.page,1);toast('Overlay lag gaya — purana text dhaka hai, original nahi badla')}
 /* ----- Properties panel ----- */
 function renderProps(){const o=st.sel?findObj(st.sel):null;
  if(!o){props.innerHTML='';return}
  const num=(lb,key,v,mn,mx)=>'<label class="pde-fld">'+lb+'<input type="number" data-p="'+key+'" value="'+v+'"'+(mn!=null?' min="'+mn+'"':'')+(mx!=null?' max="'+mx+'"':'')+' step="1"></label>';
  let h='<div class="pde-inf"><b>'+esc(kindName(o.kind))+'</b></div>';
  h+='<label class="pde-fld">Naam<input type="text" data-p="name" value="'+esc(o.name||'')+'" placeholder="'+esc(dispName(o,0))+'"></label>';
  h+='<div class="pde-row"><label class="pde-fld" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-p="hidden" style="width:auto"'+(o.hidden?' checked':'')+'> Chhupao</label>'+
   '<label class="pde-fld" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-p="locked" style="width:auto"'+(o.locked?' checked':'')+'> Lock</label></div>';
  if(o.locked)h+='<p class="pde-mu">Locked hai — pehle unlock karo, tabhi badal sakte ho.</p>';
  if(o.kind==='group'){h+='<p class="pde-mu">'+(o.children||[]).length+' objects — saath me move hote hain.</p>'+
   '<button class="pde-btn" data-a="ly-ungroup">Group kholo</button>';
   h+='<div class="pde-row"><button class="pde-btn" data-a="pp-dup">Copy</button><button class="pde-btn" data-a="pp-del" style="color:#ff6b6b">Hatao</button></div>';
   props.innerHTML=h;return}
  if(o.kind==='sig'){h+='<p class="pde-mu">Ye sirf tasveer wala signature hai, digital certificate wala nahi.</p>';
   h+='<div class="pde-row">'+num('Rotate','rot',o.rot||0,-180,180)+'</div>'}
  if(o.kind==='stamp'){h+='<label class="pde-fld">Stamp text<input type="text" data-p="text" value="'+esc(o.text||'')+'"></label>';
   h+='<div class="pde-row"><label class="pde-fld">Rang<input type="color" data-p="color" value="'+(o.color||'#c62828')+'"></label>'+num('Rotate','rot',o.rot||0,-180,180)+'</div>'}
  if(o.kind==='field'){h+='<p class="pde-mu">Asli AcroForm field — export par form field banta hai. Naam hi field ka naam hai.</p>';
   h+='<p class="pde-mu">Type: '+esc(FIELD_DEFS[o.ftype]?FIELD_DEFS[o.ftype][0]:o.ftype)+(o.ftype==='sig'?' (type karke sign — digital certificate nahi)':'')+'</p>';
   if(o.ftype==='check')h+='<label class="pde-fld" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-p="value" style="width:auto"'+(o.value?' checked':'')+'> Checked</label>';
   else if(o.ftype==='radio'||o.ftype==='drop'){h+='<label class="pde-fld">Options (comma se alag)<textarea data-p="options" rows="2">'+esc((o.options||[]).join(', '))+'</textarea></label>';
    h+='<label class="pde-fld">Chuna hua<input type="text" data-p="value" value="'+esc(o.value||'')+'"></label>'}
   else h+='<label class="pde-fld">Default value<input type="text" data-p="value" value="'+esc(o.value||'')+'"></label>';
   h+='<label class="pde-fld">Placeholder<input type="text" data-p="placeholder" value="'+esc(o.placeholder||'')+'"></label>';
   h+='<div class="pde-row"><label class="pde-fld" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-p="required" style="width:auto"'+(o.required?' checked':'')+'> Required</label>'+
    '<label class="pde-fld" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-p="readonly" style="width:auto"'+(o.readonly?' checked':'')+'> Read-only</label></div>';
   h+='<div class="pde-row">'+num('Char limit','maxLen',o.maxLen||0,0,1000)+num('Font size','fontSize',o.fontSize||12,6,48)+'</div>'}
  if(o.kind==='redact'){h+='<label class="pde-fld">Reason<input type="text" data-p="reason" value="'+esc(o.reason||'')+'"></label>';
   h+='<p class="pde-mu">State: '+(o.state==='confirmed'?'Confirmed ✓ — export me page rasterise hokar saaf hoga':'Marked — abhi confirm nahi hua, export me nahi lagega')+'</p>';
   h+='<button class="pde-btn" data-a="rd-confirm" data-pg="'+st.page+'" data-id="'+o.id+'">'+(o.state==='confirmed'?'Confirm hatao':'Confirm karo')+'</button>'}
  if(o.kind==='text'||o.kind==='ovr'){
   if(o.kind==='ovr')h+='<p class="pde-mu">Overlay — purana text dhaka hai, original nahi badla.</p>';
   h+='<label class="pde-fld">Text<textarea data-p="txt" rows="3">'+esc(o.txt||'')+'</textarea></label>';
   h+='<div class="pde-row">'+num('Size','size',o.size,8,120)+'<label class="pde-fld">Rang<input type="color" data-p="color" value="'+(o.color||'#111111')+'"></label></div>';
   h+='<div class="pde-row"><button class="pde-btn'+(o.bold?' on':'')+'" data-a="pp-b">B</button><button class="pde-btn'+(o.italic?' on':'')+'" data-a="pp-i">I</button>'+
   '<select data-p="align" class="pde-btn"><option value="left"'+(o.align==='left'?' selected':'')+'>Left</option><option value="center"'+(o.align==='center'?' selected':'')+'>Center</option><option value="right"'+(o.align==='right'?' selected':'')+'>Right</option></select></div>'}
  if(o.kind==='image'){
   h+='<div class="pde-row">'+num('Rotate','rot',o.rot||0,-180,180)+'<label class="pde-fld">Opacity<input type="range" data-p="opacity" min="0.1" max="1" step="0.05" value="'+(o.opacity==null?1:o.opacity)+'"></label></div>';
   h+='<div class="pde-row"><button class="pde-btn" data-a="pp-fh">Flip ↔</button><button class="pde-btn" data-a="pp-fv">Flip ↕</button></div>';
   h+='<label class="pde-fld">Brightness <input type="range" data-p="br" min="0" max="200" value="'+(o.br||100)+'"></label>';
   h+='<label class="pde-fld">Contrast <input type="range" data-p="ct" min="0" max="200" value="'+(o.ct||100)+'"></label>';
   h+='<label class="pde-fld">Saturation <input type="range" data-p="sat" min="0" max="200" value="'+(o.sat||100)+'"></label>';
   h+='<label class="pde-fld">Grayscale <input type="range" data-p="gray" min="0" max="100" value="'+(o.gray||0)+'"></label>';
   h+='<label class="pde-fld" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-p="bg" style="width:auto"'+(o.bg?' checked':'')+'> Ye background image hai (Export me "Backgrounds" band karne par nahi aayegi)</label>';
   h+='<button class="pde-btn" data-a="pp-rep">Image badlo</button>'}
  if(o.kind==='shape'){
   h+='<div class="pde-row"><label class="pde-fld">Fill<input type="color" data-p="fill" value="'+(o.fill||'#4c9aff')+'"></label><label class="pde-fld">Border<input type="color" data-p="stroke" value="'+(o.stroke||'#111111')+'"></label></div>';
   h+=num('Border motai','lw',o.lw||2,0,20)}
  if(o.kind==='note'){h+='<label class="pde-fld">Note<textarea data-p="txt" rows="3">'+esc(o.txt||'')+'</textarea></label>'+
   '<label class="pde-fld" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-p="resolved" style="width:auto"'+(o.resolved?' checked':'')+'> Resolved</label>'}
  if(o.kind==='hl'||o.kind==='ul'||o.kind==='strike'){h+='<label class="pde-fld">Rang<input type="color" data-p="color" value="'+(o.color||'#ffeb3b')+'"></label>'}
  h+='<div class="pde-row">'+num('X','x',Math.round(o.x))+num('Y','y',Math.round(o.y))+'</div>';
  h+='<div class="pde-row">'+num('W','w',Math.round(o.w),1)+num('H','h',Math.round(o.h),1)+'</div>';
  h+='<label class="pde-fld">Opacity<input type="range" data-p="opacity" min="0.1" max="1" step="0.05" value="'+(o.opacity==null?1:o.opacity)+'"></label>';
  h+='<div class="pde-row"><button class="pde-btn" data-a="pp-front">Aage lao</button><button class="pde-btn" data-a="pp-back">Peeche bhejo</button></div>';
  h+='<div class="pde-row"><button class="pde-btn" data-a="pp-dup">Copy</button><button class="pde-btn" data-a="pp-del" style="color:#ff6b6b">Hatao</button></div>';
  props.innerHTML=h}
 props.addEventListener('input',ev=>{const el=ev.target.closest('[data-p]');if(!el)return;
  const o=st.sel?findObj(st.sel):null;if(!o)return;
  if(o.locked&&el.dataset.p!=='locked'){renderProps();return}
  pushHistOnce();
  const k=el.dataset.p;let v=el.type==='checkbox'?el.checked:(el.type==='number'||el.type==='range')?+el.value:el.value;
  if(k==='options')v=String(v).split(/[,\n]+/).map(s=>s.trim()).filter(Boolean);
  o[k]=v;
  if(k==='txt'&&o.kind==='text')o.h=Math.max(20,wrapLines(o.txt,o.w,o.size,o.bold,o.italic).length*o.size*1.25);
  markDirty(true);ensureWC();drawOv()});
 props.addEventListener('change',()=>{st.propHist=false});
 /* ================= PHASE 15: Performance, recovery & final testing (§23, §18) ================= */
 /* Auto-save: badlav ke 30 second baad (debounce) + page badalne par. Chupchaap save hota hai,
    subtitle me "Auto-saved HH:MM" dikhta hai. Crash recovery: draft manual save se naya ho to
    khulte hi poochta hai (maybeRestoreDraft). Low-memory mode: DPR 1, canvas budget 3M px,
    history 20 snapshots. Rendering cancellation pehle se hai. */
 function scheduleAutoSave(){if(!st.autoSave)return;clearTimeout(st.autoTimer);st.autoTimer=setTimeout(()=>{autoSaveDraft()},30000)}
 async function autoSaveDraft(){
  if(!st.dirty||!window.indexedDB)return;
  try{const d=await draftDb(),key=(ctx.name||'PDF')+'|'+(ctx.size||0);
   let lastManual=0;try{const old=await req(d.transaction('drafts').objectStore('drafts').get(key));if(old&&old.lastManual)lastManual=old.lastManual}catch(e){}
   const pages=JSON.parse(JSON.stringify(st.pages,(k,v)=>k==='_img'?undefined:v));
   const t=d.transaction('drafts','readwrite');t.objectStore('drafts').put({key:key,name:ctx.name,size:ctx.size,pages:pages,ts:Date.now(),auto:true,lastManual:lastManual});await done(t);d.close();
   st.autoSavedAt=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});sub()}
  catch(e){}}
 function settingsSheet(){
  sheet('<div class="pde-inf"><b>Settings</b></div>'+
  '<label class="pde-fld" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="pde-set-low" style="width:auto"'+(st.lowMem?' checked':'')+'> Low-memory mode (kam RAM phone ke liye — render halka, history 20 tak)</label>'+
  '<label class="pde-fld" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="pde-set-auto" style="width:auto"'+(st.autoSave?' checked':'')+'> Auto-save draft (badlav ke 30 second baad)</label>'+
  '<p class="pde-mu">Theme: More menu se Dark/Light badlo. Grid / rulers / snap is editor me nahi hain — wo sirf planning me likhe the.</p>'+
  '<button class="pde-btn" data-a="dg">Diagnostics & Phase checklist kholo</button>');
  const lo=q('#pde-set-low');if(lo)lo.addEventListener('change',()=>{st.lowMem=lo.checked;try{localStorage.setItem('pdeLowMem',lo.checked?'1':'0')}catch(e){}toast(lo.checked?'Low-memory mode ON — agle page se halka render':'Low-memory mode OFF')});
  const au=q('#pde-set-auto');if(au)au.addEventListener('change',()=>{st.autoSave=au.checked;try{localStorage.setItem('pdeAutoSave',au.checked?'1':'0')}catch(e){}if(!au.checked)clearTimeout(st.autoTimer);toast(au.checked?'Auto-save ON':'Auto-save OFF')})}
 const PHASE_LIST=[['0','Neev (loader, probe, working copy)','ho gaya'],['1','Khali workspace (Edit button, page, zoom/pan)','ho gaya'],['2','Text studio (add/edit, find, overlay replace)','ho gaya'],['3','Image studio (insert, rotate, flip, filters)','ho gaya — crop nahi'],['4','Shapes & drawing','ho gaya'],['5','Annotation (highlight, note, comments)','ho gaya — replies/stamps nahi'],['6','Page manager (blank/duplicate/rotate/reorder, extract)','ho gaya — split/merge/labels nahi'],['7','Layers & object manager','ho gaya'],['8','Signature & stamp studio','ho gaya — digital certificate nahi'],['9','OCR (Tesseract, English + Hindi)','ho gaya — Gujarati nahi'],['10','Forms (asli AcroForm, flatten)','ho gaya'],['11','Redaction & security (asli redaction, metadata)','ho gaya — password nahi (pdf-lib)'],['12','Document comparison','ho gaya — pixel diff andaza hai'],['13','Advanced export & compression','ho gaya — PDF/A nahi'],['14','AI assistant (local + aapka server)','ho gaya — koi external AI invent nahi'],['15','Performance, recovery & final testing','ho gaya — neeche checklist']];
 const TEST_ITEMS=['Text + image export tested','Signature + form export tested','Redaction export tested','OCR tested'];
 async function diagSheet(){
  sheet('<div class="pde-inf"><b>Diagnostics</b><p>Jaankari load ho rahi hai…</p></div>');
  let probeHtml='<p class="pde-mu">Probe nahi chala.</p>',draftHtml='<p class="pde-mu">Draft status nahi mila.</p>';
  try{const R=await probe(host||{});probeHtml=R.tests.map(t=>'<div class="pde-pgr"><span>'+esc(t.name)+' — '+(t.ok?'✓':'✗')+' '+esc(t.note||'')+'</span></div>').join('')}catch(e){probeHtml='<p class="pde-mu">Probe nahi chala: '+esc(e.message||e)+'</p>'}
  try{if(window.indexedDB){const d=await draftDb(),key=(ctx.name||'PDF')+'|'+(ctx.size||0);
   const rec=await req(d.transaction('drafts').objectStore('drafts').get(key));d.close();
   draftHtml=rec?('<p class="pde-mu">Draft hai: '+(rec.auto?'auto-saved':'manual')+' · '+new Date(rec.ts).toLocaleString()+'</p>'):('<p class="pde-mu">Is PDF ka koi draft nahi hai.</p>')}else draftHtml='<p class="pde-mu">IndexedDB nahi hai — draft save nahi hota.</p>'}catch(e){draftHtml='<p class="pde-mu">Draft status nahi mila.</p>'}
  const e=env();
  sheet('<div class="pde-inf"><b>Diagnostics</b><p>Version '+VERSION+' · Device memory: '+(e.deviceMemoryGB||'?')+' GB · Cores: '+(e.cores||'?')+' · IndexedDB: '+(e.idb?'hai':'nahi')+' · Touch: '+(e.touch?'haan':'nahi')+'</p></div>'+
  '<h3 style="margin:12px 0 2px">Library probe</h3>'+probeHtml+
  '<h3 style="margin:12px 0 2px">Draft</h3>'+draftHtml+
  '<h3 style="margin:12px 0 2px">Phase checklist (0–15)</h3>'+PHASE_LIST.map(p=>'<div class="pde-pgr"><span><b>Phase '+p[0]+'</b> — '+esc(p[1])+'</span><span style="flex:none">'+esc(p[2])+'</span></div>').join('')+
  '<h3 style="margin:12px 0 2px">Final testing checklist</h3>'+TEST_ITEMS.map((t,i)=>'<label class="pde-chk"><input type="checkbox" data-tst="'+i+'"'+(st.testList.indexOf(i)>=0?' checked':'')+'><span>'+esc(t)+'</span></label>').join('')+
  '<p class="pde-mu">Checklist is phone par save hoti hai.</p>');
  shb.querySelectorAll('[data-tst]').forEach(cb=>cb.addEventListener('change',()=>{const i=+cb.dataset.tst;
   if(cb.checked&&st.testList.indexOf(i)<0)st.testList.push(i);if(!cb.checked)st.testList=st.testList.filter(x=>x!==i);
   try{localStorage.setItem('pdeTestList',JSON.stringify(st.testList))}catch(e){}}))}

 /* ----- Drafts (naya DB 'pdfed_drafts', pdfed_v1 ko chhuta nahi) ----- */
 function draftDb(){return new Promise((ok,no)=>{const r=indexedDB.open('pdfed_drafts',1);
  r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('drafts'))r.result.createObjectStore('drafts',{keyPath:'key'})};
  r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
 async function saveDraft(){if(!window.indexedDB){toast('Draft save nahi hoga (IndexedDB nahi)');return}
  try{const d=await draftDb(),key=(ctx.name||'PDF')+'|'+(ctx.size||0);
   const pages=JSON.parse(JSON.stringify(st.pages,(k,v)=>k==='_img'?undefined:v));
   const t=d.transaction('drafts','readwrite');t.objectStore('drafts').put({key:key,name:ctx.name,size:ctx.size,pages:pages,ts:Date.now(),auto:false,lastManual:Date.now()});await done(t);d.close();
   markDirty(false);toast('Draft save ho gaya')}catch(e){toast('Draft nahi bacha: '+(e&&e.message||e))}}
 async function maybeRestoreDraft(){if(!window.indexedDB)return;
  try{const d=await draftDb(),key=(ctx.name||'PDF')+'|'+(ctx.size||0);
   const rec=await req(d.transaction('drafts').objectStore('drafts').get(key));d.close();if(!rec)return;
   const hasExt=rec.pages.some(p=>p.ext);
   const hasEdits=rec.pages.some(p=>(p.objs&&p.objs.length)||p.rot||p.src<0)||rec.pages.length!==ctx.total;
   if(!hasEdits)return;
   const autoNew=rec.auto&&rec.lastManual&&rec.ts>rec.lastManual;
   if(!confirm('Is PDF ka '+(rec.auto?'auto-saved draft':'purana draft')+' mila hai ('+new Date(rec.ts).toLocaleString()+')'+(autoNew?' — manual save se naya hai.':'')+' Wapas layein?'))return;
   let skipped=0;
   rec.pages.forEach(p=>{const keep=list=>list.filter(o=>{if(KNOWN_KINDS.indexOf(o.kind)<0){skipped++;return false}if(o.kind==='group')o.children=keep(o.children||[]);return true});p.objs=keep(p.objs||[])});
   if(skipped)toast(skipped+' purane object skip kiye gaye (pehchane nahi gaye)');
   st.pages=rec.pages.filter(p=>!p.ext);if(hasExt)toast('Draft se bahar wali PDF ke pages nahi laaye gaye');
   st.pages.forEach(reloadImgs);syncTotal();st.sel=null;pushHist();markDirty(true)}
  catch(e){}}
 /* ----- Export PDF (pdf-lib; Hindi text canvas PNG se, drawText kabhi nahi) ----- */
 async function textPng(F,o){
  const lines=wrapLines(o.txt||'',o.w||200,o.size||14,o.bold,o.italic),sc=2,lh=(o.size||14)*1.25;
  const cv=document.createElement('canvas');cv.width=Math.max(2,Math.ceil((o.w||200)*sc));cv.height=Math.max(2,Math.ceil(lines.length*lh*sc));
  const x=cv.getContext('2d');x.scale(sc,sc);x.font=(o.italic?'italic ':'')+(o.bold?'bold ':'')+(o.size||14)+'px sans-serif';
  x.fillStyle=o.color||'#111';x.textBaseline='alphabetic';
  lines.forEach((ln,i)=>{let lx=0;if(o.align==='center')lx=((o.w||200)-x.measureText(ln).width)/2;else if(o.align==='right')lx=(o.w||200)-x.measureText(ln).width;
   x.fillText(ln,lx,(i+1)*lh-(lh-(o.size||14))*0.5)});
  const blob=await new Promise(r=>cv.toBlob(r,'image/png'));if(!blob)return null;
  return F.embedPng(new Uint8Array(await blob.arrayBuffer()))}
 async function imagePng(F,o){
  const im=o._img||await loadImg(o.dataUrl);if(!im)return null;o._img=im;
  const sc=2,cv=document.createElement('canvas');cv.width=Math.max(2,Math.ceil(o.w*sc));cv.height=Math.max(2,Math.ceil(o.h*sc));
  const x=cv.getContext('2d');x.scale(sc,sc);
  try{x.filter='brightness('+(o.br||100)+'%) contrast('+(o.ct||100)+'%) saturate('+(o.sat||100)+'%) grayscale('+(o.gray||0)+'%)'}catch(e){}
  x.translate(o.w/2,o.h/2);x.rotate((o.rot||0)*Math.PI/180);x.scale(o.flipH?-1:1,o.flipV?-1:1);
  x.drawImage(im,-o.w/2,-o.h/2,o.w,o.h);
  const blob=await new Promise(r=>cv.toBlob(r,'image/png'));if(!blob)return null;
  return F.embedPng(new Uint8Array(await blob.arrayBuffer()))}
 async function drawObjsPdf(F,pg,pgd,W,H,rotOv){
  const rot=rotOv!=null?rotOv:(pgd.rot||0);
  const hex=h=>{const m=/^#?([0-9a-f]{6})$/i.exec(h||'#000000');if(!m)return F.rgb(0,0,0);const n=parseInt(m[1],16);return F.rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255)};
  for(const o of flatObjs(pgd.objs)){
   if(o.hidden)continue;
   if(!st.exOpts.comments&&(o.kind==='note'||o.kind==='hl'||o.kind==='ul'||o.kind==='strike'))continue;
   if(!st.exOpts.bg&&o.bg)continue;
   const op=o.opacity==null?1:o.opacity;
   if(o.kind==='text'||o.kind==='ovr'){
    if(o.kind==='ovr'){const r=rectPdf(o,rot,W,H);pg.drawRectangle({x:r.x,y:r.y,width:r.w,height:r.h,color:F.rgb(1,1,1)})}
    const im=await textPng(F,o);if(!im)continue;
    const pos=imgPos(o.x,o.y,o.w,o.h,rot,W,H);
    pg.drawImage(im,{x:pos.x,y:pos.y,width:o.w,height:o.h,rotate:F.degrees(rot),opacity:op})}
   else if(o.kind==='image'){
    const im=st.exOpts.preset==='original'?await imagePng(F,o):await imageJpg(F,o,st.exOpts.preset==='high'?0.92:st.exOpts.preset==='balanced'?0.8:0.6);if(!im)continue;
    const pos=imgPos(o.x,o.y,o.w,o.h,rot,W,H);
    pg.drawImage(im,{x:pos.x,y:pos.y,width:o.w,height:o.h,rotate:F.degrees(rot),opacity:op})}
   else if(o.kind==='shape'){
    if(o.shape==='ellipse'){const r=rectPdf(o,rot,W,H);
     pg.drawEllipse({x:r.x+r.w/2,y:r.y+r.h/2,xScale:r.w/2,yScale:r.h/2,color:o.fill?hex(o.fill):undefined,borderColor:o.stroke?hex(o.stroke):undefined,borderWidth:o.lw||1,opacity:op})}
    else if(o.shape==='line'||o.shape==='arrow'){
     const a=pdfPt(o.x0,o.y0,rot,W,H),b=pdfPt(o.x1,o.y1,rot,W,H),col=hex(o.stroke||o.fill||'#000');
     pg.drawLine({start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]},thickness:o.lw||2,color:col,opacity:op});
     if(o.shape==='arrow'){const ang=Math.atan2(b[1]-a[1],b[0]-a[0]),L=10;
      for(const s of [0.4,-0.4]){const e2={x:b[0]+L*Math.cos(ang+Math.PI+s),y:b[1]+L*Math.sin(ang+Math.PI+s)};
       pg.drawLine({start:{x:b[0],y:b[1]},end:e2,thickness:o.lw||2,color:col,opacity:op})}}}
    else{const r=rectPdf(o,rot,W,H);
     pg.drawRectangle({x:r.x,y:r.y,width:r.w,height:r.h,borderRadius:o.shape==='rrect'?10:0,color:o.fill?hex(o.fill):undefined,borderColor:o.stroke?hex(o.stroke):undefined,borderWidth:o.lw||1,opacity:op})}}
   else if(o.kind==='draw'){
    const col=hex(o.color||'#000');
    for(let i=1;i<o.pts.length;i++){const a=pdfPt(o.pts[i-1][0],o.pts[i-1][1],rot,W,H),b=pdfPt(o.pts[i][0],o.pts[i][1],rot,W,H);
     pg.drawLine({start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]},thickness:o.lw||2,color:col,opacity:o.hl?0.4:op})}}
   else if(o.kind==='hl'){const r=rectPdf(o,rot,W,H);pg.drawRectangle({x:r.x,y:r.y,width:r.w,height:r.h,color:hex(o.color||'#ffeb3b'),opacity:0.35})}
   else if(o.kind==='ul'||o.kind==='strike'){const r=rectPdf(o,rot,W,H),y=o.kind==='ul'?r.y+1:r.y+r.h/2;
    pg.drawLine({start:{x:r.x,y:y},end:{x:r.x+r.w,y:y},thickness:2,color:hex(o.color||'#e11'),opacity:op})}
   else if(o.kind==='note'){const r=rectPdf(o,rot,W,H);
    pg.drawRectangle({x:r.x,y:r.y,width:Math.max(r.w,18),height:Math.max(r.h,18),color:F.rgb(1,0.84,0.29)});
    if(o.txt){const im=await textPng(F,{txt:o.txt,size:10,color:'#111111',bold:false,italic:false,align:'left',w:150,h:40,opacity:1});
     if(im){const pos=imgPos(o.x+o.w+4,o.y,150,40,rot,W,H);pg.drawImage(im,{x:pos.x,y:pos.y,width:150,height:40,rotate:F.degrees(rot)})}}}
   else if(o.kind==='sig'){const im=await imagePng(F,o);if(im){const pos=imgPos(o.x,o.y,o.w,o.h,rot,W,H);
    pg.drawImage(im,{x:pos.x,y:pos.y,width:o.w,height:o.h,rotate:F.degrees(rot),opacity:op})}}
   else if(o.kind==='stamp'){const im=await stampPng(F,o);if(im){const pos=imgPos(o.x,o.y,o.w,o.h,rot,W,H);
    pg.drawImage(im,{x:pos.x,y:pos.y,width:o.w,height:o.h,rotate:F.degrees(rot),opacity:op})}}
   else if(o.kind==='field'){
    if(st.flattenForm){
     if(o.ftype==='check'){const r=rectPdf(o,rot,W,H);
      pg.drawRectangle({x:r.x,y:r.y,width:r.w,height:r.h,borderColor:hex('#111111'),borderWidth:1});
      if(o.value){const im=await textPng(F,{txt:'✓',size:14,color:'#111111',bold:true,italic:false,align:'left',w:20,h:20,opacity:1});
       if(im){const pos=imgPos(o.x+2,o.y+2,16,16,rot,W,H);pg.drawImage(im,{x:pos.x,y:pos.y,width:16,height:16,rotate:F.degrees(rot)})}}}
     else if(o.ftype==='radio'){const r=rectPdf(o,rot,W,H);const opts=o.options||[];
      const eachH=Math.max(16,r.h/Math.max(1,opts.length));
      for(let i=0;i<opts.length;i++){const cy=r.y+r.h-eachH*(i+1);
       pg.drawEllipse({x:r.x+8,y:cy+eachH/2,xScale:6,yScale:6,borderColor:hex('#111111'),borderWidth:1});
       if(o.value===opts[i])pg.drawEllipse({x:r.x+8,y:cy+eachH/2,xScale:3,yScale:3,color:hex('#111111')});
       const im=await textPng(F,{txt:String(opts[i]),size:11,color:'#111111',bold:false,italic:false,align:'left',w:r.w-20,h:14,opacity:1});
       if(im)pg.drawImage(im,{x:r.x+18,y:cy+2,width:r.w-20,height:14})}}
     else if(o.value!=null&&o.value!==''){const im=await textPng(F,{txt:String(o.value),size:o.fontSize||12,color:'#111111',bold:false,italic:false,align:'left',w:o.w,h:o.h,opacity:1});
      if(im){const pos=imgPos(o.x,o.y,o.w,o.h,rot,W,H);pg.drawImage(im,{x:pos.x,y:pos.y,width:o.w,height:o.h,rotate:F.degrees(rot)})}}}
    /* warna asli AcroForm field — addFormFields banata hai */}
   else if(o.kind==='redact'){/* export me nahi: confirmed page rasterise hota hai, marked sirf preview hai */}
   else if(o.kind==='group'){/* flatObjs se children alag se aate hain */}}}
 async function stampPng(F,o){
  const sc=2,cv=document.createElement('canvas');cv.width=Math.max(2,Math.ceil(o.w*sc));cv.height=Math.max(2,Math.ceil(o.h*sc));
  const x=cv.getContext('2d');x.scale(sc,sc);x.translate(o.w/2,o.h/2);x.rotate((o.rot||0)*Math.PI/180);
  x.strokeStyle=o.color||'#c62828';x.lineWidth=3;x.fillStyle=o.color||'#c62828';
  x.strokeRect(-o.w/2+2,-o.h/2+2,o.w-4,o.h-4);
  x.font='bold '+Math.max(10,Math.round(o.h*0.42))+'px sans-serif';x.textAlign='center';x.textBaseline='middle';
  x.fillText((o.text||'STAMP').toUpperCase(),0,0);
  const blob=await new Promise(r=>cv.toBlob(r,'image/png'));if(!blob)return null;
  return F.embedPng(new Uint8Array(await blob.arrayBuffer()))}
 /* Ek page banao: blank / copy / raster (no-bytes ya confirmed redaction).
    Confirmed redaction par page 150 DPI rasterise hota hai aur redaction jagah kaala rang diya jata hai —
    neeche ka text/image sach me nikal jata hai. Returns {pg,W,H,rot} (rot = objects ke liye page rotation). */
 async function buildPage(F,out,pi,bytes,src,getExtDoc,dpi){
  const pgd=st.pages[pi];
  if(pgd.src<0&&!pgd.ext){const pg=out.addPage([595,842]);return{pg:pg,W:595,H:842,rot:0}}
  const confirmed=(pgd.objs||[]).filter(o=>o.kind==='redact'&&o.state==='confirmed');
  if(!bytes||confirmed.length){
   const p=await getPdfPage(pi);if(!p){const pg=out.addPage([595,842]);return{pg:pg,W:595,H:842,rot:0}}
   const v=p.getViewport({scale:1,rotation:pgd.rot||0}),sc=(dpi||st.exOpts.dpi||150)/72,vp=p.getViewport({scale:sc,rotation:pgd.rot||0});
   const cv=document.createElement('canvas');cv.width=Math.max(1,Math.ceil(vp.width));cv.height=Math.max(1,Math.ceil(vp.height));
   const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);
   await p.render({canvasContext:x,viewport:vp}).promise;
   if(confirmed.length){x.fillStyle='#000';confirmed.forEach(o=>{x.fillRect(o.x*sc,o.y*sc,o.w*sc,o.h*sc)})}
   const jq=st.exOpts.preset==='original'?0.92:st.exOpts.preset==='high'?0.9:st.exOpts.preset==='balanced'?0.8:0.65;
   const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',jq));
   const im=await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
   const pg=out.addPage([v.width,v.height]);pg.drawImage(im,{x:0,y:0,width:v.width,height:v.height});
   return{pg:pg,W:v.width,H:v.height,rot:0}}
  let d=src,idx=pgd.src;if(pgd.ext){d=await getExtDoc(pgd.ext.id);idx=pgd.ext.idx}
  const cp=await out.copyPages(d,[idx]);const pg=cp[0];out.addPage(pg);if(pgd.rot)pg.setRotation(F.degrees(pgd.rot));
  const v0=await pgDims(pi);return{pg:pg,W:v0[0],H:v0[1],rot:pgd.rot||0}}
 /* Asli AcroForm fields (pdf-lib PDFForm). Har field try/catch me — ek field fail ho to export rukega nahi. */
 function addFormFields(F,pg,pgd,W,H,rot,form){
  form._pdeRadio=form._pdeRadio||{};
  flatObjs(pgd.objs).forEach(o=>{
   if(o.kind!=='field'||o.hidden)return;
   try{
    const r=rectPdf(o,rot,W,H);
    const nm=String(o.name||'field').replace(/[^\w.-]/g,'_');
    const hex2=h=>{const m=/^#?([0-9a-f]{6})$/i.exec(h||'#000000');if(!m)return F.rgb(0,0,0);const n=parseInt(m[1],16);return F.rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255)};
    void hex2;
    if(o.ftype==='text'||o.ftype==='multi'||o.ftype==='date'||o.ftype==='sig'){
     const f=form.createTextField(nm);f.addToPage(pg,[r.x,r.y,r.w,r.h]);
     if(o.ftype==='multi'&&f.enableMultiline)f.enableMultiline();
     if(o.value)f.setText(String(o.value));
     if(o.maxLen&&f.setMaxLength)f.setMaxLength(o.maxLen);
     if(o.required&&f.enableRequired)f.enableRequired();
     if(o.readonly&&f.enableReadOnly)f.enableReadOnly();
    }else if(o.ftype==='check'){
     const f=form.createCheckBox(nm);f.addToPage(pg,[r.x,r.y,r.w,r.h]);
     if(o.value)f.check();else f.uncheck();
     if(o.required&&f.enableRequired)f.enableRequired();
    }else if(o.ftype==='drop'){
     const f=form.createDropdown(nm);f.addToPage(pg,[r.x,r.y,r.w,r.h]);
     const opts=(o.options&&o.options.length?o.options:['Option 1']).map(String);f.setOptions(opts);
     if(o.value&&opts.indexOf(String(o.value))>=0)f.select(String(o.value));
     if(o.required&&f.enableRequired)f.enableRequired();
    }else if(o.ftype==='radio'){
     let grp=form._pdeRadio[nm];if(!grp){grp=form.createRadioGroup(nm);form._pdeRadio[nm]=grp}
     const opts=(o.options&&o.options.length?o.options:['Option 1']).map(String);
     const eachH=Math.max(16,r.h/Math.max(1,opts.length));
     opts.forEach((op,i)=>{grp.addOptionToPage(op,pg,{x:r.x,y:r.y+r.h-eachH*(i+1),width:Math.min(16,eachH),height:Math.min(16,eachH)})});
     if(o.value&&opts.indexOf(String(o.value))>=0)grp.select(String(o.value));
    }
   }catch(e){/* field skip */}
  })}
 function applyMeta(out){try{
  if(st.meta.title)out.setTitle(st.meta.title);
  if(st.meta.author)out.setAuthor(st.meta.author);
  if(st.meta.subject)out.setSubject(st.meta.subject);
  if(st.meta.keywords)out.setKeywords(st.meta.keywords.split(',').map(s=>s.trim()).filter(Boolean))}catch(e){}}
 async function exportPdf(){
  if(!host||!host.PL){toast('pdf-lib nahi mili');return}
  setBusy(1);
  try{
   await host.PL();const F=window.PDFLib;if(!F)throw new Error('PDFLib nahi mili');
   let bytes=null;
   if(st.wc)bytes=await st.wc.getBytes();
   else if(ctx.file)bytes=new Uint8Array(await ctx.file.arrayBuffer());
   const out=await F.PDFDocument.create(),extCache={};
   const getExtDoc=async id=>{if(!extCache[id])extCache[id]=await F.PDFDocument.load(st.extDocs[id].bytes.slice(),{ignoreEncryption:true});return extCache[id]};
   const src=bytes?await F.PDFDocument.load(bytes.slice(),{ignoreEncryption:true}):null;
   const hasFields=!st.flattenForm&&st.pages.some(p=>flatObjs(p.objs).some(o=>o.kind==='field'));
   const form=hasFields?out.getForm():null;
   for(let pi=0;pi<st.pages.length;pi++){setProg((pi+1)/st.pages.length,'Export: page '+(pi+1)+' / '+st.pages.length);const b=await buildPage(F,out,pi,bytes,src,getExtDoc);
    await drawObjsPdf(F,b.pg,st.pages[pi],b.W,b.H,b.rot);
    if(form)addFormFields(F,b.pg,st.pages[pi],b.W,b.H,b.rot,form)}
   if(form){try{const fnt=await out.embedFont(F.StandardFonts.Helvetica);form.updateFieldAppearances(fnt)}catch(e){}}
   applyMeta(out);
   const saved=await out.save();
   const chk=await F.PDFDocument.load(saved);if(chk.getPageCount()!==st.pages.length)throw new Error('Export check fail: pages '+chk.getPageCount()+' / '+st.pages.length);
   const name=(ctx.name||'PDF').replace(/\.pdf$/i,'')+'_edited.pdf';
   const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([saved],{type:'application/pdf'}));a.download=name;document.body.appendChild(a);a.click();
   setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);
   toast('Export ho gaya: '+name+' · '+fmtSize(saved.length))}
  catch(e){toast('Export nahi hua: '+(e&&e.message||e))}
  finally{setBusy(0)}}
 async function pgExtract(){const sel=Array.from(st.selPages).sort((a,b)=>a-b);if(!sel.length){toast('Pehle page chuno (checkbox)');return}
  setBusy(1);
  try{
   if(!host||!host.PL)throw new Error('pdf-lib nahi mili');
   await host.PL();const F=window.PDFLib;if(!F)throw new Error('PDFLib nahi mili');
   let bytes=null;if(st.wc)bytes=await st.wc.getBytes();else if(ctx.file)bytes=new Uint8Array(await ctx.file.arrayBuffer());
   const out=await F.PDFDocument.create(),extCache={};
   const getExtDoc=async id=>{if(!extCache[id])extCache[id]=await F.PDFDocument.load(st.extDocs[id].bytes.slice(),{ignoreEncryption:true});return extCache[id]};
   const src=bytes?await F.PDFDocument.load(bytes.slice(),{ignoreEncryption:true}):null;
   const hasFields=!st.flattenForm&&sel.some(pi=>flatObjs(st.pages[pi].objs).some(o=>o.kind==='field'));
   const form=hasFields?out.getForm():null;
   for(const pi of sel){const b=await buildPage(F,out,pi,bytes,src,getExtDoc);
    await drawObjsPdf(F,b.pg,st.pages[pi],b.W,b.H,b.rot);
    if(form)addFormFields(F,b.pg,st.pages[pi],b.W,b.H,b.rot,form)}
   if(form){try{const fnt=await out.embedFont(F.StandardFonts.Helvetica);form.updateFieldAppearances(fnt)}catch(e){}}
   applyMeta(out);
   const saved=await out.save();
   const chk=await F.PDFDocument.load(saved);if(chk.getPageCount()!==sel.length)throw new Error('Extract check fail');
   const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([saved],{type:'application/pdf'}));a.download=(ctx.name||'PDF').replace(/\.pdf$/i,'')+'_pages.pdf';document.body.appendChild(a);a.click();
   setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);
   toast(sel.length+' pages nikaal liye')}
  catch(e){toast('Extract nahi hua: '+(e&&e.message||e))}
  finally{setBusy(0)}}

 /* ----- More menu / bottom sheet ----- */
 function sheet(h){shb.innerHTML=h;sh.hidden=false;requestAnimationFrame(()=>sh.classList.add('on'))}
 function sheetX(){sh.classList.remove('on');setTimeout(()=>{if(!sh.classList.contains('on'))sh.hidden=true},180)}
 function moreMenu(){
  const dk=root.dataset.th=='dark';
  sheet('<button class="pde-btn pde-mi" data-a="th">'+IC.theme+'<span>Theme: '+(dk?'Dark (Light karo)':'Light (Dark karo)')+'</span></button>'+
   '<button class="pde-btn pde-mi" data-a="fi">'+IC.info+'<span>File info</span></button>'+
   '<button class="pde-btn pde-mi" data-a="mt">📝<span>Metadata (Title / Author / Subject / Keywords)</span></button>'+
   '<button class="pde-btn pde-mi" data-a="sec">🔒<span>Security (password / permissions)</span></button>'+
   '<button class="pde-btn pde-mi" data-a="set">⚙️<span>Settings (Low-memory / Auto-save)</span></button>'+
   '<button class="pde-btn pde-mi" data-a="dg">📊<span>Diagnostics & Phase checklist</span></button>')}
 function fileInfo(){
  const mb=ctx.size?(ctx.size/MB).toFixed(ctx.size>=10*MB?0:1)+' MB':'-';
  sheet('<div class="pde-inf"><b>'+esc(ctx.name||'PDF')+'</b><p>'+ctx.total+' pages · '+mb+'</p><p>Original PDF safe hai. Abhi kuch badla nahi.</p></div>')}

 /* ----- Back (unsaved par poochna) ----- */
 const MSG='Kuch badlav save nahi hue. Phir bhi Viewer par wapas jayein?';
 function onPop(){if(S!==st)return;
  if(st.dirty&&!confirm(MSG)){try{history.pushState({pde:1},'');st.pushed=true}catch(e){}return}
  st.pushed=false;end()}
 function back(){if(st.pushed){try{history.back();return}catch(e){}}
  if(st.dirty&&!confirm(MSG))return;end()}
 function end(){
  if(S!==st)return;S=null;clearTimeout(st.rtm);clearTimeout(st.autoTimer);cancelAnimationFrame(st.raf);st.tk++;st.rt++;
  if(st.task){try{st.task.cancel()}catch(e){}}
  if(st.ownDoc){try{st.ownDoc.destroy()}catch(e){}}st.ownDoc=null;st.ownDocP=null;
  window.removeEventListener('popstate',onPop);window.removeEventListener('keydown',onKey,true);window.removeEventListener('resize',onResize);
  if(window.visualViewport)visualViewport.removeEventListener('resize',onResize);
  document.documentElement.style.overflow=prevOv;root.remove();st.pgObj=null}
 try{history.pushState({pde:1},'');st.pushed=true}catch(e){st.pushed=false}
 window.addEventListener('popstate',onPop);

 /* ----- Buttons ----- */
 root.addEventListener('click',ev=>{const b=ev.target.closest('[data-a]');if(!b||b.disabled)return;const a=b.dataset.a;
  if(a=='back')back();else if(a=='prev')show(st.page-1,1);else if(a=='next')show(st.page+1,1);
  else if(a=='zi')zoomBy(1.25);else if(a=='zo')zoomBy(1/1.25);else if(a=='fw')fitNow();
  else if(a=='un')doUndo();else if(a=='re')doRedo();else if(a=='sv')saveDraft();else if(a=='ex')exportSheet();
  else if(a=='tb'){st.defT.bold=!st.defT.bold;b.classList.toggle('on',st.defT.bold)}
  else if(a=='ti'){st.defT.italic=!st.defT.italic;b.classList.toggle('on',st.defT.italic)}
  else if(a=='fnd')findRun((q('#pde-fq')||{}).value||'');
  else if(a=='fnp')findGo(-1);else if(a=='fnn')findGo(1);else if(a=='frp')findReplace();
  else if(a=='im-add'){st.replacing=false;imgIn.click()}
  else if(a.indexOf('sh-')===0){st.subtool=a==='sh-pencil'?'draw':a.slice(3);toast('Page par drag karo')}
  else if(a==='an-hl'||a==='an-ul'||a==='an-strike'){st.subtool=a.slice(3);toast('Page par drag karo')}
  else if(a==='an-note'){st.subtool='note';toast('Note ke liye page par tap karo')}
  else if(a==='cmts')commentsSheet();
  else if(a==='cm-go'){const pi=+b.dataset.pg;show(pi,1);const o=st.pages[pi]&&st.pages[pi].objs.find(x=>x.id===b.dataset.id);if(o)selectObj(o.id);sheetX()}
  else if(a==='cm-ed'){const pi=+b.dataset.pg,o=st.pages[pi]&&st.pages[pi].objs.find(x=>x.id===b.dataset.id);if(o){const t=prompt('Note badlo:',o.txt);if(t!=null){pushHist();o.txt=t;markDirty(true);ensureWC();drawOv();commentsSheet()}}}
  else if(a==='cm-res'){const pi=+b.dataset.pg,o=st.pages[pi]&&st.pages[pi].objs.find(x=>x.id===b.dataset.id);if(o){pushHist();o.resolved=!o.resolved;markDirty(true);ensureWC();drawOv();commentsSheet()}}
  else if(a==='cm-del'){const pi=+b.dataset.pg,o=st.pages[pi]&&st.pages[pi].objs.find(x=>x.id===b.dataset.id);if(o){pushHist();st.pages[pi].objs.splice(st.pages[pi].objs.indexOf(o),1);markDirty(true);ensureWC();drawOv();commentsSheet()}}
  else if(a==='pg-add')pgAddBlank();else if(a==='pg-dup')pgDup();else if(a==='pg-del')pgDel();else if(a==='pg-rot')pgRot();
  else if(a==='pg-up')pgMove(-1);else if(a==='pg-dn')pgMove(1);else if(a==='pg-ins')pgIn.click();else if(a==='pg-ext')pgExtract();
  else if(a==='pg-go'){show(+b.dataset.pg,0);sheetX()}
  else if(a==='pp-b'||a==='pp-i'){const o=st.sel?findObj(st.sel):null;if(o){pushHistOnce();if(a==='pp-b')o.bold=!o.bold;else o.italic=!o.italic;markDirty(true);ensureWC();renderProps();drawOv()}}
  else if(a==='pp-fh'||a==='pp-fv'){const o=st.sel?findObj(st.sel):null;if(o&&o.kind==='image'){pushHistOnce();if(a==='pp-fh')o.flipH=!o.flipH;else o.flipV=!o.flipV;markDirty(true);ensureWC();drawOv()}}
  else if(a==='pp-rep'){st.replacing=true;imgIn.click()}
  else if(a==='pp-front'||a==='pp-back'){const o=st.sel?findObj(st.sel):null;if(o){pushHistOnce();const par=parentOf(o.id),arr=par?par.children:curObjs(),i=arr.indexOf(o);arr.splice(i,1);if(a==='pp-front')arr.push(o);else arr.unshift(o);markDirty(true);ensureWC();drawOv()}}
  else if(a==='pp-dup'){const o=st.sel?findObj(st.sel):null;if(o){pushHist();const c=JSON.parse(JSON.stringify(o));const reId=x=>{x.id=newId();if(x.kind==='group')(x.children||[]).forEach(reId);if(x.kind==='shape'&&(x.shape==='line'||x.shape==='arrow')){x.x0+=10;x.y0+=10;x.x1+=10;x.y1+=10}};reId(c);if(c.x!=null)c.x+=10;if(c.y!=null)c.y+=10;if(c.kind==='group')(c.children||[]).forEach(ch=>{if(ch.x!=null)ch.x+=10;if(ch.y!=null)ch.y+=10});const par=parentOf(o.id);(par?par.children:curObjs()).push(c);reloadImgs({objs:[c]});markDirty(true);ensureWC();selectObj(c.id)}}
  else if(a==='pp-del'){const o=st.sel?findObj(st.sel):null;if(o){pushHist();removeObj(o);markDirty(true);ensureWC()}}
  else if(a=='more')moreMenu();else if(a=='sx')sheetX();
  else if(a=='th'){const n=root.dataset.th=='dark'?'light':'dark';root.dataset.th=n;try{localStorage.setItem('pdeTheme',n)}catch(e){}sheetX()}
  else if(a=='fi')fileInfo();
  else if(a=='mt')metaSheet();else if(a=='sec')secSheet();
  else if(a=='mt-save'){st.meta.title=(q('#pde-mt')||{}).value||'';st.meta.author=(q('#pde-ma')||{}).value||'';st.meta.subject=(q('#pde-ms')||{}).value||'';st.meta.keywords=(q('#pde-mk')||{}).value||'';markDirty(true);sheetX();toast('Metadata save ho gaya — Export par lagega')}
  /* --- Phase 7: Layers --- */
  else if(a=='ly-go'){const o=findObj(b.dataset.id);if(o){const pi=st.pages.findIndex(p=>p.objs.indexOf(o)>=0||(p.objs.some(x=>x.kind==='group'&&(x.children||[]).some(c=>c.id===o.id))));if(pi>=0)show(pi,1);selectObj(o.id);sheetX()}}
  else if(a=='ly-eye'||a=='ly-lock'){const o=findObj(b.dataset.id);if(o){pushHist();if(a=='ly-eye')o.hidden=!o.hidden;else o.locked=!o.locked;markDirty(true);ensureWC();drawOv();layersSheet()}}
  else if(a=='ly-group')groupSelected();
  else if(a=='ly-ungroup'){const o=st.sel?findObj(st.sel):null;if(o&&o.kind==='group'){ungroupObj(o);layersSheet()}}
  else if(a=='ly-hide-sel'||a=='ly-lock-sel'||a=='ly-del-sel'){if(!st.layerSel.size){toast('Pehle checkbox se chuno');return}pushHist();
   flatObjs(curObjs()).forEach(o=>{if(st.layerSel.has(o.id)){if(a=='ly-hide-sel')o.hidden=!o.hidden;else if(a=='ly-lock-sel')o.locked=!o.locked}});
   if(a=='ly-del-sel')Array.from(st.layerSel).forEach(id=>{const o=findObj(id);if(o)removeObjDeep(o)});
   st.layerSel.clear();markDirty(true);ensureWC();drawOv();layersSheet()}
  /* --- Phase 8: Signature & stamps --- */
  else if(a=='sg-clear'){const cv=q('#pde-sigpad');if(cv){cv.getContext('2d').clearRect(0,0,cv.width,cv.height);st.pendingSig=null;toast('Saaf ho gaya')}}
  else if(a=='sg-type'){const t=((q('#pde-sgt')||{}).value||'').trim();if(!t){toast('Pehle naam likho');return}
   const f=(q('#pde-sgf')||{}).value||'cursive',cv=document.createElement('canvas');cv.width=600;cv.height=200;const x=cv.getContext('2d');
   x.font='64px '+f;x.fillStyle='#111';x.textBaseline='middle';x.fillText(t,20,100);
   st.pendingSig={dataUrl:cv.toDataURL('image/png'),name:t};toast('Signature ready — "Page par lagao" dabao')}
  else if(a=='sg-save'){if(!st.pendingSig){toast('Pehle signature banao');return}
   st.sigTpls.push({name:st.pendingSig.name||'Signature',dataUrl:st.pendingSig.dataUrl});
   try{localStorage.setItem('pde_sigs',JSON.stringify(st.sigTpls))}catch(e){st.sigTpls.pop();toast('Save nahi hua (storage full)');return}
   signSheet();toast('Template save ho gaya')}
  else if(a=='sg-import')sigIn.click();
  else if(a=='sg-place'){if(!st.pendingSig){toast('Pehle signature banao, type karo ya image lao');return}st.subtool='sig-place';sheetX();toast('Page par tap karo — signature wahan lagega')}
  else if(a=='sg-use'){const t=st.sigTpls[+b.dataset.i];if(t){st.pendingSig={dataUrl:t.dataUrl,name:t.name};toast('Signature ready — "Page par lagao" dabao')}}
  else if(a=='sg-del'){st.sigTpls.splice(+b.dataset.i,1);try{localStorage.setItem('pde_sigs',JSON.stringify(st.sigTpls))}catch(e){}signSheet()}
  else if(a=='st-place'){const s=STAMPS[+b.dataset.i];if(s){st.pendingStamp={text:s[0],color:s[1]};st.subtool='stamp-place';sheetX();toast('Page par tap karo — stamp wahan lagega')}}
  else if(a=='st-custom'){const t=((q('#pde-stc')||{}).value||'').trim();if(!t){toast('Pehle stamp text likho');return}st.pendingStamp={text:t,color:'#c62828'};st.subtool='stamp-place';sheetX();toast('Page par tap karo — stamp wahan lagega')}
  /* --- Phase 9: OCR --- */
  else if(a=='oc-run')ocrPage(st.page);
  else if(a=='oc-save'){const d=st.ocr[st.page];if(d){d.text=((q('#pde-oct2')||{}).value||'');markDirty(true);toast('OCR text save ho gaya')}}
  else if(a=='oc-totext')ocrToTextObjects(st.page);
  else if(a=='oc-searchable')exportSearchable();
  /* --- Phase 10: Forms --- */
  else if(a.indexOf('fm-')===0&&a!=='fm-reset'&&a!=='fm-flatten'){st.subtool='field-'+a.slice(3);sheetX();toast(FIELD_DEFS[a.slice(3)][0]+' — page par tap karo')}
  else if(a=='fm-reset'){pushHist();st.pages.forEach(p=>flatObjs(p.objs).forEach(o=>{if(o.kind==='field')o.value=o.ftype==='check'?false:''}));markDirty(true);ensureWC();drawOv();toast('Form reset ho gaya')}
  /* --- Phase 11: Redaction --- */
  else if(a=='rd-find')redactFind();
  else if(a=='rd-area'){st.subtool='redact';sheetX();toast('Page par drag karo — redaction area banega')}
  else if(a=='rd-go'){const pi=+b.dataset.pg;show(pi,1);const o=st.pages[pi]&&st.pages[pi].objs.find(x=>x.id===b.dataset.id);if(o)selectObj(o.id);sheetX()}
  else if(a=='rd-confirm'){const pi=+b.dataset.pg,o=st.pages[pi]&&st.pages[pi].objs.find(x=>x.id===b.dataset.id);if(o){pushHist();o.state=o.state==='confirmed'?'marked':'confirmed';markDirty(true);ensureWC();drawOv();redactSheet()}}
  else if(a=='rd-confirm-all'){pushHist();let n=0;st.pages.forEach(p=>p.objs.forEach(o=>{if(o.kind==='redact'&&o.state!=='confirmed'){o.state='confirmed';n++}}));markDirty(true);ensureWC();drawOv();redactSheet();toast(n?n+' redactions confirm ho gayi':'Sab pehle se confirm hain')}
  else if(a=='rd-del'){const pi=+b.dataset.pg,o=st.pages[pi]&&st.pages[pi].objs.find(x=>x.id===b.dataset.id);if(o){pushHist();st.pages[pi].objs.splice(st.pages[pi].objs.indexOf(o),1);markDirty(true);ensureWC();drawOv();redactSheet()}}
  /* --- Phase 12: Compare --- */
  else if(a=='cmp-pick')cmpIn.click();
  else if(a=='cmp-run')runCompare();
  else if(a=='cmp-pg')showCmpPage(+b.dataset.i);
  else if(a=='cmp-rep')cmpReport();
  /* --- Phase 13: Advanced export --- */
  else if(a=='ex-go'){sheetX();exportPdf()}
  else if(a=='ex-search'){sheetX();exportSearchable()}
  else if(a=='ex-ext'){sheetX();pgExtract()}
  else if(a=='ex-png'){sheetX();renderPageImage('png')}
  else if(a=='ex-jpg'){sheetX();renderPageImage('jpg')}
  /* --- Phase 14: AI assistant --- */
  else if(a=='ai-count')aiRun('count');else if(a=='ai-sum')aiRun('sum');else if(a=='ai-head')aiRun('head');
  else if(a=='ai-spell')aiRun('spell');else if(a=='ai-fmt')aiRun('fmt');else if(a=='ai-tbl')aiRun('tbl');
  else if(a=='ai-title')aiRun('title');else if(a=='ai-explain')aiRun('explain');
  else if(a=='ai-spell-apply'){const list=st.aiSpellObjs||[];if(!list.length){toast('Pehle spelling check karo');return}
   pushHist();shb.querySelectorAll('[data-ai-sp]').forEach(ta=>{const x=list[+ta.dataset.aiSp];if(x&&x.o){x.o.txt=ta.value;
    if(x.o.kind==='text')x.o.h=Math.max(20,wrapLines(x.o.txt,x.o.w,x.o.size,x.o.bold,x.o.italic).length*x.o.size*1.25)}});
   markDirty(true);ensureWC();drawOv();aiShow('Sahi kiya hua text lag gaya ✓')}
  else if(a=='ai-fix'){const c=(st.aiFmtChecks||[])[+b.dataset.i];if(c&&c.fix==='size'){const o=findObj(c.id);
   if(o){pushHist();o.size=10;o.h=Math.max(20,wrapLines(o.txt,o.w,o.size,o.bold,o.italic).length*o.size*1.25);markDirty(true);ensureWC();drawOv();aiRun('fmt')}}}
  else if(a=='ai-title-apply'){if(st.aiTitle){st.meta.title=st.aiTitle;markDirty(true);aiShow('Title lag gaya: '+esc(st.aiTitle)+' — Export par Metadata me aayega')}}
  else if(a=='ai-srv-sum')aiServerRun('sum');else if(a=='ai-srv-ask')aiServerRun('ask');else if(a=='ai-srv-tr')aiServerRun('tr');
  else if(a=='ai-dl'){if(!st.aiLast){toast('Pehle server se kuch banao');return}
   const blob=new Blob(['﻿'+st.aiLast],{type:'text/plain'});const a2=document.createElement('a');a2.href=URL.createObjectURL(blob);a2.download='ai_output.txt';document.body.appendChild(a2);a2.click();
   setTimeout(()=>{URL.revokeObjectURL(a2.href);a2.remove()},2000);toast('.txt download ho gaya')}
  /* --- Phase 15: Settings & diagnostics --- */
  else if(a=='set')settingsSheet();
  else if(a=='dg')diagSheet();
  });
 pin.addEventListener('keydown',e=>{e.stopPropagation();if(e.key=='Enter'){e.preventDefault();const v=parseInt(pin.value,10);if(v>=1&&v<=st.total)show(v-1,1);else lab();pin.blur()}else if(e.key=='Escape'){pin.value=st.page+1;pin.blur()}});
 pin.addEventListener('focus',()=>pin.select());pin.addEventListener('blur',()=>{pin.value=st.page+1});

 /* ----- Keyboard (viewer ke shortcut ko roko) ----- */
 function onKey(e){
  if(S!==st)return;const tg=e.target;if(tg&&(tg.tagName=='INPUT'||tg.tagName=='TEXTAREA'||tg.isContentEditable))return;
  const k=e.key,ct=e.ctrlKey||e.metaKey;let h=1;
  if(!sh.hidden&&k=='Escape')sheetX();
  else if(k=='Escape')back();
  else if(k=='PageDown')show(st.page+1,1);else if(k=='PageUp')show(st.page-1,1);
  else if(k=='Home'&&ct)show(0,1);else if(k=='End'&&ct)show(st.total-1,1);
  else if(k=='+'||k=='='){zoomBy(1.25)}else if(k=='-'||k=='_'){zoomBy(1/1.25)}else if(k=='0'){fitNow()}
  else if(ct&&(k==='z'||k==='Z')){if(e.shiftKey)doRedo();else doUndo()}
  else if(ct&&(k==='y'||k==='Y'))doRedo();
  else if(ct&&(k==='s'||k==='S'))saveDraft();
  else if((k==='Delete'||k==='Backspace')&&st.sel){const o=findObj(st.sel);if(o){pushHist();removeObj(o);markDirty(true);ensureWC()}}
  else h=0;
  if(h||ct&&(k=='+'||k=='-'||k=='='||k=='0'))e.preventDefault();
  e.stopPropagation()}
 window.addEventListener('keydown',onKey,true);

 /* ----- Pan (ungli ya mouse) + pinch zoom + Ctrl+wheel ----- */
 const P=new Map();let pan=null;
 stage.addEventListener('pointerdown',e=>{
  if(e.pointerType=='mouse'&&e.button!==0)return;
  try{stage.setPointerCapture(e.pointerId)}catch(x){}
  P.set(e.pointerId,{x:e.clientX,y:e.clientY});cancelAnimationFrame(st.raf);
  if(P.size==2){const[a,b]=[...P.values()],cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,r=pg.getBoundingClientRect();
   st.pinch={d0:Math.hypot(a.x-b.x,a.y-b.y)||1,s0:st.scale,u:(cx-r.left)/st.scale,v:(cy-r.top)/st.scale,r:1,cx,cy};pan=null;
   pg.style.transformOrigin=(cx-r.left)+'px '+(cy-r.top)+'px'}
  else if(P.size==1){pan={x:e.clientX,y:e.clientY,l:stage.scrollLeft,t:stage.scrollTop,vx:0,vy:0,lt:performance.now(),lx:e.clientX,ly:e.clientY};stage.classList.add('pan')}});
 stage.addEventListener('pointermove',e=>{
  if(!P.has(e.pointerId))return;P.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(st.pinch&&P.size>=2){const[a,b]=[...P.values()],d=Math.hypot(a.x-b.x,a.y-b.y),[lo,hi]=rng();
   const ns=clamp(st.pinch.s0*d/st.pinch.d0,lo,hi);st.pinch.r=ns/st.pinch.s0;st.pinch.cx=(a.x+b.x)/2;st.pinch.cy=(a.y+b.y)/2;
   pg.style.transform='scale('+(ns/st.scale)+')';return}
  if(pan&&P.size==1){const now=performance.now(),dt=Math.max(1,now-pan.lt);
   stage.scrollLeft=pan.l-(e.clientX-pan.x);stage.scrollTop=pan.t-(e.clientY-pan.y);
   pan.vx=.8*pan.vx+.2*(e.clientX-pan.lx)/dt;pan.vy=.8*pan.vy+.2*(e.clientY-pan.ly)/dt;pan.lt=now;pan.lx=e.clientX;pan.ly=e.clientY}});
 function up(e){
  if(!P.has(e.pointerId))return;P.delete(e.pointerId);
  if(st.pinch){if(P.size<2){const pc=st.pinch;st.pinch=null;pg.style.transform='';pg.style.transformOrigin='';
    const ns=clamp(pc.s0*pc.r,...rng());st.scale=ns;lay();const r2=pg.getBoundingClientRect();stage.scrollLeft+=r2.left+pc.u*ns-pc.cx;stage.scrollTop+=r2.top+pc.v*ns-pc.cy;draw();
    P.clear();pan=null;stage.classList.remove('pan')}return}
  if(pan&&P.size==0){const p=pan;pan=null;stage.classList.remove('pan');
   if(e.pointerType!='mouse'||true){let vx=p.vx,vy=p.vy;if(Math.hypot(vx,vy)>.15){let last=performance.now();
    const f=()=>{if(S!==st)return;const n=performance.now(),dt=n-last;last=n;stage.scrollLeft-=vx*dt;stage.scrollTop-=vy*dt;const dc=Math.pow(.94,dt/16);vx*=dc;vy*=dc;if(Math.hypot(vx,vy)>.03)st.raf=requestAnimationFrame(f)};st.raf=requestAnimationFrame(f)}}}}
 stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',up);
 stage.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();zoomAt(st.scale*Math.exp(-e.deltaY*.0022),e.clientX,e.clientY)}},{passive:false});
 stage.addEventListener('dblclick',e=>{if(e.pointerType=='touch')return;});
 /* Phone par keyboard ya rotate: fit dobara (zoom % jaisa hi rahe) */
 let rz=0;function onResize(){clearTimeout(rz);rz=setTimeout(()=>{if(S!==st)return;const old=st.base||1;st.base=fitW();st.scale=clamp(st.scale*st.base/old,...rng());lay();draw()},150)}
 window.addEventListener('resize',onResize);if(window.visualViewport)visualViewport.addEventListener('resize',onResize);
 pushHist();
 (async()=>{await maybeRestoreDraft();show(st.page,0)})();
 setTimeout(()=>{try{stage.focus({preventScroll:true})}catch(e){}},0);
 return{close:back}}

/* Phase 2 me edit hote hi ye true karega, tab Back par poochega. */
function markDirty(v){if(S){S.dirty=v!==false;const el=document.querySelector('.pde-sub');if(el)el.textContent=S.total+' pages'+(S.dirty?' · unsaved':'')+(S.autoSavedAt?' · Auto-saved '+S.autoSavedAt:'')}}

window.PDFEditor={version:VERSION,env,chooseMode,createCopy,purgeOld,probe,start,markDirty,isOpen:()=>!!S};
})();
