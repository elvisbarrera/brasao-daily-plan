const D = DATA.days, CAMPS = DATA.camps;
const MES = 'octubre', DOW = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const DOW3 = ['dom','lun','mar','mié','jue','vie','sáb'];
const LOCS = [['all','Todas'],['sa','San Antonio'],['plano','Plano'],['irving','Irving']];
const LOCNAME = {sa:'San Antonio',plano:'Plano',irving:'Irving'};
const $ = s => document.querySelector(s);
const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dow = d => new Date(Date.UTC(2026,9,d)).getUTCDay();
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
const inMonth = now.y===2026 && now.m===10;
const TODAY = inMonth ? now.d : (now.y*100+now.m < 202610 ? 1 : 31);
const NOWMIN = inMonth ? now.min : -1;

const S = { tab:'hoy', day:TODAY, loc: store.get('loc')||'all', plat:'all' };
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

/* ---------- views ---------- */
function visibleAds(d){ return D[d].ads.filter(a=>tagOK(campTag(CAMPS[a.i]))) }
function dayTasks(d){
  const day=D[d], list=[];
  if(day.feed) list.push({id:`${d}:feed`,t:mins(day.feed.time),kind:'feed',x:day.feed});
  day.stories.forEach((s,i)=>{ if(tagOK(tag(s.loc))) list.push({id:`${d}:s${i}`,t:mins(s.time),kind:'story',x:s}) });
  if(day.email){ const m=day.email.send.match(/(\d+(?::\d+)?\s*[AP]M)/i); list.push({id:`${d}:email`,t:m?mins(m[1]):600,kind:'email',x:day.email}) }
  list.sort((a,b)=>a.t-b.t);
  return list;
}
function adTasks(d){ const out=[]; visibleAds(d).forEach(a=>{ if(a.on) out.push({id:`${d}:ad${a.i}:on`}); if(a.off) out.push({id:`${d}:ad${a.i}:off`}) }); return out }
function routine(d){
  const r=[{id:`${d}:r1`,txt:'Comparte en tus Stories lo que los clientes publicaron y te etiquetaron.',sub:'Todos los días'}];
  if(d>=5) r.push({id:`${d}:r2`,txt:'Revisa los leads de eventos privados. El gerente de cada sucursal responde en menos de 24 horas.',sub:'Plan Book December'});
  if(dow(d)===1) r.push(
    {id:`${d}:w1`,txt:'Anota el gasto real de la semana en el Spend Tracker (celdas amarillas).',sub:'Lunes'},
    {id:`${d}:w2`,txt:'Compara tus métricas con las alertas de la pestaña Guía y pausa lo que esté en rojo.',sub:'Lunes'},
    {id:`${d}:w3`,txt:'Programa 1 post de Google Business Profile por sucursal esta semana.',sub:'Semanal'});
  return r;
}
function progress(d){
  const ids=[...dayTasks(d).map(t=>t.id),...adTasks(d).map(t=>t.id),...routine(d).map(t=>t.id)];
  const n=ids.filter(i=>done[i]).length; return {n,total:ids.length,pct:ids.length?Math.round(100*n/ids.length):0};
}
function chk(id){ return `<button class="chk" data-k="${id}" aria-pressed="${!!done[id]}" aria-label="Marcar como hecho"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.5l3 3 6-7"/></svg></button>` }

