/* ---------- meses ----------
   MONTHS viene de build.py: {10:{data,actuals,budget}, 11:{...}}. Cada mes sale de su Google Sheet. */
const MES_ES=['','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MES_EN=['','january','february','march','april','may','june','july','august','september','october','november','december'];
/* Llaves de MONTHS: 10 y 11 son de 2026; los meses nuevos usan AAAAMM (ej. 202612, 202701). */
const ym = k => k>100 ? {y:Math.floor(k/100), m:k%100} : {y:2026, m:k};
const prevM = m => m===1 ? 12 : m-1;
const MKEYS=Object.keys(MONTHS).map(Number).sort((a,b)=>{const A=ym(a),B=ym(b);return (A.y*100+A.m)-(B.y*100+B.m)});
let DATA, ACTUALS, BUDGET, D, CAMPS, MES, MNUM, MYEAR, MKEY, NDAYS, inMonth, TODAY, NOWMIN;
const DOW = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const DOW3 = ['dom','lun','mar','mié','jue','vie','sáb'];
const LOCS = [['all','Todas'],['sa','San Antonio'],['plano','Plano'],['irving','Irving']];
const LOCNAME = {sa:'San Antonio',plano:'Plano',irving:'Irving'};
const $ = s => document.querySelector(s);
const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dow = d => new Date(Date.UTC(MYEAR,MNUM-1,d)).getUTCDay();
const money = n => '$'+Math.round(n).toLocaleString('en-US');

/* storage (per viewer, may be unavailable) */
const mem = {};
const store = {
  get(k){ try{ const v=localStorage.getItem('brasao.'+k); return v===null?(mem[k]??null):v }catch(e){ return mem[k]??null } },
  set(k,v){ mem[k]=v; try{ localStorage.setItem('brasao.'+k,v) }catch(e){} }
};
let done = {}; try{ done = JSON.parse(store.get('done')||'{}') }catch(e){ done = {} }
const saveDone = () => store.set('done', JSON.stringify(done));

/* "today" in Chicago */
function chicagoNow(){
  const p = {}; new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()).forEach(x=>p[x.type]=x.value);
  return {y:+p.year,m:+p.month,d:+p.day,min:(+p.hour%24)*60+ +p.minute};
}
const now = chicagoNow();
/* "K": prefijo de las tareas hechas. Octubre sin prefijo (así no se pierde lo que ya marcaste). */
const K = d => (MKEY===10?'':MKEY+'/')+d;
function setMonth(m){
  const x=MONTHS[m], p=ym(m); MKEY=m; MNUM=p.m; MYEAR=p.y; DATA=x.data; ACTUALS=x.actuals; BUDGET=x.budget; if(typeof applyLive==='function') applyLive(m);
  D=DATA.days; CAMPS=DATA.camps; MES=MES_ES[MNUM]; NDAYS=DATA.ndays||new Date(Date.UTC(MYEAR,MNUM,0)).getUTCDate();
  inMonth = now.y===MYEAR && now.m===MNUM;
  TODAY = inMonth ? now.d : (now.y*100+now.m < MYEAR*100+MNUM ? 1 : NDAYS);
  NOWMIN = inMonth ? now.min : -1;
}
/* mes inicial: el que guardaste, si no el mes actual, si no el último */
let m0=+store.get('month');
if(!MONTHS[m0]) m0 = MKEYS.find(k=>{const p=ym(k);return p.y===now.y&&p.m===now.m}) ?? MKEYS[MKEYS.length-1];
setMonth(m0);

const S = { tab:'dashboard', day:TODAY, loc: store.get('loc')||'all', plat:'all' };
if(!LOCS.some(l=>l[0]===S.loc)) S.loc='all';

/* helpers */
const mins = t => { const m=String(t).match(/(\d+)(?::(\d+))?\s*([AP]M)/i); if(!m) return 0; let h=+m[1]%12; if(m[3].toUpperCase()==='PM') h+=12; return h*60+(+m[2]||0) };
const tag = loc => /SA ONLY/.test(loc)?'SA':/DFW ONLY \(Plano\)/.test(loc)?'PLANO':/DFW ONLY \(Irving\)/.test(loc)?'IRVING':/DFW ONLY/.test(loc)?'DFW':'ALL';
const tagOK = t => S.loc==='all'||t==='ALL'||(t==='SA'&&S.loc==='sa')||(t==='DFW'&&(S.loc==='plano'||S.loc==='irving'))||t.toLowerCase()===S.loc;
function accounts(t){
  const all = t==='ALL'?['sa','plano','irving']:t==='SA'?['sa']:t==='DFW'?['plano','irving']:[t.toLowerCase()];
  return all.filter(a=>S.loc==='all'||a===S.loc).map(a=>LOCNAME[a]);
}
const evTags = m => { if(/All|Brand/.test(m)) return ['ALL']; const t=[]; if(/San Antonio/.test(m)) t.push('SA'); if(/DFW/.test(m)) t.push('DFW'); if(/Plano/.test(m)) t.push('PLANO'); if(/Irving/.test(m)) t.push('IRVING'); return t.length?t:['ALL'] };
const campTag = c => { const n=c.name; if(/^(IG|TT|FB) SA/.test(n)) return 'SA'; if(/^(IG|TT) DFW|^DFW Rem/.test(n)) return 'DFW'; if(/^FB Plano/.test(n)) return 'PLANO'; if(/^FB Irving/.test(n)) return 'IRVING'; return 'ALL' };
const platCls = p => /Instagram/.test(p)?'ig':/TikTok/.test(p)?'tt':/^FB/.test(p)?'fb':/Google/.test(p)?'go':'fb';
const platName = p => ({'Instagram':'Instagram','TikTok':'TikTok','FB San Antonio':'Facebook','FB Plano':'Facebook','FB Irving':'Facebook','DFW Remarketing':'Meta (remarketing)','Google Search':'Google Search','Google Performance Max':'Google PMax'}[p]||p);
const dayLabel = d => `${DOW[dow(d)]} ${d} de ${MES}`;
const cap1 = s => s.charAt(0).toUpperCase()+s.slice(1);
const fmtEs = f => ({'Image':'Imagen','Video 8s':'Video 8 s','Video 10s':'Video 10 s','Link':'Enlace','Poll':'Encuesta','Countdown':'Cuenta regresiva','Video (Reel)':'Reel (video)'}[f]||f);
function whereFeed(p){
  if(/TikTok \+ Reels/.test(p)) return ['TikTok','Instagram Reels'];
  if(/TikTok \+ YT/.test(p)) return ['TikTok','YouTube Shorts'];
  if(/Instagram \+ FB/.test(p)) return ['Instagram','Facebook'];
  return [p];
}
const bucket = m => m<720?'Mañana':m<1020?'Tarde':'Noche';
const t12 = m => { const h=Math.floor(m/60), mm=m%60; return `${((h+11)%12)+1}:${String(mm).padStart(2,'0')} ${h<12?'AM':'PM'}` };

/* clipboard */
let CLIPS = [];
const clip = txt => { CLIPS.push(txt); return CLIPS.length-1 };
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('show'),1600) }
async function copyText(txt){
  try{ await navigator.clipboard.writeText(txt); toast('Copiado'); return }catch(e){}
  const ta=document.createElement('textarea'); ta.value=txt; ta.style.cssText='position:fixed;opacity:0;top:0'; document.body.appendChild(ta); ta.select();
  let ok=false; try{ ok=document.execCommand('copy') }catch(e){} ta.remove(); toast(ok?'Copiado':'Mantén presionado el texto para copiar');
}

/* ---------- links de stories ---------- */
const SITE='https://www.brasaousa.com', GIFT='https://brasaousa.cardfoundry.com';
const OTAB={sa:'https://www.opentable.com/booking/restref/availability?restRef=262078&partySize=2',plano:'https://www.opentable.com/booking/restref/availability?restRef=1114516&partySize=2',irving:'https://www.opentable.com/booking/restref/availability?restRef=1254919&partySize=2'};
const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
function siteUrl(path,topic){ const [p,h]=path.split('#'); return SITE+p+'?utm_source=instagram&utm_medium=organic&utm_campaign='+MES_EN[MNUM]+'_'+MYEAR+'&utm_content=story_'+slug(topic)+(h?'#'+h:'') }
/* Qué link lleva cada story. Se calcula con el tema, el formato y la sucursal que vienen del Google Sheet. */
function storyLink(s){
  const t=s.topic||'', f=s.format||'', L=s.loc||'';
  const yes=(label,url,why)=>({use:true,label,url,why});
  const no=why=>({use:false,why});
  if(/Gift Card|Black Friday|Cyber Monday/i.test(t)) return yes('Shop gift cards',GIFT+'?utm_source=instagram&utm_medium=organic&utm_campaign='+MES_EN[MNUM]+'_'+MYEAR+'&utm_content=story_'+slug(t),'Tarjetas de regalo. El link va a la tienda de gift cards (brasaousa.cardfoundry.com).');
  if(/December|Private|Holiday Party/i.test(t)) return yes('Plan your event',siteUrl('/private-events',t),'Eventos privados de diciembre. El link va a la página de eventos.');
  if(/Poll|Countdown/.test(f)) return no(`El sticker de ${/Poll/.test(f)?'encuesta':'cuenta regresiva'} ya es la interacción de esta story.`);
  if(/CONFIRM/.test(t)) return no('Publícala solo si el dueño ya confirmó. Es informativa, sin link.');
  if(/Thank You|Happy Halloween|Bar Energy|Night Carve|Saturday Sizzle|Sunday Family|Happy Thanksgiving|Gratitude|Veterans|Proclama|Muertos|Clocks|Small Business|Game Tomorrow/i.test(t)) return no('Es ambiente o una fecha especial, no pide una acción.');
  if(/Happy Hour/i.test(t)) return yes('Happy Hour menu',siteUrl('/happy-hour',t),'Happy Hour en el bar. El link va al menú.');
  if(/Executive Lunch/i.test(t)) return yes('Executive Lunch',siteUrl('/executive-lunch',t),'Almuerzo de lunes a viernes. El link va a la página del Executive Lunch.');
  if(/Dessert/i.test(t)) return yes('Drinks & desserts',siteUrl('/drink-menu',t),'Postres y bebidas. El link va al menú de bebidas y postres.');
  if(/Video/.test(f) && !/Prime Rib|Wagyu|Caipirinha|Reserve/i.test(t)) return no('Video de ambiente, no pide una acción.');
  /* todo lo demás: reservar */
  let url=siteUrl('/#reserve',t), where='Elige sucursal en la página.';
  if(/SA ONLY/i.test(L)){ url=OTAB.sa; where='Va directo a la reserva de San Antonio.' }
  else if(/Plano/i.test(L)){ url=OTAB.plano; where='Va directo a la reserva de Plano.' }
  else if(/Irving/i.test(L)){ url=OTAB.irving; where='Va directo a la reserva de Irving.' }
  return yes('Reserve a table',url,'Es una story para venir hoy o pronto. '+where);
}
/* ---------- views ---------- */
function visibleAds(d){ return D[d].ads.filter(a=>tagOK(campTag(CAMPS[a.i]))) }
function dayTasks(d){
  const day=D[d], list=[];
  if(day.feed) list.push({id:`${K(d)}:feed`,t:mins(day.feed.time),kind:'feed',x:day.feed});
  day.stories.forEach((s,i)=>{ if(tagOK(tag(s.loc))) list.push({id:`${K(d)}:s${i}`,t:mins(s.time),kind:'story',x:s}) });
  if(day.email){ const m=day.email.send.match(/(\d+(?::\d+)?\s*[AP]M)/i); list.push({id:`${K(d)}:email`,t:m?mins(m[1]):600,kind:'email',x:day.email}) }
  list.sort((a,b)=>a.t-b.t);
  return list;
}
function adTasks(d){ const out=[]; visibleAds(d).forEach(a=>{ if(a.on) out.push({id:`${K(d)}:ad${a.i}:on`}); if(a.off) out.push({id:`${K(d)}:ad${a.i}:off`}) }); return out }
function routine(d){
  const r=[{id:`${K(d)}:r1`,txt:'Comparte en tus Stories lo que los clientes publicaron y te etiquetaron.',sub:'Todos los días'}];
  if(d>=5||MNUM!==10) r.push({id:`${K(d)}:r2`,txt:'Revisa los leads de eventos privados. El gerente de cada sucursal responde en menos de 24 horas.',sub:'Plan Book December'});
  if(dow(d)===1) r.push(
    {id:`${K(d)}:w1`,txt:'Anota el gasto real de la semana en el Spend Tracker (celdas amarillas).',sub:'Lunes'},
    {id:`${K(d)}:w2`,txt:'Compara tus métricas con las alertas de la pestaña Guía y pausa lo que esté en rojo.',sub:'Lunes'},
    {id:`${K(d)}:w3`,txt:'Programa 1 post de Google Business Profile por sucursal esta semana.',sub:'Semanal'});
  return r;
}
function progress(d){
  const ids=[...dayTasks(d).map(t=>t.id),...adTasks(d).map(t=>t.id),...routine(d).map(t=>t.id)];
  const n=ids.filter(i=>done[i]).length; return {n,total:ids.length,pct:ids.length?Math.round(100*n/ids.length):0};
}
function chk(id){ return `<button class="chk" data-k="${id}" aria-pressed="${!!done[id]}" aria-label="Marcar como hecho"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.5l3 3 6-7"/></svg></button>` }