function adDetails(c){
  const i=c.info||{};
  const rows=[['Objetivo',i.objective],['Audiencia',i.audience],['Qué mostrar',i.creative],['Formato',i.format],['Botón (CTA)',i.cta],['Duración',i.flights],['Total',c.total]].filter(r=>r[1]);
  return `<dl class="dl">${rows.map(r=>`<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>`;
}

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
  h+=`<div class="hero"><div class="ring" style="--p:${pr.pct}"><i class="num">${pr.pct}%</i></div><div><p id="intro">${intro}</p><small class="num" id="prog">${pr.n} de ${pr.total} hechas · anuncios del día ${money(spend)}</small></div></div>`;
  if(!inMonth && d===TODAY) h+=`<p class="note">El plan cubre del 1 al 31 de octubre de 2026. Estás viendo el ${d===1?'primer':'último'} día.</p>`;

  if(evs.length){
    h+=`<section class="sec"><h2>Fechas importantes</h2><div class="group">`+evs.map(e=>{
      const cls=e.type==='Guardrail'?'warn':/Game/.test(e.type)?'game':'';
      const lbl=e.type==='Guardrail'?'Cuidado':/Game/.test(e.type)?'Juego':/Brasão/.test(e.type)?'Brasão':'Evento';
      return `<details class="ev"><summary><span class="badge ${cls}">${lbl}</span><span class="e-name">${esc(e.event)}</span></summary><p class="e-body"><b>Por qué importa:</b> ${esc(e.why)}</p><p class="e-body"><b>Qué hacer:</b> ${esc(e.play)}</p></details>`}).join('')+`</div></section>`;
  }

  /* ads */
  if(ads.length){
    const grp=(label,arr,cls,txt)=>arr.length?`<div class="group" style="margin-top:8px">${arr.map(a=>{const c=CAMPS[a.i];
      const k=`${d}:ad${a.i}:`+(cls==='on'?'on':cls==='off'?'off':'x');
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
  let h=`<section class="sec"><h2>Octubre 2026</h2><div class="group"><div class="cal">`+DOW3.map(x=>`<div class="dow">${x}</div>`).join('');
  for(let i=0;i<dow(1);i++) h+=`<div class="cell empty"></div>`;
  for(let d=1;d<=31;d++){
    const sp=D[d].ads.reduce((s,a)=>s+a.amt,0), star=D[d].events.some(e=>/★/.test(e.event)||/Game|Observance|Holiday|Brazilian|Cultural/.test(e.type)&&e.start===e.end);
    h+=`<button class="cell ${d===TODAY&&inMonth?'today':''} ${d===S.day?'sel':''}" data-go="${d}" aria-label="${dayLabel(d)}"><b>${d}</b><small>${money(sp)}</small>${star?'<span class="st">★</span>':''}</button>`;
  }
  h+=`</div></div><p class="note">★ día con fecha clave. Toca un día para ver qué hacer.</p></section>`;
  const from=S.day, to=Math.min(31,from+6);
  h+=`<section class="sec"><h2>Próximos días</h2><div class="group">`;
  for(let d=from;d<=to;d++){
    const day=D[d], ev=day.events.filter(e=>/★/.test(e.event)||e.start===e.end)[0]||day.events[0];
    const top = day.feed?(day.feed.theme||day.feed.topic):'Sin publicación';
    h+=`<button class="drow" data-go="${d}"><span class="d"><span>${DOW3[dow(d)]}</span><b>${d}</b></span><span class="x"><p>${esc(top)}</p><small>${day.feed?1:0} post · ${day.stories.length} stories${day.email?' · email':''} · ${money(day.ads.reduce((s,a)=>s+a.amt,0))} en anuncios</small></span></button>`;
  }
  return h+`</div></section>`;
}

function renderAds(){
  let REALH='';
  const total=CAMPS.reduce((s,c)=>s+c.amt.reduce((a,b)=>a+b,0),0);
  const upto=d=>CAMPS.reduce((s,c)=>s+c.amt.slice(0,d).reduce((a,b)=>a+b,0),0);
  const spent=upto(S.day), todaySp=visibleAds(S.day).reduce((s,a)=>s+a.amt,0);
  let h='';
  /* real spend */
  if(typeof ACTUALS!=='undefined' && ACTUALS.platforms){
    const th=ACTUALS.through||S.day;
    const real=ACTUALS.platforms.reduce((s,p)=>s+(p.spent||0),0);
    const plan=CAMPS.filter(c=>!/Google/.test(c.platform)).reduce((s,c)=>s+c.amt.slice(0,th).reduce((a,b)=>a+b,0),0);
    const diff=real-plan;
    const bud=(typeof BUDGET!=='undefined'&&BUDGET.monthly)||24000, com=(typeof BUDGET!=='undefined'&&BUDGET.committed)||0, left=bud-real-com, dl=Math.max(1,31-th), pace=real/th*31, pct=Math.min(100,Math.round(100*(real+com)/bud));
    REALH=`<section class="sec"><h2>Gasto real <span>actualizado ${esc(ACTUALS.updated)}</span></h2><div class="tiles"><div class="tile"><small>Gastado</small><b class="num">${money(real)}</b></div><div class="tile"><small>Presupuesto</small><b class="num">${money(bud)}</b></div><div class="tile"><small>${left>=0?'Libre':'Te pasaste'}</small><b class="num" style="color:var(--${left>=0?'ok':'bad'})">${money(Math.abs(left))}</b></div></div><div class="group" style="margin-top:8px"><div class="pbar"><div class="row"><span>${pct}% del presupuesto (gastado + comprometido), día ${th} de 31</span><span class="num">+ ${money(com)} comprometido</span></div><div class="track"><i style="width:${pct}%"></i></div><p class="note" style="padding:8px 0 0">Ya comprometido hasta el 31: ${money(com)} (${esc((BUDGET&&BUDGET.committedNote)||'')}). ${left>=0?'Libre para todo lo demás: '+money(left)+' (unos '+money(left/dl)+' al día, '+dl+' días)':'Te pasarías por '+money(-left)}.</p></div></div><div class="group" style="margin-top:8px">`+ACTUALS.platforms.map(p=>`<details class="item"><summary><span>${esc(p.name)}</span><span class="num" style="font-weight:700">${p.spent==null?'—':money(p.spent)}</span></summary>${p.note?`<p>${esc(p.note)}</p>`:''}${(p.campaigns||[]).map(c=>`<p style="display:flex;justify-content:space-between;gap:12px"><span style="min-width:0;overflow-wrap:anywhere">${esc(c.name)}</span><b class="num" style="color:var(--fg)">${money(c.spent)}</b></p>`).join('')}</details>`).join('')+`</div><p class="note">Gasto desde el 1 de octubre en Meta Ads Manager y TikTok. Incluye Google.</p></section>`;
  }
  /* by platform (real) */
  const bud2=(typeof BUDGET!=='undefined'&&BUDGET.monthly)||24000;
  if(typeof ACTUALS!=='undefined'&&ACTUALS.platforms){
    h+=`<section class="sec"><h2>Gasto por plataforma <span>de ${money(bud2)}</span></h2><div class="group">`+ACTUALS.platforms.map(p=>`<div class="pbar"><div class="row"><span>${esc(p.name)}</span><span class="num">${p.spent==null?'—':money(p.spent)}</span></div><div class="track"><i style="width:${Math.min(100,Math.round(100*(p.spent||0)/bud2))}%"></i></div></div>`).join('')+`</div></section>`;
  }
  const plats=['all','Instagram','TikTok','Facebook','Google'];
  h+=`<section class="sec"><h2>Campañas de hoy</h2><div class="fchips">`+plats.map(p=>`<button data-plat="${p}" aria-pressed="${S.plat===p}">${p==='all'?'Todas':p}</button>`).join('')+`</div><div class="group">`;
  const list=CAMPS.map((c,i)=>({c,i})).filter(({c})=>tagOK(campTag(c))&&(S.plat==='all'||(S.plat==='Facebook'?/^FB|Remarketing/.test(c.platform):S.plat==='Google'?/Google/.test(c.platform):c.platform===S.plat)));
  if(!list.length) h+=`<div class="empty-s">No hay campañas para este filtro.</div>`;
  list.forEach(({c})=>{
    const a=c.amt, d=S.day, first=a.findIndex(x=>x>0)+1, last=a.length-[...a].reverse().findIndex(x=>x>0);
    const st = a[d-1]>0?`<span class="act on">Hoy ${money(a[d-1])}</span>`: d<first?`<span class="act run">Inicia el ${first}</span>`: d>last?`<span class="act off">Terminó</span>`:`<span class="act run">Pausa hoy</span>`;
    h+=`<details class="ad"><summary><span class="dot ${platCls(c.platform)}"></span><span class="a-name">${esc(c.name)}</span>${st}</summary>${adDetails(c)}<div class="strip" aria-hidden="true">${a.map((x,i)=>`<i class="${x?'a':''} ${i+1===d?'t':''}"></i>`).join('')}</div><p class="note" style="padding:4px 0 0">Días activos en octubre. Contorno = día seleccionado.</p></details>`;
  });
  return REALH+h+`</div></section>`;
}

function renderGuia(){
  let h=`<section class="sec"><h2>Antes de publicar</h2><div class="group">`+DATA.guard.map(g=>`<details class="item"><summary>${esc(g[0])}</summary><p>${esc(g[1])}</p></details>`).join('')+`</div></section>`;
  h+=`<section class="sec"><h2>Alertas de rendimiento <span>revisa cada lunes</span></h2><div class="group scroll-x"><table class="thr"><thead><tr><th>Dónde</th><th>Métrica</th><th>Bien</th><th>Vigila</th><th>Pausa</th></tr></thead><tbody>`+DATA.thr.map(r=>`<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td class="g">${esc(r[2])}</td><td class="y">${esc(r[3])}</td><td class="r">${esc(r[4])}</td></tr>`).join('')+`</tbody></table></div><p class="note">Si está en rojo: ${''}abre la fila en el Excel (columna Action if red).</p></section>`;
  h+=`<section class="sec"><h2>Metas de octubre</h2><div class="group">`+DATA.score.map(s=>`<details class="item"><summary>${esc(s[0])}</summary><p><b>Meta:</b> ${esc(s[2])}<br><b>Responsable:</b> ${esc(s[3])} · ${esc(s[4])}</p></details>`).join('')+`</div></section>`;
  h+=`<section class="sec"><h2>10 movimientos del mes</h2><div class="group">`+DATA.moves.map(m=>`<details class="item"><summary>${esc(m[0])}</summary><p>${esc(m[1])}</p></details>`).join('')+`</div></section>`;
  h+=`<section class="sec"><h2>Hábitos de septiembre</h2><div class="group">`+DATA.fixes.map(m=>`<details class="item"><summary>${esc(m[0])}</summary><p>${esc(m[1])}</p></details>`).join('')+`</div></section>`;
  return h;
}

/* ---------- shell ---------- */
const ICONS={
  hoy:'<svg viewBox="0 0 26 26"><circle cx="13" cy="13" r="9"/><path d="M13 8v5l3.5 2"/></svg>',
  semana:'<svg viewBox="0 0 26 26"><rect x="4" y="5.5" width="18" height="16" rx="3"/><path d="M4 11h18M9 3.5v4M17 3.5v4"/></svg>',
  ads:'<svg viewBox="0 0 26 26"><path d="M4 20V13M10 20V7M16 20v-9M22 20V4"/></svg>',
  guia:'<svg viewBox="0 0 26 26"><path d="M5 5.5A2.5 2.5 0 0 1 7.500 3H21v17H7.500A2.500 2.500 0 0 0 5 22.500z"/><path d="M5 5.500V22.500M10 8h7"/></svg>'};
const TABS=[['hoy','Hoy'],['semana','Semana'],['ads','Anuncios'],['guia','Guía']];
function renderBar(){
  let h='';
  if(S.tab==='hoy'){
    h+=`<div class="title-row"><div><h1 class="large">${S.day===TODAY&&inMonth?'Hoy':cap1(DOW[dow(S.day)])}</h1><p class="sub">${cap1(dayLabel(S.day))}</p></div>
      <div class="daynav"><button class="circ" data-step="-1" aria-label="Día anterior" ${S.day<=1?'disabled':''}>‹</button>${S.day!==TODAY?'<button class="pill-btn" data-today="1">Hoy</button>':''}<button class="circ" data-step="1" aria-label="Día siguiente" ${S.day>=31?'disabled':''}>›</button></div></div>`;
  } else {
    const t={semana:['Semana','Elige un día del mes'],ads:['Anuncios',`Plan del día ${S.day} de octubre`],guia:['Guía','Reglas, alertas y metas']}[S.tab];
    h+=`<div class="title-row"><div><h1 class="large">${t[0]}</h1><p class="sub">${t[1]}</p></div></div>`;
  }
  if(S.tab==='hoy'||S.tab==='ads') h+=`<div class="seg" role="group" aria-label="Sucursal">`+LOCS.map(l=>`<button data-loc="${l[0]}" aria-pressed="${S.loc===l[0]}">${l[1]}</button>`).join('')+`</div>`;
  $('#barin').innerHTML=h;
}
function render(){
  CLIPS=[]; renderBar();
  $('#view').innerHTML = S.tab==='hoy'?renderHoy():S.tab==='semana'?renderSemana():S.tab==='ads'?renderAds():renderGuia();
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
    b.setAttribute('aria-pressed',!!done[k]); const row=b.closest('[data-row]'); if(row) row.classList.toggle('done',!!done[k]); updateProgress(); return }
  if(b.dataset.c!==undefined){ copyText(CLIPS[+b.dataset.c]); return }
  if(b.dataset.tab){ S.tab=b.dataset.tab; render(); scrollTo(0,0); return }
  if(b.dataset.loc){ S.loc=b.dataset.loc; store.set('loc',S.loc); const y=scrollY; render(); scrollTo(0,y); return }
  if(b.dataset.step){ S.day=Math.min(31,Math.max(1,S.day+ +b.dataset.step)); render(); scrollTo(0,0); return }
  if(b.dataset.today){ S.day=TODAY; render(); scrollTo(0,0); return }
  if(b.dataset.go){ S.day=+b.dataset.go; S.tab='hoy'; render(); scrollTo(0,0); return }
  if(b.dataset.plat){ S.plat=b.dataset.plat; const y=scrollY; render(); scrollTo(0,y); return }
});
addEventListener('scroll',()=>$('#bar').classList.toggle('scrolled',scrollY>8),{passive:true});
render();