function linkBlock(s){
  const l=storyLink(s);
  if(!l.use) return `<p class="t-vis lnk-no"><b>Sin link.</b> ${esc(l.why)}</p>`;
  return `<div class="lnk"><div class="lnk-h"><span class="chip lk">Sticker de link</span><b>${esc(l.label)}</b><button class="copy" data-c="${clip(l.url)}">Copiar link</button></div><p class="lnk-u">${esc(l.url.replace(/^https:\/\/(www\.)?/,''))}</p><p class="lnk-w">${esc(l.why)}</p></div>`;
}

function adDetails(c){
  const i=c.info||{};
  const rows=[['Objetivo',i.objective],['Audiencia',i.audience],['Qué mostrar',i.creative],['Formato',i.format],['Botón (CTA)',i.cta],['Duración',i.flights],['Total',c.total]].filter(r=>r[1]);
  return `<dl class="dl">${rows.map(r=>`<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>`;
}


/* "Ahora": live coach synced to Chicago time */
function fmtMin(m){ const h=Math.floor(m/60)%24, mm=m%60; return `${h%12||12}:${String(mm).padStart(2,'0')} ${h<12?'AM':'PM'}` }
function inMin(n){ if(n<60) return `${n} min`; const h=Math.floor(n/60), m=n%60; return m?`${h} h ${m} min`:`${h} h` }
function nowItem(t,late){
  const x=t.x; let title,what;
  if(t.kind==='feed'){ title=`Publica el ${/Reel/.test(x.format)?'Reel':'post'}: ${x.theme||x.topic}`; what=`${x.format} · ${whereFeed(x.platform).join(' + ')}${x.loc?' · '+x.loc:''}` }
  else if(t.kind==='story'){ const lk=storyLink(x); title=`Sube la story: ${x.topic}`; what=`${x.format} · ${x.loc||''}${x.overlay?' · Texto: '+x.overlay:''}${lk.use?' · Sticker de link: '+lk.label:' · Sin link'}` }
  else { title=`Envía el email: ${x.subject||''}`; what=x.send||'' }
  return `<div class="now-i" data-row="${t.id}">${chk(t.id)}<div class="now-b"><div class="now-top"><span class="time">${esc(x.time||fmtMin(t.t))}</span>${late?'<span class="late">Atrasado</span>':''}</div><p class="now-t">${esc(title)}</p><p class="now-w">${esc(what)}</p></div></div>`;
}
function renderNow(){
  if(!(inMonth && S.day===TODAY)) return '';
  const nm=chicagoNow().min, tasks=dayTasks(TODAY).filter(t=>!done[t.id]);
  const due=tasks.filter(t=>t.t<=nm), next=tasks.filter(t=>t.t>nm);
  const adsLeft=adTasks(TODAY).filter(t=>!done[t.id]).length;
  let h=`<section class="now" id="nowcard"><div class="now-h"><span class="live"><i></i>Ahora</span><span class="num">${fmtMin(nm)} · Chicago</span></div>`;
  if(due.length){
    h+=`<p class="now-lead">${due.length===1?'Te toca hacer esto ahora:':`Tienes ${due.length} cosas pendientes ahora. Empieza por la más reciente:`}</p>`;
    h+=due.slice(-3).reverse().map((t,i)=>nowItem(t,nm-t.t>30)).join('');
    if(due.length>3) h+=`<p class="now-more">+ ${due.length-3} más atrasadas abajo en la lista.</p>`;
  } else if(next.length){
    h+=`<p class="now-lead">Estás al día. Lo siguiente es en <b>${inMin(next[0].t-nm)}</b>:</p>`;
  } else {
    h+=`<p class="now-lead"><b>Listo por hoy.</b> Ya hiciste todo lo programado.</p>`;
  }
  if(next.length){ h+=`<div class="now-next"><small>${due.length?`Después, en ${inMin(next[0].t-nm)}`:'Siguiente'}</small>${nowItem(next[0],false)}</div>` }
  if(adsLeft) h+=`<button class="now-ads" data-tab="ads">${adsLeft} ${adsLeft===1?'cambio':'cambios'} de anuncios pendientes hoy <span>›</span></button>`;
  return h+`</section>`;
}
function refreshNow(){ const el=document.getElementById('nowcard'); if(el) el.outerHTML=renderNow() }
setInterval(refreshNow,30000);

function renderHoy(){
  const d=S.day, day=D[d], tasks=dayTasks(d), ads=visibleAds(d), pr=progress(d);
  const feed=tasks.find(t=>t.kind==='feed'), nStories=tasks.filter(t=>t.kind==='story').length;
  const nOn=ads.filter(a=>a.on).length, nOff=ads.filter(a=>a.off).length;
  const spend=ads.reduce((s,a)=>s+a.amt,0);
  const parts=[];
  if(feed) parts.push(`<b>1 ${feed.x.format.includes('Reel')?'Reel':'post'}</b> (${esc(whereFeed(feed.x.platform).join(' + '))})`);
  if(nStories) parts.push(`<b>${nStories} stories</b>`);
  if(day.email) parts.push(`<b>1 email</b>`);
  if(nOn||nOff) parts.push(`<b>${nOn+nOff} ${nOn+nOff===1?'cambio':'cambios'} en anuncios</b>`);
  const intro = parts.length?`Hoy te toca: ${parts.join(', ').replace(/, ([^,]*)$/,' y $1')}.`:'Hoy no hay tareas para esta selección.';
  const evs = day.events.filter(e=>S.loc==='all'||evTags(e.market).some(tagOK));
  let h='';
  h+=renderNow();
  h+=`<div class="hero"><div class="ring" style="--p:${pr.pct}"><i class="num">${pr.pct}%</i></div><div><p id="intro">${intro}</p><small class="num" id="prog">${pr.n} de ${pr.total} hechas · anuncios del día ${money(spend)}</small></div></div>`;
  if(!inMonth && d===TODAY) h+=`<p class="note">El plan cubre del 1 al ${NDAYS} de ${MES} de ${MYEAR}. Estás viendo el ${d===1?'primer':'último'} día.</p>`;

  if(evs.length){
    h+=`<section class="sec"><h2>Fechas importantes</h2><div class="group">`+evs.map(e=>{
      const cls=e.type==='Guardrail'?'warn':/Game/.test(e.type)?'game':'';
      const lbl=e.type==='Guardrail'?'Cuidado':/Game/.test(e.type)?'Juego':/Brasão/.test(e.type)?'Brasão':'Evento';
      return `<details class="ev"><summary><span class="badge ${cls}">${lbl}</span><span class="e-name">${esc(e.event)}</span></summary><p class="e-body"><b>Por qué importa:</b> ${esc(e.why)}</p><p class="e-body"><b>Qué hacer:</b> ${esc(e.play)}</p></details>`}).join('')+`</div></section>`;
  }

  /* ads */
  if(ads.length){
    const grp=(label,arr,cls,txt)=>arr.length?`<div class="group" style="margin-top:8px">${arr.map(a=>{const c=CAMPS[a.i];
      const k=`${K(d)}:ad${a.i}:`+(cls==='on'?'on':cls==='off'?'off':'x');
      const row=`<details class="ad"><summary><span class="dot ${platCls(c.platform)}"></span><span class="a-name">${esc(c.name)}</span><span class="a-amt">${money(a.amt)}</span><span class="act ${cls}">${txt}</span></summary>${adDetails(c)}</details>`;
      return cls==='run'?row:`<div class="task" style="padding:0 0 0 14px;align-items:center">${chk(k)}<div style="flex:1;min-width:0">${row}</div></div>`}).join('')}</div>`:'';
    const on=ads.filter(a=>a.on), off=ads.filter(a=>a.off&&!a.on), both=ads.filter(a=>a.on&&a.off), run=ads.filter(a=>!a.on&&!a.off);
    h+=`<section class="sec"><h2>1 · Anuncios <span class="num">${money(spend)} hoy</span></h2>`;
    if(on.length) h+=`<p class="note">Enciende o programa estos anuncios hoy.</p>`+grp('on',on,'on','Encender');
    if(off.length) h+=`<p class="note" style="margin-top:6px">Último día. Apágalos al terminar el día.</p>`+grp('off',off,'off','Apagar');
    if(run.length) h+=`<details class="more" style="margin-top:10px"><summary>${run.length} siguen corriendo · no cambies nada</summary>${grp('run',run,'run','Activo')}</details>`;
    h+=`</section>`;
  }

  /* timeline */
  if(tasks.length){
    h+=`<section class="sec"><h2>2 · Publicaciones y email <span>${S.loc==='all'?'3 sucursales':LOCNAME[S.loc]}</span></h2>`;
    let lastB='', nextMarked=false, html='';
    tasks.forEach(t=>{
      const b=bucket(t.t); if(b!==lastB){ if(lastB) html+='</div>'; html+=`<p class="note" style="margin:8px 0 6px">${b}</p><div class="group">`; lastB=b }
      const isNext = d===TODAY && inMonth && !nextMarked && t.t>=NOWMIN && !done[t.id]; if(isNext) nextMarked=true;
      const nextChip = isNext?`<span class="chip next">Siguiente</span>`:'';
      if(t.kind==='feed'){
        const f=t.x, show=(S.loc==='all'||S.loc==='sa'), showD=(S.loc==='all'||S.loc==='plano'||S.loc==='irving');
        const where=whereFeed(f.platform).map(w=>`<span class="chip ${/Insta|Reels/.test(w)?'ig':/TikTok/.test(w)?'tt':/Face/.test(w)?'fb':''}">${w}</span>`).join('');
        const caps = (show?`<div class="cap"><h4><span>Texto · San Antonio</span><button class="copy" data-c="${clip(f.capSA)}">Copiar</button></h4><p>${esc(f.capSA)}</p></div>`:'')
                   + (showD?`<div class="cap"><h4><span>Texto · Plano + Irving</span><button class="copy" data-c="${clip(f.capDFW)}">Copiar</button></h4><p>${esc(f.capDFW)}</p></div>`:'');
        html+=`<div class="task feed ${done[t.id]?'done':''}" data-row="${t.id}">${chk(t.id)}<div class="t-body"><div class="t-top"><span class="time">${f.time}</span><span class="t-title t-main">${esc(f.theme||f.topic)}</span>${nextChip}</div>
          <div class="t-meta"><span class="chip">${fmtEs(f.format)}</span>${where}<span class="chip loc">${S.loc==='all'?'San Antonio · Plano · Irving':LOCNAME[S.loc]}</span></div>
          <p class="t-vis t-main"><b>Cómo grabarlo:</b> ${esc(f.visual)}</p>
          ${f.boost&&f.boost!=='—'?`<p class="t-vis"><b>Anuncio ligado:</b> ${esc(f.boost)}</p>`:''}
          <details class="more" open><summary>Textos y hashtags</summary>${caps}<p class="tags">${esc(f.tags)}</p></details></div></div>`;
      } else if(t.kind==='story'){
        const s=t.x, acc=accounts(tag(s.loc));
        html+=`<div class="task ${done[t.id]?'done':''}" data-row="${t.id}">${chk(t.id)}<div class="t-body"><div class="t-top"><span class="time">${s.time}</span><span class="t-title t-main">${esc(s.slot.replace('STORY','Story'))} · ${esc(s.topic)}</span>${nextChip}</div>
          <p class="t-text t-main">${esc(s.overlay)}</p><p class="t-vis t-main"><b>Foto o video:</b> ${esc(s.visual)}</p>
          ${linkBlock(s)}
          <div class="t-meta"><span class="chip">${fmtEs(s.format)}</span><span class="chip ig">Instagram Story</span><span class="chip fb">también a Facebook</span><span class="chip loc">${acc.join(' · ')}</span></div></div></div>`;
      } else {
        const e=t.x, mm=e.body, id=clip(`${e.subject}\n\n${e.body}`);
        html+=`<div class="task ${done[t.id]?'done':''}" data-row="${t.id}">${chk(t.id)}<div class="t-body"><div class="t-top"><span class="time">${t12(t.t)}</span><span class="t-title t-main">Enviar email (Constant Contact)</span>${nextChip}</div>
          <p class="t-text t-main"><b>Asunto:</b> ${esc(e.subject)}</p><div class="t-meta"><span class="chip loc">${esc(e.send.split('|')[1]?.trim()||'Todas las sucursales')}</span></div>
          <details class="more"><summary>Ver contenido</summary><blockquote class="mail" style="margin:8px 0 0;padding:10px 12px;background:var(--surface2);border-radius:10px;font-size:14px;color:var(--fg2);white-space:pre-wrap;overflow-wrap:anywhere">${esc(mm)}</blockquote>
          ${e.warn?`<p class="warnline">⚠ ${esc(e.warn)}</p>`:''}<p style="margin-top:8px"><button class="copy" data-c="${id}">Copiar asunto y texto</button></p></details></div></div>`;
      }
    });
    h+=html+'</div></section>';
  }

  /* routine */
  const rt=routine(d);
  h+=`<section class="sec"><h2>3 · Rutina</h2><div class="group">`+rt.map(r=>`<div class="task ${done[r.id]?'done':''}" data-row="${r.id}">${chk(r.id)}<div class="t-body"><p class="t-title t-main" style="font-weight:500;font-size:15px">${esc(r.txt)}</p><div class="t-meta"><span class="chip">${esc(r.sub)}</span></div></div></div>`).join('')+`</div></section>`;
  if(dow(d)===1) h+=`<p class="note">Los umbrales verde, amarillo y rojo están en la pestaña Guía.</p>`;
  return h;
}

function renderSemana(){
  let h=`<section class="sec"><h2>${cap1(MES)} ${MYEAR}</h2><div class="group"><div class="cal">`+DOW3.map(x=>`<div class="dow">${x}</div>`).join('');
  for(let i=0;i<dow(1);i++) h+=`<div class="cell empty"></div>`;
  for(let d=1;d<=NDAYS;d++){
    const sp=D[d].ads.reduce((s,a)=>s+a.amt,0), star=D[d].events.some(e=>/★/.test(e.event)||/Game|Observance|Holiday|Brazilian|Cultural/.test(e.type)&&e.start===e.end);
    h+=`<button class="cell ${d===TODAY&&inMonth?'today':''} ${d===S.day?'sel':''}" data-go="${d}" aria-label="${dayLabel(d)}"><b>${d}</b><small>${money(sp)}</small>${star?'<span class="st">★</span>':''}</button>`;
  }
  h+=`</div></div><p class="note">★ día con fecha clave. Toca un día para ver qué hacer.</p></section>`;
  const from=S.day, to=Math.min(NDAYS,from+6);
  h+=`<section class="sec"><h2>Próximos días</h2><div class="group">`;
  for(let d=from;d<=to;d++){
    const day=D[d], ev=day.events.filter(e=>/★/.test(e.event)||e.start===e.end)[0]||day.events[0];
    const top = day.feed?(day.feed.theme||day.feed.topic):'Sin publicación';
    h+=`<button class="drow" data-go="${d}"><span class="d"><span>${DOW3[dow(d)]}</span><b>${d}</b></span><span class="x"><p>${esc(top)}</p><small>${day.feed?1:0} post · ${day.stories.length} stories${day.email?' · email':''} · ${money(day.ads.reduce((s,a)=>s+a.amt,0))} en anuncios</small></span></button>`;
  }
  return h+`</div></section>`;
}

function renderAds(){
  if(!LIVE[MKEY]) loadSpend(MKEY); if(!AN[MKEY]) loadAN(MKEY);
  let REALH='';
  const total=CAMPS.reduce((s,c)=>s+c.amt.reduce((a,b)=>a+b,0),0);
  const upto=d=>CAMPS.reduce((s,c)=>s+c.amt.slice(0,d).reduce((a,b)=>a+b,0),0);
  const spent=upto(S.day), todaySp=visibleAds(S.day).reduce((s,a)=>s+a.amt,0);
  let h='';
  /* real spend */
  if(!(ACTUALS&&ACTUALS.platforms&&ACTUALS.platforms.length)){
    REALH=`<section class="sec"><h2>Gasto real</h2><div class="group"><div class="empty-s">Todavía no hay gasto real de ${MES}. Aquí aparece cuando se actualice desde Meta, TikTok y Google.</div></div></section>`;
  } else {
    const th=ACTUALS.through||S.day;
    const real=ACTUALS.platforms.reduce((s,p)=>s+(p.spent||0),0);
    const plan=CAMPS.filter(c=>!/Google/.test(c.platform)).reduce((s,c)=>s+c.amt.slice(0,th).reduce((a,b)=>a+b,0),0);
    const diff=real-plan;
    const bud=(BUDGET&&BUDGET.monthly)||24000, left=bud-real, dl=Math.max(1,NDAYS-th), pace=real/th*NDAYS, pct=Math.min(100,Math.round(100*real/bud));
    REALH=`<section class="sec"><h2>Gasto real <span>actualizado ${esc(ACTUALS.updated)}</span></h2><div class="tiles"><div class="tile"><small>Gastado</small><b class="num">${money(real)}</b></div><div class="tile"><small>Presupuesto</small><b class="num">${money(bud)}</b></div><div class="tile"><small>${left>=0?'Libre':'Te pasaste'}</small><b class="num" style="color:var(--${left>=0?'ok':'bad'})">${money(Math.abs(left))}</b></div></div><div class="group" style="margin-top:8px"><div class="pbar"><div class="row"><span>${pct}% del presupuesto gastado, día ${th} de ${NDAYS}</span><span class="num">${money(real)}</span></div><div class="track"><i style="width:${pct}%"></i></div><p class="note" style="padding:8px 0 0">${left>=0?'Libre hasta el '+NDAYS+': '+money(left)+' (unos '+money(left/dl)+' al día, '+dl+' días)':'Te pasaste por '+money(-left)}.</p></div></div><div class="group" style="margin-top:8px">`+ACTUALS.platforms.map(p=>`<details class="item"><summary><span>${esc(p.name)}</span><span class="num" style="font-weight:700">${p.spent==null?'—':money(p.spent)}</span></summary>${p.note?`<p>${esc(p.note)}</p>`:''}${(p.campaigns||[]).map(c=>`<p style="display:flex;justify-content:space-between;gap:12px"><span style="min-width:0;overflow-wrap:anywhere">${esc(c.name)}</span><b class="num" style="color:var(--fg)">${money(c.spent)}</b></p>`).join('')}</details>`).join('')+`</div><p class="note">Gasto desde el 1 de ${MES} en Meta, TikTok y Google. Toca Actualizar arriba para leerlo en vivo.</p></section>`;
  }
  /* by platform (real) */
  const bud2=(BUDGET&&BUDGET.monthly)||24000;
  if(ACTUALS&&ACTUALS.platforms&&ACTUALS.platforms.length){
    h+=`<section class="sec"><h2>Gasto por plataforma <span>de ${money(bud2)}</span></h2><div class="group">`+ACTUALS.platforms.map(p=>`<div class="pbar"><div class="row"><span>${esc(p.name)}</span><span class="num">${p.spent==null?'—':money(p.spent)}</span></div><div class="track"><i style="width:${Math.min(100,Math.round(100*(p.spent||0)/bud2))}%"></i></div></div>`).join('')+`</div></section>`;
  }
  const plats=['all','Instagram','TikTok','Facebook','Google'];
  h+=`<section class="sec"><h2>Campañas de hoy</h2><div class="fchips">`+plats.map(p=>`<button data-plat="${p}" aria-pressed="${S.plat===p}">${p==='all'?'Todas':p}</button>`).join('')+`</div><div class="group">`;
  const list=CAMPS.map((c,i)=>({c,i})).filter(({c})=>tagOK(campTag(c))&&(S.plat==='all'||(S.plat==='Facebook'?/^FB|Remarketing/.test(c.platform):S.plat==='Google'?/Google/.test(c.platform):c.platform===S.plat)));
  if(!list.length) h+=`<div class="empty-s">No hay campañas para este filtro.</div>`;
  list.forEach(({c})=>{
    const a=c.amt, d=S.day, first=a.findIndex(x=>x>0)+1, last=a.length-[...a].reverse().findIndex(x=>x>0);
    const st = a[d-1]>0?`<span class="act on">Hoy ${money(a[d-1])}</span>`: d<first?`<span class="act run">Inicia el ${first}</span>`: d>last?`<span class="act off">Terminó</span>`:`<span class="act run">Pausa hoy</span>`;
    h+=`<details class="ad"><summary><span class="dot ${platCls(c.platform)}"></span><span class="a-name">${esc(c.name)}</span>${st}</summary>${adDetails(c)}<div class="strip" aria-hidden="true">${a.map((x,i)=>`<i class="${x?'a':''} ${i+1===d?'t':''}"></i>`).join('')}</div><p class="note" style="padding:4px 0 0">Días activos en ${MES}. Contorno = día seleccionado.</p></details>`;
  });
  return REALH+h+`</div></section>`;
}

function renderGuia(){
  let h=`<section class="sec"><h2>Antes de publicar</h2><div class="group">`+DATA.guard.map(g=>`<details class="item"><summary>${esc(g[0])}</summary><p>${esc(g[1])}</p></details>`).join('')+`</div></section>`;
  h+=`<section class="sec"><h2>Alertas de rendimiento <span>revisa cada lunes</span></h2><div class="group scroll-x"><table class="thr"><thead><tr><th>Dónde</th><th>Métrica</th><th>Bien</th><th>Vigila</th><th>Pausa</th></tr></thead><tbody>`+DATA.thr.map(r=>`<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td class="g">${esc(r[2])}</td><td class="y">${esc(r[3])}</td><td class="r">${esc(r[4])}</td></tr>`).join('')+`</tbody></table></div><p class="note">Si está en rojo: ${''}abre la fila en el Excel (columna Action if red).</p></section>`;
  h+=`<section class="sec"><h2>Metas de ${MES}</h2><div class="group">`+DATA.score.map(s=>`<details class="item"><summary>${esc(s[0])}</summary><p><b>Meta:</b> ${esc(s[2])}<br><b>Responsable:</b> ${esc(s[3])} · ${esc(s[4])}</p></details>`).join('')+`</div></section>`;
  h+=`<section class="sec"><h2>10 movimientos del mes</h2><div class="group">`+DATA.moves.map(m=>`<details class="item"><summary>${esc(m[0])}</summary><p>${esc(m[1])}</p></details>`).join('')+`</div></section>`;
  h+=`<section class="sec"><h2>Links en las stories</h2><div class="group">
    <details class="item"><summary>Cuándo llevan link y cuándo no</summary><p><b>Sí:</b> stories que piden una acción (reservar, ver el menú, planear un evento). <b>No:</b> ambiente, behind the scenes, encuestas y cuentas regresivas. Cada story del día te dice cuál es su caso.</p></details>
    <details class="item"><summary>Qué link va en cada tipo</summary><p>Abierto hoy, promos de la semana, Couples Night, Prime Rib, Ladies Night, Wagyu, Reserve Tonight, Weekend Reservations: reservar (brasaousa.com/#reserve).<br>Story de un solo local (San Antonio, Plano o Irving): la reserva de ese local en OpenTable.<br>Eventos privados y fiestas de diciembre: /private-events.<br>Gift cards, Black Friday y Cyber Monday: brasaousa.cardfoundry.com.<br>Executive Lunch: /executive-lunch.<br>Happy Hour: /happy-hour.<br>Postres y bebidas: /drink-menu.<br>Ambiente, behind the scenes y reseñas: sin link.</p></details>
    <details class="item"><summary>Cómo ponerlo</summary><p>Un solo sticker de link por story. Con texto corto, como "Reserve a table", en vez del link a la vista. Colócalo en la parte de abajo, debajo de brasaousa.com. El link ya trae UTM (instagram, organic, ${MES_EN[MNUM]}_${MYEAR}), así que lo ves en Analytics. En Facebook revisa si te deja poner el link antes de contar con él.</p></details>
  </div></section>`;
  h+=`<section class="sec"><h2>Hábitos de ${MES_ES[prevM(MNUM)]}</h2><div class="group">`+DATA.fixes.map(m=>`<details class="item"><summary>${esc(m[0])}</summary><p>${esc(m[1])}</p></details>`).join('')+`</div></section>`;
  return h;
}


/* ---------- Analíticos (Google Analytics 4 en vivo, vía /api/analytics) ---------- */
const AN = {};            /* por mes: {st:'loading'|'ok'|'err', d, at} */
const ANS = { metric:'sessions' };
const pctCh = (c,p) => p>0 ? (c-p)/p : (c>0 ? null : 0);
function chg(c,p){
  const r=pctCh(c,p);
  if(r===null) return `<span class="chg up">nuevo</span>`;
  if(Math.abs(r)<0.005) return `<span class="chg flat">= igual</span>`;
  return `<span class="chg ${r>0?'up':'down'}">${r>0?'▲':'▼'} ${Math.abs(Math.round(r*100))}%</span>`;
}
const num = n => Math.round(n).toLocaleString('en-US');
function loadAN(m, force){
  if(AN[m] && !force && (AN[m].st==='loading' || (AN[m].st==='ok' && Date.now()-AN[m].at<10*60*1000))) return;
  AN[m]={st:'loading'};
  fetch(`/api/analytics?y=${ym(m).y}&m=${ym(m).m}${force?'&t='+Date.now():''}`,{cache:'no-store'})
    .then(r=>r.json().catch(()=>({ok:false,code:'bad',error:`El servidor respondió ${r.status}.`})))
    .then(j=>{ AN[m]= j&&j.ok ? {st:'ok',d:j,at:Date.now()} : {st:'err',d:j||{},at:Date.now()} })
    .catch(()=>{ AN[m]={st:'err',d:{code:'net',error:'No hay conexión con el servidor de la app.'},at:Date.now()} })
    .finally(()=>{ if(RF.pending) { applyLive(m); return } liveDone(m) });
}
function renderAnalytics(){
  const st=AN[MKEY];
  if(!st || st.st==='loading'){ if(!st) loadAN(MKEY); return `<section class="sec"><div class="group"><div class="empty-s">Cargando Google Analytics…</div></div></section>` }
  if(st.st==='err'){
    const e=st.d||{};
    if(e.code==='setup') return `<section class="sec"><h2>Google Analytics</h2><div class="group"><div class="item"><p><b>Falta conectar Google Analytics.</b></p><p style="margin-top:6px;color:var(--fg2)">La app ya está lista. Solo falta poner en Netlify la llave de solo lectura de la cuenta de servicio (GA_CLIENT_EMAIL y GA_PRIVATE_KEY). Cuando esté, aquí aparecen los números.</p></div></div></section>`;
    if(e.code==='future') return `<section class="sec"><div class="group"><div class="empty-s">${cap1(MES)} todavía no empieza.</div></div></section>`;
    return `<section class="sec"><h2>Google Analytics</h2><div class="group"><div class="item"><p><b>No se pudieron leer los datos.</b></p><p style="margin-top:6px;color:var(--fg2)">${esc(e.error||'Error desconocido.')}</p><p style="margin-top:10px"><button class="copy" data-anreload="1">Intentar otra vez</button></p></div></div></section>`;
  }
  const d=st.d, T=d.totals, PM=MES_ES[d.prevMonth];
  const curLbl=`1–${d.through} ${MES}`, prevLbl=`1–${d.prev.endDate.slice(8)*1} ${PM}`;
  let h=`<p class="note">${d.current?'Este mes':'Mes completo'}: <b>${curLbl}</b> contra <b>${prevLbl}</b>.${d.current?' Hoy va incompleto: Google tarda 24 a 48 horas en juntar todo.':''}</p>`;
  const PMc=cap1(PM), MESc=cap1(MES);
  const tile=(lbl,c,p)=>`<div class="tile"><small>${lbl}</small><b class="num">${num(c)}</b><small class="num">${chg(c,p)}</small><small class="num" style="color:var(--fg3)">${PMc}: ${num(p)}</small></div>`;
  const E=d.events;
  h+=`<section class="sec"><h2>${MESc} vs ${PMc} <span>brasaousa.com</span></h2><div class="tiles">`+
    tile('Visitas',T.cur.sessions,T.prev.sessions)+tile('Personas',T.cur.totalUsers,T.prev.totalUsers)+tile('Clics en Reservar',T.cur.reserves,T.prev.reserves)+
    tile('Llamadas',E.phone_click.cur,E.phone_click.prev)+tile('Cómo llegar',E.directions_click.cur,E.directions_click.prev)+tile('Clics a gift cards',d.giftCards.cur,d.giftCards.prev)+
    `</div>${trackNote(d)}<p class="note">Visitas con interacción: ${Math.round(T.cur.engagementRate*100)}% (antes ${Math.round(T.prev.engagementRate*100)}%). Personas nuevas: ${num(T.cur.newUsers)}.</p></section>`;
  /* gráfica */
  h+=`<section class="sec"><h2>Por día <span>${MESc} vs ${PMc}</span></h2><div class="fchips">`+[['sessions','Visitas'],['reserves','Clics en Reservar']].map(([k,l])=>`<button data-anm="${k}" aria-pressed="${ANS.metric===k}">${l}</button>`).join('')+`</div>
    <div class="group chartbox"><div class="legend"><span><i class="lgs cur"></i>${cap1(MES)}</span><span><i class="lgs prev"></i>${cap1(PM)}</span></div><div id="anchart" class="chart"></div><div id="antip" class="ctip" hidden></div></div>
    <details class="more"><summary>Ver como tabla</summary><div class="group scroll-x" style="margin-top:8px"><table class="thr"><thead><tr><th>Día</th><th>${cap1(MES)}</th><th>${cap1(PM)}</th></tr></thead><tbody>${d.daily.cur[ANS.metric].map((v,i)=>`<tr><td>${i+1}</td><td>${i<d.through?num(v):'—'}</td><td>${i<d.daily.prev[ANS.metric].length?num(d.daily.prev[ANS.metric][i]):'—'}</td></tr>`).join('')}</tbody></table></div></details></section>`;
  /* anuncios */
  const paid=d.channels.filter(c=>/Paid|Cross-network|Display/i.test(c.name));
  let ad='';
  if(d.googleAds){ const g=d.googleAds; ad+=`<div class="pbar"><div class="row"><span>Google Ads · clics</span><span class="num">${num(g.cur.clicks)} ${chg(g.cur.clicks,g.prev.clicks)}</span></div><p class="note" style="padding:6px 0 0">Costo ${money(g.cur.cost)} (antes ${money(g.prev.cost)})${g.cur.clicks?' · '+('$'+(g.cur.cost/g.cur.clicks).toFixed(2))+' por clic':''}.</p></div>`; }
  ad+=paid.map(c=>`<div class="pbar"><div class="row"><span>${esc(chName(c.name))} · visitas</span><span class="num">${num(c.cur.sessions)} ${chg(c.cur.sessions,c.prev.sessions)}</span></div><p class="note" style="padding:6px 0 0">${num(c.cur.reserves)} clics en Reservar (antes ${num(c.prev.reserves)}).</p></div>`).join('');
  if(ACTUALS&&ACTUALS.platforms&&ACTUALS.platforms.length&&ACTUALS.through===d.through&&E.reserve_click.cur){
    const real=ACTUALS.platforms.reduce((s,p)=>s+(p.spent||0),0);
    ad+=`<div class="pbar"><div class="row"><span>Gasto real ÷ clics en Reservar</span><span class="num">$${(real/E.reserve_click.cur).toFixed(2)}</span></div><p class="note" style="padding:6px 0 0">${money(real)} gastados (Meta, TikTok y Google, ${esc(ACTUALS.updated)}) entre ${num(E.reserve_click.cur)} clics en Reservar de todas las fuentes.</p></div>`;
  }
  if(ad) h+=`<section class="sec"><h2>Anuncios en el sitio</h2><div class="group">${ad}</div><p class="note">Visitas que llegaron desde anuncios, según Google Analytics. No coinciden exacto con los clics de Meta o TikTok: algunas personas cierran antes de que cargue la página.</p></section>`;
  /* canales */
  const maxC=Math.max(1,...d.channels.map(c=>c.cur.sessions));
  h+=`<section class="sec"><h2>De dónde llegan <span>${MESc} vs ${PMc}</span></h2><div class="group">`+d.channels.filter(c=>c.cur.sessions||c.prev.sessions).map(c=>`<div class="pbar"><div class="row"><span>${esc(chName(c.name))}</span><span class="num">${num(c.cur.sessions)} ${chg(c.cur.sessions,c.prev.sessions)}</span></div><p class="note" style="padding:4px 0 0">${PMc}: ${num(c.prev.sessions)}</p><div class="track"><i style="width:${Math.round(100*c.cur.sessions/maxC)}%"></i></div></div>`).join('')+`</div></section>`;
  h+=`<section class="sec"><h2>Fuentes principales</h2><div class="group">`+d.sources.filter(c=>c.cur.sessions).map(c=>`<div class="pbar"><div class="row"><span style="min-width:0;overflow-wrap:anywhere">${esc(c.name)}</span><span class="num">${num(c.cur.sessions)} ${chg(c.cur.sessions,c.prev.sessions)}</span></div><p class="note" style="padding:4px 0 0">${num(c.cur.reserves)} clics en Reservar</p></div>`).join('')+`</div></section>`;
  h+=`<section class="sec"><h2>Ciudades <span>${MESc} vs ${PMc}</span></h2><div class="group">`+d.cities.filter(c=>c.cur.sessions).map(c=>`<div class="pbar"><div class="row"><span>${esc(c.name)}</span><span class="num">${num(c.cur.sessions)} ${chg(c.cur.sessions,c.prev.sessions)}</span></div><p class="note" style="padding:4px 0 0">${PMc}: ${num(c.prev.sessions)}</p></div>`).join('')+`</div></section>`;
  h+=`<section class="sec"><h2>Páginas más vistas <span>${cap1(MES)}</span></h2><div class="group">`+d.pages.map(p=>`<div class="pbar"><div class="row"><span style="min-width:0;overflow-wrap:anywhere">${esc(p.name)}</span><span class="num">${num(p.value)}</span></div></div>`).join('')+`</div></section>`;
  const age=Math.round((Date.now()-st.at)/60000);
  h+=`<p class="note">Datos de Google Analytics (www.brasaousa.com), leídos ${age<1?'hace un momento':'hace '+age+' min'}. <button class="linkbtn" data-anreload="1">Actualizar</button></p>`;
  return h;
}
/* Los clics en Reservar, Llamadas y Cómo llegar se empezaron a medir a fines de octubre: avisa cuando el mes anterior no los tiene completos. */
function trackNote(d){
  const pr=d.daily.prev.reserves, cr=d.daily.cur.reserves.slice(0,d.through);
  const pi=pr.findIndex(v=>v>0), ci=cr.findIndex(v=>v>0);
  let when='';
  if(pi>0) when=`${pi+1} de ${MES_ES[d.prevMonth]}`;
  else if(pi<0 && ci>=0) when=`${ci+1} de ${MES}`;
  if(!when) return '';
  return `<p class="note"><b>Ojo:</b> los clics en Reservar, Llamadas y Cómo llegar se empezaron a medir el ${when}. Antes de esa fecha salen en 0, así que su comparación todavía no es pareja.</p>`;
}
const chName = n => ({'Organic Search':'Google orgánico','Paid Search':'Google pagado','Paid Social':'Redes pagadas (anuncios)','Organic Social':'Redes orgánicas','Direct':'Directo','Referral':'Otros sitios','Cross-network':'Google PMax (varias redes)','AI Assistant':'Asistentes de IA (ChatGPT, etc.)','SMS':'SMS','Unassigned':'Sin asignar','Email':'Email','Display':'Display','Organic Video':'Video orgánico','Paid Video':'Video pagado','Paid Other':'Otro pagado','Organic Maps':'Google Maps','Organic Shopping':'Shopping orgánico'}[n]||n);
function drawChart(){
  const box=document.getElementById('anchart'), st=AN[MKEY]; if(!box||!st||st.st!=='ok') return;
  const d=st.d, k=ANS.metric, cur=d.daily.cur[k].slice(0,d.through), prev=d.daily.prev[k], N=d.ndays;
  const W=box.clientWidth||340, H=200, L=42, Rm=8, Tm=10, B=22;
  const max=Math.max(1,...cur,...prev); const step=niceStep(max/3); const top=Math.ceil(max/step)*step;
  const x=i=>L+(N<=1?0:i*(W-L-Rm)/(N-1)), y=v=>Tm+(H-Tm-B)*(1-v/top);
  const path=a=>a.map((v,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  let g='';
  for(let v=0;v<=top+1e-9;v+=step) g+=`<line x1="${L}" x2="${W-Rm}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L-6}" y="${y(v)+4}" class="ax" text-anchor="end">${num(v)}</text>`;
  [1,8,15,22,N].forEach(dd=>{ if(dd<=N) g+=`<text x="${x(dd-1)}" y="${H-6}" class="ax" text-anchor="middle">${dd}</text>` });
  const pv=prev.slice(0,N);
  g+=`<path d="${path(pv)}" class="ln prev"/>`;
  g+=`<path d="${path(cur)}" class="ln cur"/>`;
  if(cur.length===1) g+=`<circle cx="${x(0)}" cy="${y(cur[0])}" r="4" class="dot cur"/>`;
  g+=`<line id="anx" class="xh" y1="${Tm}" y2="${H-B}" x1="-10" x2="-10"/><circle id="anpc" r="4" class="dot prev" cx="-10" cy="-10"/><circle id="ancc" r="4" class="dot cur" cx="-10" cy="-10"/>`;
  box.innerHTML=`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${k==='sessions'?'Visitas':'Clics en Reservar'} por día, ${MES} contra ${MES_ES[d.prevMonth]}">${g}<rect x="${L}" y="0" width="${W-L-Rm}" height="${H}" fill="transparent" id="anhit"/></svg>`;
  const svg=box.firstElementChild, tip=document.getElementById('antip');
  const show=ev=>{
    const r=svg.getBoundingClientRect(); const px=ev.clientX-r.left; const i=Math.max(0,Math.min(N-1,Math.round((px-L)/((W-L-Rm)/Math.max(1,N-1)))));
    const cv=i<cur.length?cur[i]:null, pvv=i<pv.length?pv[i]:null;
    const xh=svg.querySelector('#anx'); xh.setAttribute('x1',x(i)); xh.setAttribute('x2',x(i));
    const cc=svg.querySelector('#ancc'), pc=svg.querySelector('#anpc');
    cc.setAttribute('cx',cv==null?-10:x(i)); cc.setAttribute('cy',cv==null?-10:y(cv)); pc.setAttribute('cx',pvv==null?-10:x(i)); pc.setAttribute('cy',pvv==null?-10:y(pvv));
    tip.hidden=false; tip.innerHTML=`<b>Día ${i+1}</b><span><i class="lgs cur"></i>${cap1(MES)}: ${cv==null?'—':num(cv)}${d.current&&i===d.through-1?' (incompleto)':''}</span><span><i class="lgs prev"></i>${cap1(MES_ES[d.prevMonth])}: ${pvv==null?'—':num(pvv)}</span>`;
    const tx=Math.min(Math.max(x(i)-tip.offsetWidth/2,4),W-tip.offsetWidth-4); tip.style.left=tx+'px';
  };
  svg.addEventListener('pointermove',show); svg.addEventListener('pointerdown',show);
  svg.addEventListener('pointerleave',()=>{ tip.hidden=true; svg.querySelector('#anx').setAttribute('x1',-10); svg.querySelector('#anx').setAttribute('x2',-10); ['#ancc','#anpc'].forEach(s=>svg.querySelector(s).setAttribute('cx',-10)) });
}
function niceStep(v){ const p=Math.pow(10,Math.floor(Math.log10(Math.max(v,1)))), n=v/p; return (n<=1?1:n<=2?2:n<=5?5:10)*p }
addEventListener('resize',()=>{ if(S.tab==='analytics') drawChart() });



/* ---------- Gasto en vivo (botón Actualizar) ----------
   /api/spend lee Meta y TikTok con llaves de solo lectura; Google Ads sale de Google Analytics.
   Lo que no esté en vivo se queda con el último gasto guardado (actuals*.json). */
var LIVE = {};   /* por mes: {st:'loading'|'ok'|'err', d, at} */
var RF = { pending:0, at:0 };
function loadSpend(m, force){
  if(LIVE[m] && !force && (LIVE[m].st==='loading' || (LIVE[m].st==='ok' && Date.now()-LIVE[m].at<5*60*1000))) return;
  LIVE[m]={st:'loading', prev:LIVE[m]&&LIVE[m].d};
  return fetch(`/api/spend?y=${ym(m).y}&m=${ym(m).m}${force?'&t='+Date.now():''}`,{cache:'no-store'})
    .then(r=>r.json().catch(()=>({ok:false,error:`El servidor respondió ${r.status}.`})))
    .then(j=>{ LIVE[m]= j&&j.ok ? {st:'ok',d:j,at:Date.now()} : {st:'err',d:j||{},at:Date.now()} })
    .catch(()=>{ LIVE[m]={st:'err',d:{error:'No hay conexión con el servidor de la app.'},at:Date.now()} })
    .finally(()=>liveDone(m));
}
function liveDone(m){ applyLive(m); if((S.tab==='dashboard'||S.tab==='ads'||S.tab==='analytics') && MKEY===m){ const y=scrollY; render(); scrollTo(0,y) } }
const hhmm = t => new Date(t).toLocaleTimeString('es-MX',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'});
function applyLive(m){
  if(!LIVE||m!==MKEY) return;
  const base=MONTHS[m].actuals||{}, L=LIVE[m], ga=AN[m]&&AN[m].st==='ok'?AN[m].d:null;
  const plats=(base.platforms||[]).map(p=>({...p})), live=[];
  let th=0, at=0;
  const put=(re,name,o)=>{ const i=plats.findIndex(p=>re.test(p.name)), v={name,...o,live:true}; if(i<0) plats.push(v); else plats[i]=v };
  const Ld=L&&(L.st==='ok'?L.d:null);
  if(Ld){ if(Ld.meta.status==='ok'){ put(/Meta/,'Meta · Instagram + Facebook',{spent:Ld.meta.spent,campaigns:Ld.meta.campaigns,note:`En vivo desde Meta Ads (${Ld.meta.accounts} ${Ld.meta.accounts===1?'cuenta':'cuentas'}).`}); live.push('Meta') }
          if(Ld.tiktok.status==='ok'){ put(/TikTok/,'TikTok',{spent:Ld.tiktok.spent,campaigns:Ld.tiktok.campaigns,note:'En vivo desde TikTok Ads.'}); live.push('TikTok') }
          if(live.length){ th=Ld.through; at=L.at } }
  if(ga&&ga.googleAds){ put(/Google/,'Google Ads',{spent:ga.googleAds.cur.cost,campaigns:ga.googleAds.campaigns||[],note:'En vivo: costo de Google Ads ligado a Google Analytics (puede ir unas horas atrás).'}); live.push('Google'); th=Math.max(th,ga.through); at=Math.max(at,AN[m].at) }
  if(!live.length){ ACTUALS=MONTHS[m].actuals; return }
  const stale=plats.filter(p=>!p.live).map(p=>{ const g=p.asOf||String(base.updated||'').split('·')[0].trim(); p.note=(p.note?p.note+' ':'')+`Guardado: ${g}.`; return p.name.split(' ·')[0]+' '+g });
  ACTUALS={...base, platforms:plats, through:th, live,
    updated:`en vivo ${hhmm(at)} (${live.join(', ')})`+(stale.length?` · guardado: ${stale.join(', ')}`:'')};
}
function refreshAll(){
  RF.pending=2; render();
  const done1=()=>{ if(--RF.pending<=0){ RF.at=Date.now(); toast('Actualizado'); const y=scrollY; render(); scrollTo(0,y) } };
  loadAN(MKEY,true); const w=setInterval(()=>{ if(!AN[MKEY]||AN[MKEY].st!=='loading'){ clearInterval(w); done1() } },250);
  Promise.resolve(loadSpend(MKEY,true)).finally(done1);
}
const busy = () => RF.pending>0;
function connRows(){
  const L=LIVE[MKEY], A=AN[MKEY];
  const st=(s,err)=>s==='ok'?['ok','En vivo']:s==='setup'?['warn','Falta llave']:s==='loading'||s==null?['info','Cargando']:['bad',err||'Error'];
  const rows=[
    ['Meta (Instagram + Facebook)', L&&L.st==='ok'?st(L.d.meta.status):L&&L.st==='err'?st('err'):st(null), L&&L.st==='ok'?L.d.meta.error:L&&L.d&&L.d.error],
    ['TikTok Ads', L&&L.st==='ok'?st(L.d.tiktok.status):L&&L.st==='err'?st('err'):st(null), L&&L.st==='ok'?L.d.tiktok.error:L&&L.d&&L.d.error],
    ['Google Ads', A&&A.st==='ok'?(A.d.googleAds?st('ok'):['warn','Sin datos']):A&&A.st==='err'?st(A.d.code==='setup'?'setup':'err'):st(null), A&&A.st==='ok'&&!A.d.googleAds?'Google Analytics no trae costo de Google Ads este mes.':A&&A.d&&A.d.error],
    ['Google Analytics (web)', A&&A.st==='ok'?st('ok'):A&&A.st==='err'?st(A.d.code==='setup'?'setup':'err'):st(null), A&&A.d&&A.d.error]];
  return rows.map(([n,[c,l],e])=>`<div class="conn"><span class="cd ${c}"></span><span class="cn">${n}${e&&c!=='ok'?`<small>${esc(e)}</small>`:''}</span><span class="cs ${c}">${l}</span></div>`).join('');
}

/* ---------- Dashboard: todo el mes en una pantalla ----------
   Plan = Google Sheet del mes (data*.json). Gasto real = actuals*.json (Meta, TikTok, Google).
   Web = Google Analytics en vivo (/api/analytics, la misma fuente que Analíticos).
   Avance = casillas marcadas en este navegador. */
const PG=[ ['ig','Instagram',p=>p==='Instagram'], ['fb','Facebook',p=>/^FB|Remarketing/.test(p)], ['tt','TikTok',p=>p==='TikTok'], ['go','Google',p=>/Google/.test(p)] ];
const DS={ seg:null };
const ICO={
  money:'<svg viewBox="0 0 16 16"><path d="M8 1.5v13M11 4.5H6.5a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4H5"/></svg>',
  eye:'<svg viewBox="0 0 16 16"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>',
  cal:'<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 7h12M5.5 1.5v3M10.5 1.5v3"/></svg>',
  tap:'<svg viewBox="0 0 16 16"><path d="M8 14.5a5 5 0 0 0 5-5V8a1.5 1.5 0 0 0-3 0V6.5a1.5 1.5 0 0 0-3 0V2.5a1.5 1.5 0 0 0-3 0V10l-1-1a1.4 1.4 0 0 0-2 2l2.5 2.5"/></svg>',
  check:'<svg viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7"/></svg>'};
function withLoc(loc,fn){ const o=S.loc; S.loc=loc; try{ return fn() } finally { S.loc=o } }
function planCum(){ const out=[]; let s=0; for(let d=1;d<=NDAYS;d++){ s+=CAMPS.reduce((a,c)=>a+(c.amt[d-1]||0),0); out.push(s) } return out }
function realTotal(){ return ACTUALS&&ACTUALS.platforms&&ACTUALS.platforms.length ? ACTUALS.platforms.reduce((s,p)=>s+(p.spent||0),0) : null }
function planBy(test,upto){ return CAMPS.filter(c=>test(c.platform)).reduce((s,c)=>s+c.amt.slice(0,upto).reduce((a,b)=>a+b,0),0) }
function realOf(re){ const p=(ACTUALS&&ACTUALS.platforms||[]).find(x=>re.test(x.name)); return p?(p.spent||0):null }
function monthProgress(){
  return withLoc('all',()=>{ const last=inMonth?TODAY:(now.y*100+now.m>MYEAR*100+MNUM?NDAYS:0); let n=0,t=0; const per=[];
    for(let d=1;d<=NDAYS;d++){ const p=progress(d); per.push(p); if(d<=last){ n+=p.n; t+=p.total } }
    return {n,t,pct:t?Math.round(100*n/t):0,per,last} });
}
function contentMix(last){
  const k={feed:[0,0],story:[0,0],email:[0,0],ads:[0,0]};
  withLoc('all',()=>{ for(let d=1;d<=NDAYS;d++){ dayTasks(d).forEach(t=>{ k[t.kind][0]++; if(d<=last&&done[t.id]) k[t.kind][1]++ }); adTasks(d).forEach(t=>{ k.ads[0]++; if(d<=last&&done[t.id]) k.ads[1]++ }) } });
  return k;
}
function spark(arr){
  if(!arr||arr.length<2) return '';
  const W=120,H=28,m=Math.max(1,...arr), x=i=>i*W/(arr.length-1), y=v=>H-2-(H-4)*v/m;
  const p=arr.map((v,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="ar" d="${p}L${W},${H}L0,${H}Z"/><path d="${p}" vector-effect="non-scaling-stroke"/></svg>`;
}

function renderDashboard(){
  const st=AN[MKEY]; if(!st) loadAN(MKEY); if(!LIVE[MKEY]) loadSpend(MKEY);
  const ga = st&&st.st==='ok' ? st.d : null;
  const bud=(BUDGET&&BUDGET.monthly)||24000, cum=planCum(), real=realTotal(), th=(ACTUALS&&ACTUALS.through)||0;
  const mp=monthProgress(), mix=contentMix(mp.last);
  const pct=real!=null?Math.round(100*real/bud):0, proj=real!=null&&th?real/th*NDAYS:null, planTo=th?cum[th-1]:0;
  let h=`<div class="dash" style="display:flex;flex-direction:column;gap:22px">`;

  /* 1. hero: presupuesto */
  const gc = proj==null?'#5b93ff': proj>bud*1.05?'#ff6b6b': proj<bud*0.85?'#ffb547':'#3ed38b';
  h+=`<section class="dh"><div class="dh-top"><div style="min-width:0"><p class="dh-k">Inversión en anuncios · ${MES}</p>
    <p class="dh-big num">${real==null?'—':money(real)}<small>de ${money(bud)}</small></p>
    <p class="dh-s">${real==null?`Todavía no hay gasto real de ${MES}.`:`Al día ${th} de ${NDAYS}. El plan del Sheet iba en ${money(planTo)} (${real>=planTo?'+':'−'}${money(Math.abs(real-planTo))}).`}</p></div>
    <div class="gauge" style="--p:${Math.min(100,pct)};--gc:${gc}"><i>${pct}%<small>GASTADO</small></i></div></div>
    <div class="dh-bar" aria-hidden="true"><i style="width:${Math.min(100,pct)}%"></i>${th?`<b style="left:calc(${Math.min(100,100*th/NDAYS)}% - 1px)" title="Día del mes"></b>`:''}</div>
    <div class="dh-leg"><span>${proj==null?'Sin proyección':`Al ritmo actual cierras en <b style="color:#edf1f8">${money(proj)}</b>`}</span><span><i style="display:inline-block;width:2px;height:10px;background:#e2c07a;vertical-align:-1px;margin-right:5px"></i>día ${th||'—'}</span></div></section>`;

  /* 2. KPIs */
  const T=ga&&ga.totals, cpr = ga&&real!=null&&ACTUALS.through===ga.through&&ga.events.reserve_click.cur ? real/ga.events.reserve_click.cur : null;
  const kpi=(ico,lbl,val,foot,sp,tab)=>`<${tab?'button data-tab="'+tab+'"':'div'} class="kpi"><small>${ICO[ico]}${lbl}</small><b class="num">${val}</b><span class="kf num">${foot}</span>${sp||''}</${tab?'button':'div'}>`;
  const gaWait = !st||st.st==='loading' ? 'Cargando…' : 'Sin conexión a Analytics';
  h+=`<section class="sec"><h2>Resumen <span>${inMonth?'del 1 a hoy':'mes completo'}</span></h2><div class="kpis">`+
    kpi('eye','Visitas a la web',T?num(T.cur.sessions):'—',T?`${chg(T.cur.sessions,T.prev.sessions)} vs ${MES_ES[ga.prevMonth]}`:gaWait,T?spark(ga.daily.cur.sessions.slice(0,ga.through)):'','analytics')+
    kpi('tap','Clics en Reservar',T?num(T.cur.reserves):'—',T?`${chg(T.cur.reserves,T.prev.reserves)} vs ${MES_ES[ga.prevMonth]}`:gaWait,T?spark(ga.daily.cur.reserves.slice(0,ga.through)):'','analytics')+
    kpi('money','Costo por clic en Reservar',cpr==null?'—':'$'+cpr.toFixed(2),cpr==null?(T?'Falta gasto real del mismo día':gaWait):'gasto real ÷ clics','', 'ads')+
    kpi('check','Plan cumplido',`${mp.pct}%`,`${mp.n} de ${mp.t} tareas hasta hoy`,`<div class="track" style="margin-top:8px"><i style="width:${mp.pct}%;background:var(--ok)"></i></div>`,'hoy')+
  `</div></section>`;

  /* 3. insights */
  const ins=[];
  if(proj!=null&&th<3) ins.push(['info','i',`Apenas van ${th} ${th===1?'día':'días'} de gasto real; la proyección se vuelve confiable desde el día 3.`]);
  else if(proj!=null){ const r=proj/bud; ins.push(r>1.05?['bad','!',`Vas rápido: al ritmo de hoy cierras en ${money(proj)}, ${money(proj-bud)} arriba del presupuesto. Baja el gasto diario a ${money(Math.max(0,bud-real)/Math.max(1,NDAYS-th))}.`]: r<0.85?['warn','↓',`Vas lento: proyectas ${money(proj)}. Te quedan ${money(bud-real)} para ${Math.max(1,NDAYS-th)} días (unos ${money((bud-real)/Math.max(1,NDAYS-th))} al día).`]:['ok','✓',`Gasto en ritmo: proyectas ${money(proj)} de ${money(bud)}.`]) }
  if(T){ const r=pctCh(T.cur.sessions,T.prev.sessions); if(r!=null) ins.push([r>=0?'ok':'warn',r>=0?'▲':'▼',`Visitas ${r>=0?'arriba':'abajo'} ${Math.abs(Math.round(r*100))}% contra los mismos días de ${MES_ES[ga.prevMonth]}.`]);
    const top=ga.channels.filter(c=>c.cur.reserves).sort((a,b)=>b.cur.reserves-a.cur.reserves)[0]; if(top) ins.push(['info','★',`${chName(top.name)} trae más clics en Reservar: ${num(top.cur.reserves)}.`]) }
  if(mp.last){ const late=mp.per.slice(0,mp.last-(inMonth?1:0)).filter(p=>p.total&&p.pct<50).length; if(late) ins.push(['warn','✎',`${late} ${late===1?'día quedó':'días quedaron'} con menos de la mitad del plan marcado. Revisa el mapa de abajo.`]) }
  if(ins.length) h+=`<section class="sec"><h2>Lo que dice el tablero</h2><div class="group ins">${ins.map(i=>`<p><span class="ic ${i[0]}">${i[1]}</span><span>${esc(i[2])}</span></p>`).join('')}</div></section>`;

  /* 4. ritmo de gasto */
  h+=`<section class="sec"><h2>Ritmo de gasto <span>plan acumulado vs real</span></h2><div class="group dchart"><div class="lg2"><span><i class="ln"></i>Plan del Sheet</span><span><i class="ln g"></i>Presupuesto</span>${real!=null?'<span><i class="dt"></i>Gastado real</span><span><i class="ln p"></i>Proyección</span>':''}</div><div id="dspend"></div><div class="dtip" id="dspendt" hidden></div></div>
    <details class="more"><summary>Ver como tabla</summary><div class="group scroll-x" style="margin-top:8px"><table class="thr" style="min-width:0"><thead><tr><th>Día</th><th>Plan del día</th><th>Plan acumulado</th></tr></thead><tbody>${cum.map((v,i)=>`<tr><td>${i+1}</td><td class="num">${money(v-(i?cum[i-1]:0))}</td><td class="num">${money(v)}</td></tr>`).join('')}</tbody></table></div></details></section>`;

  /* 5. dónde va el dinero */
  const pl=PG.map(([k,n,t])=>({k,n,v:planBy(t,NDAYS)})), ptot=pl.reduce((s,x)=>s+x.v,0);
  h+=`<section class="sec"><h2>Dónde va el dinero <span>plan de ${MES}</span></h2><div class="group"><div class="donut-w ${DS.seg?'hl':''}" id="donut">${donut(pl,ptot)}<div class="dl2">${pl.map(x=>`<button data-dseg="${x.k}" aria-pressed="${DS.seg===x.k}"><span class="sw2" style="background:var(--p-${x.k})"></span><span class="n">${x.n}</span><span class="v"><b>${money(x.v)}</b>${Math.round(100*x.v/ptot)}%</span></button>`).join('')}</div></div></div></section>`;

  /* 6. plan vs real por plataforma */
  if(real!=null&&th){
    const rows=[['Meta',/Meta/,p=>/Instagram|^FB|Remarketing/.test(p),'fb','Instagram + Facebook'],['TikTok',/TikTok/,p=>p==='TikTok','tt',''],['Google',/Google/,p=>/Google/.test(p),'go','Search + PMax']];
    const mx=Math.max(1,...rows.map(r=>Math.max(planBy(r[2],th),realOf(r[1])||0)));
    h+=`<section class="sec"><h2>Plan vs real <span>del 1 al ${th}</span></h2><div class="group">`+rows.map(([n,re,t,k,sub])=>{ const p=planBy(t,th), r=realOf(re); const d=r==null?null:r-p;
      return `<div class="pvr"><div class="row"><span><span class="sw2" style="background:var(--p-${k});margin-right:8px;vertical-align:-1px"></span>${n}${sub?` <span style="color:var(--fg3);font-weight:500;font-size:12px">${sub}</span>`:''}</span><span class="num">${d==null?'—':`<span class="chg ${Math.abs(d)<p*0.05?'flat':d>0?'down':'up'}">${d>=0?'+':'−'}${money(Math.abs(d))}</span> vs plan`}</span></div>
      <div class="bars2"><div class="b2"><span>Plan</span><div class="tr"><i class="pln" style="width:${100*p/mx}%"></i></div><b>${money(p)}</b></div><div class="b2"><span>Real</span><div class="tr"><i style="width:${100*(r||0)/mx}%;background:var(--p-${k})"></i></div><b>${r==null?'—':money(r)}</b></div></div></div>` }).join('')+`</div><p class="note">Real según ${esc(ACTUALS.updated)}. Rojo = gastaste más que el plan; verde = menos.</p></section>`;
  }

  /* 7. visitas por día (GA) */
  if(ga){
    h+=`<section class="sec"><h2>Visitas por día <span>${cap1(MES)} vs ${cap1(MES_ES[ga.prevMonth])}</span></h2><div class="group dchart"><div class="lg2"><span><i class="sw2" style="background:var(--c-cur)"></i>${cap1(MES)}</span><span><i class="ln pv"></i>${cap1(MES_ES[ga.prevMonth])}</span></div><div id="dvis"></div><div class="dtip" id="dvist" hidden></div></div></section>`;
    const ch=ga.channels.filter(c=>c.cur.sessions).slice(0,6), mc=Math.max(1,...ch.map(c=>c.cur.sessions)), tot=ch.reduce((s,c)=>s+c.cur.sessions,0)||1;
    h+=`<section class="sec"><h2>De dónde llega la gente <span>visitas</span></h2><div class="group">`+ch.map(c=>`<button class="hbar" data-tab="analytics"><div class="row"><span>${esc(chName(c.name))}</span><span class="num">${num(c.cur.sessions)} · ${Math.round(100*c.cur.sessions/T.cur.sessions)}%</span></div><div class="tr"><i style="width:${100*c.cur.sessions/mc}%"></i></div><small>${num(c.cur.reserves)} clics en Reservar · ${chg(c.cur.sessions,c.prev.sessions)}</small></button>`).join('')+`</div></section>`;
  } else if(st&&st.st==='err'){
    h+=`<section class="sec"><h2>Web</h2><div class="group"><div class="empty-s">${esc((st.d&&st.d.error)||'No se pudo leer Google Analytics.')} <button class="linkbtn" data-anreload="1">Intentar otra vez</button></div></div></section>`;
  }

  /* 8. por sucursal (plan) */
  const LS=[['SA','San Antonio'],['PLANO','Plano'],['IRVING','Irving'],['DFW','Plano + Irving (compartido)'],['ALL','Las 3 sucursales']];
  const bl=LS.map(([t,n])=>({n,v:CAMPS.filter(c=>campTag(c)===t).reduce((s,c)=>s+c.amt.reduce((a,b)=>a+b,0),0)})).filter(x=>x.v), ml=Math.max(1,...bl.map(x=>x.v));
  const sa=bl.find(x=>x.n==='San Antonio')?.v||0, dfw=bl.filter(x=>/Plano|Irving/.test(x.n)).reduce((s,x)=>s+x.v,0);
  h+=`<section class="sec"><h2>Por sucursal <span>plan · DFW ${Math.round(100*dfw/Math.max(1,sa+dfw))}% / SA ${Math.round(100*sa/Math.max(1,sa+dfw))}%</span></h2><div class="group">`+bl.map(x=>`<div class="hbar"><div class="row"><span>${x.n}</span><span class="num">${money(x.v)} · ${Math.round(100*x.v/ptot)}%</span></div><div class="tr"><i style="width:${100*x.v/ml}%"></i></div></div>`).join('')+`</div></section>`;

  /* 9. contenido */
  const mk=(l,a)=>`<div class="kpi"><small>${l}</small><b class="num">${a[1]}<span style="font-size:13px;color:var(--fg3);font-weight:500">/${a[0]}</span></b><div class="tr"><i style="width:${a[0]?100*a[1]/a[0]:0}%"></i></div></div>`;
  h+=`<section class="sec"><h2>Contenido del mes <span>hechos / planeados</span></h2><div class="mix">${mk('Reels y posts',mix.feed)}${mk('Stories',mix.story)}${mk('Emails',mix.email)}${mk('Cambios de anuncios',mix.ads)}</div></section>`;

  /* 10. mapa de avance */
  let hm=`<div class="heat">`+DOW3.map(x=>`<div class="dow">${x}</div>`).join('');
  for(let i=0;i<dow(1);i++) hm+=`<div class="hc empty"></div>`;
  for(let d=1;d<=NDAYS;d++){ const p=mp.per[d-1], fut=d>mp.last;
    const a=fut?0:Math.round(12+0.88*p.pct); const bg=fut?'':`background:color-mix(in srgb,var(--ok) ${p.pct?a:0}%,var(--surface2));${p.pct>55?'color:#fff':''}`;
    hm+=`<button class="hc ${fut?'fut':''} ${inMonth&&d===TODAY?'td':''}" data-go="${d}" style="${bg}" aria-label="${dayLabel(d)}: ${fut?'por venir':p.pct+'% hecho'}">${d}${fut?'':`<small>${p.pct}%</small>`}</button>` }
  hm+=`</div><div class="heat-leg"><span>0%</span>${[0,25,50,75,100].map(v=>`<i style="background:color-mix(in srgb,var(--ok) ${v?Math.round(12+.88*v):0}%,var(--surface2))"></i>`).join('')}<span>100%</span><span style="margin-left:auto">Toca un día para abrirlo</span></div>`;
  h+=`<section class="sec"><h2>Mapa de avance <span>% del plan marcado</span></h2><div class="group">${hm}</div><p class="note">Las casillas se guardan en este navegador. En otro dispositivo el avance sale vacío.</p></section>`;

  h+=`<section class="sec"><h2>Conexiones <span>de dónde salen los números</span></h2><div class="group">${connRows()}</div><p class="note">Todas se leen con llaves de solo lectura desde el servidor de la app. No inician sesión en tus cuentas.</p></section>`;
  const age=st&&st.at?Math.round((Date.now()-st.at)/60000):null;
  h+=`<p class="note">Fuentes: plan del Google Sheet de ${MES}; gasto real de Meta, TikTok y Google (${ACTUALS&&ACTUALS.updated?esc(ACTUALS.updated):'sin datos'}); web de Google Analytics${age!=null&&ga?` (leído ${age<1?'hace un momento':'hace '+age+' min'})`:''}. <button class="linkbtn" data-refresh="1">Actualizar</button></p>`;
  return h+`</div>`;
}

function donut(pl,tot){
  const R=64,r=40,C=68; let a0=-Math.PI/2, out='';
  const pt=(a,rad)=>[C+rad*Math.cos(a),C+rad*Math.sin(a)];
  pl.forEach(x=>{ if(!x.v) return; const a1=a0+2*Math.PI*x.v/tot, lg=a1-a0>Math.PI?1:0;
    const [x1,y1]=pt(a0,R),[x2,y2]=pt(a1,R),[x3,y3]=pt(a1,r),[x4,y4]=pt(a0,r);
    out+=`<path class="${DS.seg===x.k?'on':''}" data-dseg="${x.k}" d="M${x1},${y1}A${R},${R} 0 ${lg} 1 ${x2},${y2}L${x3},${y3}A${r},${r} 0 ${lg} 0 ${x4},${y4}Z" fill="var(--p-${x.k})" stroke="var(--surface)" stroke-width="2"><title>${x.n}: ${money(x.v)} (${Math.round(100*x.v/tot)}%)</title></path>`; a0=a1 });
  const s=DS.seg&&pl.find(x=>x.k===DS.seg);
  return `<svg viewBox="0 0 136 136" role="img" aria-label="Plan de inversión por plataforma">${out}<text x="68" y="68" text-anchor="middle" class="c1">${money(s?s.v:tot)}</text><text x="68" y="84" text-anchor="middle" class="c2">${s?s.n.toUpperCase():'TOTAL'}</text></svg>`;
}

function tipAt(tip,box,xpx,html){ tip.hidden=false; tip.innerHTML=html; const W=box.clientWidth; tip.style.left=Math.min(Math.max(xpx-tip.offsetWidth/2+10,4),W-tip.offsetWidth+16)+'px' }
function drawDashSpend(){
  const box=document.getElementById('dspend'); if(!box) return;
  const tip=document.getElementById('dspendt'), cum=planCum(), N=NDAYS, bud=(BUDGET&&BUDGET.monthly)||24000, real=realTotal(), th=(ACTUALS&&ACTUALS.through)||0;
  const proj=real!=null&&th?real/th*N:null;
  const W=box.clientWidth||340, H=210, L=46, Rm=10, Tm=12, B=22;
  const top0=Math.max(cum[N-1],bud,proj||0,real||0)*1.08, step=niceStep(top0/4), top=Math.ceil(top0/step)*step;
  const x=i=>L+i*(W-L-Rm)/(N-1), y=v=>Tm+(H-Tm-B)*(1-v/top);
  const kfmt=v=>v>=1000?'$'+(v/1000).toFixed(v%1000?1:0)+'k':'$'+v;
  let g=`<defs><linearGradient id="dgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>`;
  for(let v=0;v<=top+1e-9;v+=step) g+=`<line x1="${L}" x2="${W-Rm}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L-6}" y="${y(v)+4}" class="ax" text-anchor="end">${kfmt(v)}</text>`;
  [1,8,15,22,N].forEach(dd=>g+=`<text x="${x(dd-1)}" y="${H-5}" class="ax" text-anchor="middle">${dd}</text>`);
  const p=cum.map((v,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  g+=`<path d="${p}L${x(N-1)},${y(0)}L${x(0)},${y(0)}Z" class="planar"/><path d="${p}" class="plan"/>`;
  g+=`<line x1="${L}" x2="${W-Rm}" y1="${y(bud)}" y2="${y(bud)}" class="bud"/><text x="${W-Rm}" y="${y(bud)-6}" class="lbl" text-anchor="end">Presupuesto ${money(bud)}</text>`;
  if(inMonth) g+=`<line x1="${x(TODAY-1)}" x2="${x(TODAY-1)}" y1="${Tm}" y2="${H-B}" class="today"/><text x="${x(TODAY-1)}" y="${Tm-2}" class="ax" text-anchor="middle">hoy</text>`;
  if(real!=null&&th){ g+=`<line x1="${x(th-1)}" y1="${y(real)}" x2="${x(N-1)}" y2="${y(proj)}" class="proj"/><circle cx="${x(th-1)}" cy="${y(real)}" r="5.5" class="real ${proj>bud*1.05?'realbad':''}"/>`;
    const lx=x(th-1), anchor=lx>W*0.7?'end':'start'; g+=`<text x="${lx+(anchor==='end'?-9:9)}" y="${y(real)+(y(real)<Tm+20?16:-8)}" class="lbl" text-anchor="${anchor}">${money(real)}</text>` }
  g+=`<line id="dsx" class="xh" y1="${Tm}" y2="${H-B}" x1="-10" x2="-10"/><circle id="dsc" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2" cx="-10" cy="-10"/>`;
  box.innerHTML=`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto acumulado planeado por día contra el presupuesto">${g}<rect class="hit" x="${L}" y="0" width="${W-L-Rm}" height="${H}"/></svg>`;
  const svg=box.firstElementChild;
  const show=ev=>{ const r=svg.getBoundingClientRect(), i=Math.max(0,Math.min(N-1,Math.round((ev.clientX-r.left-L)/((W-L-Rm)/(N-1)))));
    svg.querySelector('#dsx').setAttribute('x1',x(i)); svg.querySelector('#dsx').setAttribute('x2',x(i)); const c=svg.querySelector('#dsc'); c.setAttribute('cx',x(i)); c.setAttribute('cy',y(cum[i]));
    const day=cum[i]-(i?cum[i-1]:0);
    tipAt(tip,box,x(i),`<b>${cap1(dayLabel(i+1))}</b><span><i class="sw2" style="background:var(--accent)"></i>Plan acumulado <b>${money(cum[i])}</b></span><span>Plan de ese día <b>${money(day)}</b></span>${real!=null&&i+1===th?`<span><i class="sw2" style="background:var(--ok);border-radius:50%"></i>Gastado real <b>${money(real)}</b></span>`:''}${proj!=null&&i===N-1?`<span>Proyección <b>${money(proj)}</b></span>`:''}`) };
  svg.addEventListener('pointermove',show); svg.addEventListener('pointerdown',show);
  svg.addEventListener('pointerleave',()=>{ tip.hidden=true; ['x1','x2'].forEach(a=>svg.querySelector('#dsx').setAttribute(a,-10)); svg.querySelector('#dsc').setAttribute('cx',-10) });
}
function drawDashVisits(){
  const box=document.getElementById('dvis'), st=AN[MKEY]; if(!box||!st||st.st!=='ok') return;
  const tip=document.getElementById('dvist'), d=st.d, N=d.ndays, cur=d.daily.cur.sessions.slice(0,d.through), prev=d.daily.prev.sessions.slice(0,N);
  const W=box.clientWidth||340, H=180, L=40, Rm=8, Tm=10, B=22, bw=(W-L-Rm)/N;
  const mx=Math.max(1,...cur,...prev), step=niceStep(mx/3), top=Math.ceil(mx/step)*step, y=v=>Tm+(H-Tm-B)*(1-v/top), cx=i=>L+bw*i+bw/2;
  let g=''; for(let v=0;v<=top+1e-9;v+=step) g+=`<line x1="${L}" x2="${W-Rm}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L-6}" y="${y(v)+4}" class="ax" text-anchor="end">${num(v)}</text>`;
  [1,8,15,22,N].forEach(dd=>g+=`<text x="${cx(dd-1)}" y="${H-5}" class="ax" text-anchor="middle">${dd}</text>`);
  const w=Math.max(2,Math.min(14,bw-2));
  cur.forEach((v,i)=>{ if(!v) return; const yy=y(v), hh=y(0)-yy, rr=Math.min(4,w/2,hh); g+=`<path class="bar ${d.current&&i===d.through-1?'inc':''}" d="M${cx(i)-w/2},${y(0)}V${yy+rr}Q${cx(i)-w/2},${yy} ${cx(i)-w/2+rr},${yy}H${cx(i)+w/2-rr}Q${cx(i)+w/2},${yy} ${cx(i)+w/2},${yy+rr}V${y(0)}Z"/>` });
  g+=`<path class="pl" d="${prev.map((v,i)=>`${i?'L':'M'}${cx(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}"/>`;
  g+=`<line id="dvx" class="xh" y1="${Tm}" y2="${H-B}" x1="-10" x2="-10"/>`;
  box.innerHTML=`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Visitas por día a brasaousa.com">${g}<rect class="hit" x="${L}" y="0" width="${W-L-Rm}" height="${H}"/></svg>`;
  const svg=box.firstElementChild, P=cap1(MES_ES[d.prevMonth]);
  const show=ev=>{ const r=svg.getBoundingClientRect(), i=Math.max(0,Math.min(N-1,Math.floor((ev.clientX-r.left-L)/bw)));
    ['x1','x2'].forEach(a=>svg.querySelector('#dvx').setAttribute(a,cx(i)));
    tipAt(tip,box,cx(i),`<b>Día ${i+1}</b><span><i class="sw2" style="background:var(--c-cur)"></i>${cap1(MES)} <b>${i<cur.length?num(cur[i]):'—'}</b>${d.current&&i===d.through-1?' (incompleto)':''}</span><span><i class="sw2" style="background:var(--c-prev)"></i>${P} <b>${i<prev.length?num(prev[i]):'—'}</b></span>`) };
  svg.addEventListener('pointermove',show); svg.addEventListener('pointerdown',show);
  svg.addEventListener('pointerleave',()=>{ tip.hidden=true; ['x1','x2'].forEach(a=>svg.querySelector('#dvx').setAttribute(a,-10)) });
}
function drawDash(){ drawDashSpend(); drawDashVisits() }
addEventListener('resize',()=>{ if(S.tab==='dashboard') drawDash() });

/* ---------- shell ---------- */
const ICONS={
  dashboard:'<svg viewBox="0 0 26 26"><rect x="4" y="4" width="8" height="10" rx="2"/><rect x="14" y="4" width="8" height="6" rx="2"/><rect x="14" y="12" width="8" height="10" rx="2"/><rect x="4" y="16" width="8" height="6" rx="2"/></svg>',
  hoy:'<svg viewBox="0 0 26 26"><circle cx="13" cy="13" r="9"/><path d="M13 8v5l3.5 2"/></svg>',
  semana:'<svg viewBox="0 0 26 26"><rect x="4" y="5.5" width="18" height="16" rx="3"/><path d="M4 11h18M9 3.5v4M17 3.5v4"/></svg>',
  ads:'<svg viewBox="0 0 26 26"><path d="M4 20V13M10 20V7M16 20v-9M22 20V4"/></svg>',
  guia:'<svg viewBox="0 0 26 26"><path d="M5 5.5A2.5 2.5 0 0 1 7.500 3H21v17H7.500A2.500 2.500 0 0 0 5 22.500z"/><path d="M5 5.500V22.500M10 8h7"/></svg>',
  analytics:'<svg viewBox="0 0 26 26"><path d="M4 21h18"/><path d="M5 16l5-5 4 3 7-8"/><path d="M17 6h4v4"/></svg>'};
const TABS=[['dashboard','Dashboard'],['hoy','Hoy'],['semana','Semana'],['ads','Anuncios'],['analytics','Analíticos'],['guia','Guía']];
function renderBar(){
  let h='';
  if(S.tab==='hoy'){
    h+=`<div class="title-row"><div><h1 class="large">${S.day===TODAY&&inMonth?'Hoy':cap1(DOW[dow(S.day)])}</h1><p class="sub">${cap1(dayLabel(S.day))}</p></div>
      <div class="daynav"><button class="circ" data-step="-1" aria-label="Día anterior" ${S.day<=1?'disabled':''}>‹</button>${S.day!==TODAY?'<button class="pill-btn" data-today="1">Hoy</button>':''}<button class="circ" data-step="1" aria-label="Día siguiente" ${S.day>=NDAYS?'disabled':''}>›</button></div></div>`;
  } else {
    const t={dashboard:['Dashboard',`Todo ${MES} de un vistazo`],semana:['Semana','Elige un día del mes'],ads:['Anuncios',`Plan del día ${S.day} de ${MES}`],analytics:['Analíticos',`Google Analytics · ${MES} contra ${MES_ES[prevM(MNUM)]}`],guia:['Guía','Reglas, alertas y metas']}[S.tab];
    const rfb=(S.tab==='dashboard'||S.tab==='ads')?`<button class="rf ${busy()?'busy':''}" data-refresh="1" aria-label="Actualizar gasto y analíticos" title="Actualizar" ${busy()?'aria-busy="true"':''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg></button>`:'';
    const sub2=(S.tab==='dashboard'||S.tab==='ads')&&ACTUALS&&ACTUALS.updated?`${t[1]} · gasto ${esc(ACTUALS.updated.split(' · ')[0])}`:t[1];
    h+=`<div class="title-row"><div style="min-width:0"><h1 class="large">${t[0]}</h1><p class="sub">${sub2}</p></div>${rfb}</div>`;
  }
  if(S.tab==='hoy'||S.tab==='ads') h+=`<div class="seg" role="group" aria-label="Sucursal">`+LOCS.map(l=>`<button data-loc="${l[0]}" aria-pressed="${S.loc===l[0]}">${l[1]}</button>`).join('')+`</div>`;
  $('#barin').innerHTML=h;
}
function renderMonths(){
  $('#months').innerHTML=MKEYS.map(m=>`<button data-month="${m}" aria-pressed="${m===MKEY}">${cap1(MES_ES[ym(m).m])}${ym(m).y!==2026?' '+ym(m).y:''}</button>`).join('');
  $('#months').style.gridTemplateColumns=`repeat(${MKEYS.length},1fr)`;
  $('#mlabel').textContent=`Plan de ${MES} ${MYEAR}`;
}
function render(){
  CLIPS=[]; renderMonths(); renderBar();
  $('#view').innerHTML = S.tab==='dashboard'?renderDashboard():S.tab==='hoy'?renderHoy():S.tab==='semana'?renderSemana():S.tab==='ads'?renderAds():S.tab==='analytics'?renderAnalytics():renderGuia();
  if(S.tab==='analytics') drawChart();
  if(S.tab==='dashboard') drawDash();
  $('#tabs').innerHTML=TABS.map(t=>`<button data-tab="${t[0]}" ${S.tab===t[0]?'aria-current="page"':''}>${ICONS[t[0]]}<span>${t[1]}</span></button>`).join('');
  document.title='Plan Diario Brasão';
}
function updateProgress(){
  const pr=progress(S.day), r=document.querySelector('.ring'); if(!r) return;
  r.style.setProperty('--p',pr.pct); r.firstElementChild.textContent=pr.pct+'%';
  const sp=visibleAds(S.day).reduce((s,a)=>s+a.amt,0); $('#prog').textContent=`${pr.n} de ${pr.total} hechas · anuncios del día ${money(sp)}`;
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  if(b.dataset.k){ const k=b.dataset.k; done[k]=!done[k]; if(!done[k]) delete done[k]; saveDone();
    document.querySelectorAll(`[data-k="${k}"]`).forEach(x=>{x.setAttribute('aria-pressed',!!done[k]); const row=x.closest('[data-row]'); if(row) row.classList.toggle('done',!!done[k])}); updateProgress(); if(!b.closest('#nowcard')) refreshNow(); else setTimeout(refreshNow,600); return }
  if(b.dataset.c!==undefined){ copyText(CLIPS[+b.dataset.c]); return }
  if(b.dataset.month){ const m=+b.dataset.month; if(m!==MKEY){ setMonth(m); store.set('month',m); S.day=TODAY; S.plat='all'; render(); scrollTo(0,0) } return }
  if(b.dataset.tab){ S.tab=b.dataset.tab; render(); scrollTo(0,0); return }
  if(b.dataset.loc){ S.loc=b.dataset.loc; store.set('loc',S.loc); const y=scrollY; render(); scrollTo(0,y); return }
  if(b.dataset.step){ S.day=Math.min(NDAYS,Math.max(1,S.day+ +b.dataset.step)); render(); scrollTo(0,0); return }
  if(b.dataset.today){ S.day=TODAY; render(); scrollTo(0,0); return }
  if(b.dataset.go){ S.day=+b.dataset.go; S.tab='hoy'; render(); scrollTo(0,0); return }
  if(b.dataset.anm){ ANS.metric=b.dataset.anm; const y=scrollY; render(); scrollTo(0,y); return }
  if(b.dataset.anreload){ loadAN(MKEY,true); const y=scrollY; render(); scrollTo(0,y); return }
  if(b.dataset.refresh){ if(!busy()) refreshAll(); return }
  if(b.dataset.dseg){ DS.seg=DS.seg===b.dataset.dseg?null:b.dataset.dseg; const y=scrollY; render(); scrollTo(0,y); return }
  if(b.dataset.plat){ S.plat=b.dataset.plat; const y=scrollY; render(); scrollTo(0,y); return }
});
document.addEventListener('click',e=>{ const p=e.target.closest('path[data-dseg]'); if(!p) return; DS.seg=DS.seg===p.dataset.dseg?null:p.dataset.dseg; const y=scrollY; render(); scrollTo(0,y) });
addEventListener('scroll',()=>$('#bar').classList.toggle('scrolled',scrollY>8),{passive:true});
render();
