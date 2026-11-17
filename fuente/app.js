(function(){
var $=function(id){return document.getElementById(id)};
var ESP=['Mecánico','Eléctrico','Instrumentación','Sin especialidad'];
var ESPVAR={'Mecánico':'--mec','Eléctrico':'--ele','Instrumentación':'--ins','Sin especialidad':'--otr'};
var MATS=['Falta Disponibilidad Material','Sin Componentes','Material Confirmado','Revisar','Sin Orden'];
var MATCLS={'Falta Disponibilidad Material':'p-bad','Sin Componentes':'p-info','Material Confirmado':'p-ok','Revisar':'p-warn','Sin Orden':'p-none'};
var DOW=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
var CHUNK=180000;

var db=null, dbReady=false, downloads=null;
var weeksMeta={};          /* id -> meta guardada */
var loaded={};             /* id -> {ip, ia10, status} */
var curId='', state=null, unsaved=false, confirmDel=false, loadingWeek=false;
var metric='op', view='g', closed={}, tab='';
var F={mat:new Set(),stat:new Set(),pto:new Set(),terms:[]};
var page='proy', torresMeta={}, torreLoaded={}, torreId='', torre=null, torreLoading=false, tConfirmDel=false, torresReady=false;
var lastFiles={};

function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function fmt(n,d){if(d==null)d=metric==='hh'?1:0;var v=Math.round(n*Math.pow(10,d))/Math.pow(10,d);return v.toLocaleString('es-CL',{minimumFractionDigits:0,maximumFractionDigits:d})}
function dd(k){var p=k.split('-');var d=new Date(Date.UTC(+p[0],+p[1]-1,+p[2]));return{dow:DOW[d.getUTCDay()],d:p[2]+'-'+p[1],we:d.getUTCDay()===0||d.getUTCDay()===6}}
function statShort(s){return s.replace(' (Plan de Mantenimiento en M',' (en M').replace(' (Plan de Mantenimiento)','')}
function toast(t){var el=$('toast');el.textContent=t;el.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(function(){el.hidden=true},3200)}
function wid(sem){return String(sem||'sin-semana').replace(/[^0-9A-Za-z]+/g,'-')}

/* ---------- Almacenamiento por semana ---------- */
function subscribeWeeks(){
  db.collection('weeks').onSnapshot(function(snap){
    weeksMeta={};snap.docs.forEach(function(d){if(d.exists)weeksMeta[d.id]=d.data()});
    dbReady=true;
    if(!curId||(!weeksMeta[curId]&&!unsaved)){var ids=Object.keys(weeksMeta).sort();curId='';state=null;if(ids.length)openWeek(ids[ids.length-1]);else renderAll()}
    else renderAll();
  },function(){dbReady=true;db=null;renderAll()});
}
function fetchWeek(id){
  if(loaded[id])return Promise.resolve(loaded[id]);
  var m=weeksMeta[id];if(!m||!db)return Promise.reject(new Error('sin semana'));
  return db.collection('weeks/'+id+'/rows').get().then(function(snap){
    var parts=snap.docs.filter(function(d){return d.exists}).map(function(d){return d.data()}).sort(function(a,b){return a.i-b.i}).slice(0,m.nChunks||99);
    var rows=[];parts.forEach(function(p){rows=rows.concat(p.rows||[])});
    loaded[id]={ip:{headers:m.headers,rows:rows,idx:Core.indexHeaders(m.headers),prevStatus:null},ia10:m.ia10||null,status:m.status||null,files:m.files||{}};
    return loaded[id];
  });
}
function openWeek(id){
  if(loaded[id]){curId=id;rebuild();return}
  if(!weeksMeta[id]||!db)return;
  curId=id;loadingWeek=true;renderAll();
  fetchWeek(id).then(function(){loadingWeek=false;if(curId===id)rebuild()},function(){loadingWeek=false;toast('No se pudo abrir la semana guardada. Intenta de nuevo.');renderAll()});
}
/* HH estimadas por hoja de ruta (Torre de control) para posiciones sin orden */
function applyEst(st){
  if(!st)return st;
  st.recs.forEach(function(r){r.hhEst=null;r.estAprox=false;r.estMiss=false;
    if(r.orden||!torre)return;var e=Torre.estimate(torre,r.llave,r.ciclo);
    if(e){r.hhEst=e.hh;r.estAprox=e.aprox}else r.estMiss=true});
  return st;
}
function buildWeek(id){var L=loaded[id];return L?applyEst(Core.build(L.ip,L.ia10,L.status)):null}
function rebuild(){state=buildWeek(curId);closed={};confirmDel=false;renderAll()}

function saveWeek(id){
  var L=loaded[id];if(!db||!L)return Promise.resolve(false);
  var chunks=[],cur=[],size=0;
  L.ip.rows.forEach(function(r){var l=JSON.stringify(r).length;if(size+l>CHUNK&&cur.length){chunks.push(cur);cur=[];size=0}cur.push(r);size+=l});chunks.push(cur);
  var st=Core.build(L.ip,L.ia10,L.status),plans={};st.recs.forEach(function(r){plans[r.plan+'|'+r.toma]=1});
  var meta={sem:st.recs[0]?st.recs[0].sem:'',savedAt:new Date().toISOString(),files:L.files||{},headers:L.ip.headers,status:L.status||null,ia10:L.ia10||null,nChunks:chunks.length,
    planes:Object.keys(plans).length,ops:st.recs.length,hh:Math.round(st.recs.reduce(function(a,r){return a+r.hh},0)*10)/10};
  if(JSON.stringify(meta).length>250000){meta.ia10=compactIA10(L.ia10,st.recs)}
  var old=(weeksMeta[id]&&weeksMeta[id].nChunks)||0,p=Promise.resolve();
  chunks.forEach(function(c,i){p=p.then(function(){return db.doc('weeks/'+id+'/rows/c'+i).set({i:i,rows:c})})});
  for(var k=chunks.length;k<old;k++)(function(k){p=p.then(function(){return db.doc('weeks/'+id+'/rows/c'+k).delete()})})(k);
  return p.then(function(){return db.doc('weeks/'+id).set(meta)}).then(function(){return true},function(e){
    toast(e&&e.code==='quota_exceeded'?'El almacenamiento de la página está lleno. Elimina semanas antiguas para guardar esta.':'No se pudo guardar la semana. La ves igual, pero no quedó guardada.');return false});
}
function compactIA10(list,recs){var used={};recs.forEach(function(r){used[r.llave]=1});return(list||[]).filter(function(x){return used[x.gr+'-'+x.cgh]})}
function deleteWeek(id){
  var m=weeksMeta[id];if(!db||!m)return;var p=Promise.resolve();
  for(var k=0;k<(m.nChunks||0);k++)(function(k){p=p.then(function(){return db.doc('weeks/'+id+'/rows/c'+k).delete()})})(k);
  p.then(function(){return db.doc('weeks/'+id).delete()}).then(function(){delete loaded[id];toast('Semana '+m.sem+' eliminada.')},function(){toast('No se pudo eliminar la semana.')});
  curId='';state=null;confirmDel=false;
}

/* ---------- Carga de archivos ---------- */
function isTorreSheets(nm){return nm.some(function(n){return /ip18|ih06/i.test(n)})}
function readFile(f){return new Promise(function(res,rej){var r=new FileReader();r.onload=function(){try{
  var u=new Uint8Array(r.result),nm=XLSX.read(u,{type:'array',bookSheets:true}).SheetNames;
  if(isTorreSheets(nm)){var want=nm.filter(function(n){return Torre.WANT.test(n.split(' ')[0])||Torre.WANT.test(n)});res({torre:true,bytes:u,wb:XLSX.read(u,{type:'array',cellDates:true,sheets:want})})}
  else res({torre:false,bytes:u,wb:XLSX.read(u,{type:'array',cellDates:true})});
}catch(e){rej(e)}};r.onerror=function(){rej(r.error)};r.readAsArrayBuffer(f)})}
function aoa(ws){return XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''})}
function handle(files){
  if(typeof XLSX==='undefined'){showMsg('No se pudo cargar el lector de Excel. Revisa tu conexión y recarga la página.');return}
  var list=[].slice.call(files||[]);if(!list.length)return;
  var notes=[],got={ip19:null,ia10:null,iw38:null},names={};
  Promise.all(list.map(function(f){return readFile(f).then(function(x){return{f:f,wb:x.wb,torre:x.torre}},function(){notes.push(f.name+': no se pudo leer como Excel.');return null})})).then(function(arr){
    arr.forEach(function(x){
      if(!x)return;var found=false;
      if(x.torre){loadTorreWB(x.f.name,x.wb,{bytes:x.bytes,name:x.f.name});return}
      x.wb.SheetNames.forEach(function(sn){
        var a=aoa(x.wb.Sheets[sn]);if(!a.length)return;
        try{
          if(Core.isIP19(a)){if(!got.ip19||/data/i.test(sn)){got.ip19=Core.parseIP19(a);names.ip19=x.f.name+(x.wb.SheetNames.length>1?' · '+sn:'');found=true}}
          else if(Core.isIW38(a)){got.iw38=Core.parseIW38(a);names.iw38=x.f.name;found=true}
          else if(/ia10/i.test(sn)||/ia10/i.test(x.f.name)||x.wb.SheetNames.length===1){var l=Core.parseIA10(a);if(l.length){got.ia10=l;names.ia10=x.f.name+(x.wb.SheetNames.length>1?' · '+sn:'');found=true}}
        }catch(e){notes.push(x.f.name+' ('+sn+'): '+e.message)}
      });
      if(!found&&!notes.some(function(n){return n.indexOf(x.f.name)===0}))notes.push(x.f.name+': no lo reconocí como IP19, IA10 ni IW38.');
    });
    showMsg(notes.join(' '));
    applyUpload(got,names);
  });
}
function statusFor(rows,idx,iw38,prev,old){
  var src=iw38||prev;if(!src&&!old)return null;var out={};
  rows.forEach(function(r){var o=Core.s(r[idx.orden]).replace(/^0+(?=\d)/,'');if(!o)return;
    if(iw38&&o in iw38)out[o]=iw38[o];else if(prev&&o in prev)out[o]=prev[o];else if(old&&o in old)out[o]=old[o];});
  return out;
}
function applyUpload(got,names){
  var targets=[];
  if(got.ip19){
    var by={};got.ip19.rows.forEach(function(r){var sem=Core.s(r[got.ip19.idx.sem])||'sin semana';(by[sem]=by[sem]||[]).push(r)});
    Object.keys(by).forEach(function(sem){
      var id=wid(sem),prevL=loaded[id];
      var ia10=got.ia10||(prevL&&prevL.ia10)||null;
      var ip={headers:got.ip19.headers,rows:by[sem],idx:got.ip19.idx,prevStatus:null};
      var status=statusFor(by[sem],got.ip19.idx,got.iw38,got.ip19.prevStatus,prevL&&prevL.status);
      var files={ip19:names.ip19,ia10:names.ia10||(prevL&&prevL.files.ia10)||'',iw38:names.iw38||(got.ip19.prevStatus&&!got.iw38?'Estatus Ord del mismo archivo':'')||(prevL&&prevL.files.iw38)||''};
      loaded[id]={ip:ip,ia10:ia10,status:status,files:files};targets.push(id);
    });
  }else if(curId&&loaded[curId]&&(got.ia10||got.iw38)){
    var L=loaded[curId];
    if(got.ia10){L.ia10=got.ia10;L.files.ia10=names.ia10}
    if(got.iw38){L.status=statusFor(L.ip.rows,L.ip.idx,got.iw38,null,L.status);L.files.iw38=names.iw38}
    targets.push(curId);
  }else if(got.ia10||got.iw38){showMsg('Primero carga la IP19 de la semana (o elige una semana guardada) y luego la IA10 o IW38.');return}
  if(!targets.length)return;
  curId=targets[targets.length-1];unsaved=true;rebuild();
  if(!db){toast('Semana cargada. No se pudo guardar: el almacenamiento no está disponible en esta vista.');unsaved=false;return}
  var p=Promise.resolve(),ok=[];
  targets.forEach(function(id){p=p.then(function(){var existed=!!weeksMeta[id];return saveWeek(id).then(function(r){if(r)ok.push((existed?'actualizada ':'guardada ')+loaded[id].ip.rows[0][loaded[id].ip.idx.sem])})})});
  p.then(function(){unsaved=false;if(ok.length)toast('Semana '+ok.join(', ')+'.');window.scrollTo({top:0,behavior:'smooth'})});
}
function showMsg(t){$('msg').innerHTML=t?'<div class="err">'+esc(t)+'</div>':''}
var drop=$('drop');
['dragenter','dragover'].forEach(function(e){drop.addEventListener(e,function(ev){ev.preventDefault();drop.classList.add('over')})});
['dragleave','drop'].forEach(function(e){drop.addEventListener(e,function(ev){ev.preventDefault();drop.classList.remove('over')})});
drop.addEventListener('drop',function(ev){handle(ev.dataTransfer.files)});
document.addEventListener('dragover',function(e){e.preventDefault()});document.addEventListener('drop',function(e){e.preventDefault()});
$('pick').addEventListener('click',function(e){e.stopPropagation();$('file').click()});
drop.addEventListener('click',function(){$('file').click()});
drop.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();$('file').click()}});
$('file').addEventListener('change',function(){handle(this.files);this.value=''});

/* ---------- Semanas, pestañas y filtros ---------- */
function weekRange(sem){var d=Core.weekDays(sem,[]);return d.length?dd(d[0]).d+' al '+dd(d[d.length-1]).d:''}
function renderWeeks(){
  var ids=Object.keys(weeksMeta).sort();
  if(curId&&loaded[curId]&&ids.indexOf(curId)<0)ids.push(curId);
  $('wkState').textContent=!dbReady?'Cargando semanas guardadas…':!db?'El almacenamiento no está disponible en esta vista: las semanas que cargues no se guardarán.':ids.length?ids.length+' semana(s) · elige una para revisarla':'';
  $('wkList').innerHTML=ids.map(function(id){var m=weeksMeta[id],sem=m?m.sem:Core.s(loaded[id].ip.rows[0][loaded[id].ip.idx.sem]);
    return '<button type="button" class="wk" data-week="'+esc(id)+'" aria-pressed="'+(id===curId)+'"><b>Sem '+esc(sem.split('/')[1]||sem)+'<span style="font-weight:600;font-size:13px;opacity:.8"> · '+esc(sem.split('/')[0]||'')+'</span></b><small>'+esc(weekRange(sem))+'</small><small>'+(m?m.planes+' planes · '+fmt(m.hh,1)+' HH':'sin guardar')+'</small></button>'}).join('')+
    '<button type="button" class="wk add" id="goLoad">+ Cargar semana</button>';
  var a='';
  if(curId&&weeksMeta[curId]){var m=weeksMeta[curId],sv=new Date(m.savedAt);
    a='<span class="muted">Guardada el '+sv.toLocaleDateString('es-CL')+' '+sv.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})+' · IP19: '+esc(m.files&&m.files.ip19||'—')+'</span>';
    a+=confirmDel?'<span>¿Eliminar la semana '+esc(m.sem)+'? <button class="btn danger" type="button" id="delYes">Eliminar</button> <button class="linkbtn" type="button" id="delNo">Cancelar</button></span>':'<button class="linkbtn danger" type="button" id="delWeek">Eliminar esta semana</button>'}
  $('wkActions').innerHTML=a;
}
function renderCtx(){
  var w=week();$('ctxWeek').textContent=w?'Sem '+(w.split('/')[1]||w)+' · '+(w.split('/')[0]||''):'—';$('ctxRange').textContent=weekRange(w);
  var p=[];
  F.terms.forEach(function(t){p.push('<span class="pill p-warn">Txt: '+esc(t)+'</span>')});
  F.mat.forEach(function(v){p.push('<span class="pill '+MATCLS[v]+'">'+esc(v)+'</span>')});
  F.stat.forEach(function(v){p.push('<span class="pill p-none">'+esc(statShort(v))+'</span>')});
  F.pto.forEach(function(v){p.push('<span class="pill p-none mono">'+esc(v)+'</span>')});
  var tp=torre?'<span class="pill p-bad" title="Las HH de planes sin orden se estiman con la IA10 de esta Torre">HH estimadas: Torre '+esc(torre.sem)+'</span>':'';
  $('ctxFilters').innerHTML=tp+(p.length?p.join('')+'<button class="linkbtn" type="button" id="ctxClear">Quitar filtros</button>':'<span class="muted" style="font-size:12px">Sin filtros: se muestra toda la semana</span>');
}
function tabRecs(){return state?state.recs.filter(function(r){return!tab||r.esp===tab}):[]}
function renderTabs(){
  if(!state){$('tabs').innerHTML='';return}
  var all=state.recs,list=[['','Todas','--accent']].concat(ESP.filter(function(e){return all.some(function(r){return r.esp===e})}).map(function(e){return[e,e,ESPVAR[e]]}));
  if(tab&&!list.some(function(x){return x[0]===tab}))tab='';
  $('tabs').innerHTML=list.map(function(x){var n=all.filter(function(r){return(!x[0]||r.esp===x[0])&&pass(r)}).length;
    return '<button type="button" role="tab" class="tab" data-tab="'+esc(x[0])+'" aria-selected="'+(tab===x[0])+'" style="--tabc:var('+x[2]+')">'+(x[0]?'<span class="sw" style="background:var('+x[2]+')"></span>':'')+esc(x[1])+'<span class="n">'+n+'</span></button>'}).join('');
}
function termHit(txt){if(!F.terms.length)return true;var f=Core.fold(txt);return F.terms.some(function(t){return f.indexOf(t)>=0})}
function pass(r,skip){
  if(skip!=='mat'&&F.mat.size&&!F.mat.has(r.estMat))return false;
  if(skip!=='stat'&&F.stat.size&&!F.stat.has(r.stat))return false;
  if(skip!=='pto'&&F.pto.size&&!F.pto.has(r.pto))return false;
  if(skip!=='terms'&&!termHit(r.txt))return false;
  return true}
function hl(txt){
  var out=esc(txt);if(!F.terms.length)return out;
  var f=Core.fold(txt),marks=[];
  F.terms.forEach(function(t){var i=-1;while((i=f.indexOf(t,i+1))>=0)marks.push([i,i+t.length])});
  if(!marks.length)return out;marks.sort(function(a,b){return a[0]-b[0]});
  var res='',pos=0;marks.forEach(function(m){if(m[0]<pos)return;res+=esc(txt.slice(pos,m[0]))+'<mark>'+esc(txt.slice(m[0],m[1]))+'</mark>';pos=m[1]});
  return res+esc(txt.slice(pos));
}
function chips(id,key,values,label){
  var base=tabRecs();
  $(id).innerHTML=values.map(function(v){
    var n=base.filter(function(r){return pass(r,key)&&(key==='mat'?r.estMat:key==='stat'?r.stat:r.pto)===v}).length;
    return '<button type="button" class="chip" aria-pressed="'+F[key].has(v)+'" data-k="'+key+'" data-v="'+esc(v)+'">'+esc(label?label(v):v)+'<span class="n">'+n+'</span></button>'}).join('');
}
function renderTerms(){
  var base=tabRecs();
  $('terms').innerHTML=F.terms.map(function(t,i){
    var plans={};base.forEach(function(r){if(pass(r,'terms')&&Core.fold(r.txt).indexOf(t)>=0)plans[r.plan+'|'+r.toma]=1});
    return '<button type="button" class="chip term" data-term="'+i+'" aria-label="Quitar '+esc(t)+'">'+esc(t)+'<span class="n">'+Object.keys(plans).length+' planes</span><span class="x" aria-hidden="true">×</span></button>'}).join('');
}
$('termForm').addEventListener('submit',function(e){e.preventDefault();
  var raw=$('q').value;raw.split(/[,;]+/).forEach(function(p){var t=Core.fold(p).trim();if(t&&F.terms.indexOf(t)<0)F.terms.push(t)});
  $('q').value='';renderAll()});
document.addEventListener('click',function(e){
  var t;
  if((t=e.target.closest('[data-week]'))){var id=t.dataset.week;if(id!==curId){F.mat.clear();F.stat.clear();F.pto.clear();openWeek(id)}return}
  if(e.target.closest('#goLoad')){$('loader').scrollIntoView({behavior:'smooth'});return}
  if(e.target.closest('#delWeek')){confirmDel=true;renderWeeks();return}
  if(e.target.closest('#delNo')){confirmDel=false;renderWeeks();return}
  if(e.target.closest('#delYes')){deleteWeek(curId);renderAll();return}
  if((t=e.target.closest('[data-tab]'))){tab=t.dataset.tab;closed={};renderAll();return}
  if((t=e.target.closest('[data-term]'))){F.terms.splice(+t.dataset.term,1);renderAll();return}
  if((t=e.target.closest('.chip[data-k]'))){var k=t.dataset.k,v=t.dataset.v;F[k].has(v)?F[k].delete(v):F[k].add(v);renderAll();return}
  if((t=e.target.closest('[data-grp]'))){var p=t.dataset.grp;closed[p]=!closed[p];renderGantt();return}
  if((t=e.target.closest('[data-filter]'))){F.mat=new Set([t.dataset.filter]);view='g';renderAll();return}
  if(e.target.closest('#goReview')){view='r';renderAll();$('gTitle').scrollIntoView({behavior:'smooth',block:'start'});return}
  if(e.target.closest('#ctxClear')){$('clear').click();return}
  if(e.target.closest('#emptyLoad')){$('file').click();return}
});
$('clear').addEventListener('click',function(){F.mat.clear();F.stat.clear();F.pto.clear();F.terms=[];$('q').value='';renderAll()});
function seg(a,b,on){$(a).setAttribute('aria-pressed',on);$(b).setAttribute('aria-pressed',!on)}
$('m-op').addEventListener('click',function(){metric='op';renderAll()});
$('m-hh').addEventListener('click',function(){metric='hh';renderAll()});
$('foldAll').addEventListener('click',function(){tabRecs().forEach(function(r){closed[r.pto]=true});renderGantt()});
$('unfoldAll').addEventListener('click',function(){closed={};renderGantt()});
$('v-g').addEventListener('click',function(){view='g';renderAll()});
$('v-d').addEventListener('click',function(){view='d';renderAll()});
$('v-r').addEventListener('click',function(){view='r';renderAll()});

/* ---------- Render ---------- */
function vReal(rs){return rs.reduce(function(a,r){return a+r.hh},0)}
function vEst(rs){return rs.reduce(function(a,r){return a+(r.orden?0:(r.hhEst||0))},0)}
function val(rs){return metric==='op'?rs.length:vReal(rs)+vEst(rs)}
function estLine(rs){if(metric!=='hh')return'';var e=vEst(rs);return e?'<span class="dt-est">≈'+fmt(e)+' estim.</span>':''}
function planKey(r){return r.plan+'|'+r.toma}
function week(){return state&&state.recs[0]?state.recs[0].sem:''}
function renderSlots(){
  var L=loaded[curId],defs=[['ip19','IP19','Proyección de la semana'],['ia10','IA10','Ciclos por hoja de ruta'],['iw38','IW38','Status de sistema de las órdenes']];
  $('slots').innerHTML='<span class="eyebrow">Archivos de la semana '+esc(week()||'')+'</span>'+defs.map(function(d){
    var name=L&&L.files&&L.files[d[0]],ok=!!name;
    return '<div class="slot '+(ok?'ok':'miss')+'"><span class="dot"></span><b>'+d[1]+'</b><small>'+esc(ok?name:'Sin cargar · '+d[2])+'</small></div>'}).join('');
}
function renderKPIs(rs){
  var plans={},withOT={},orders={},fmat={};
  rs.forEach(function(r){var k=planKey(r);plans[k]=1;if(r.orden){withOT[k]=1;orders[r.orden]=1;if(r.estMat==='Falta Disponibilidad Material')fmat[r.orden]=1}});
  var np=Object.keys(plans).length,nw=Object.keys(withOT).length,hh=vReal(rs),he=vEst(rs),nf=Object.keys(fmat).length;
  var k=[['Planes',fmt(np,0),'tomas de plan en la semana'],['Operaciones',fmt(rs.length,0),'posiciones proyectadas'],['HH con orden',fmt(hh,1),'suma de Trabajo de las órdenes'],
    torre?['HH estimadas',fmt(he,1),'hoja de ruta (Torre '+(torre.sem||'')+'), planes sin orden','est']:['Planes sin orden',fmt(np-nw,0),'carga una Torre para estimar sus HH'],
    ['Planes con orden',np?fmt(nw/np*100,0)+' %':'—',nw+' de '+np+' · '+Object.keys(orders).length+' órdenes'],['Falta material',fmt(nf,0),'órdenes con FMAT',nf>0?'alert':'']];
  $('kpis').innerHTML=k.map(function(x){return'<div class="panel kpi'+(x[3]?' '+x[3]:'')+'"><span class="eyebrow">'+x[0]+'</span><span class="v">'+x[1]+'</span><span class="s">'+esc(x[2])+'</span></div>'}).join('');
}
function reviewData(rs){
  var fm={},multi={},sinc={},noiw={};
  rs.forEach(function(r){if(r.estMat==='Falta Disponibilidad Material')(fm[r.orden]=fm[r.orden]||[]).push(r);if(r.ciclosAlt)(multi[r.llave]=multi[r.llave]||[]).push(r);if(r.ciclo==='Sin ciclo en IA10')(sinc[r.llave||'(sin hoja de ruta)']=sinc[r.llave||'(sin hoja de ruta)']||[]).push(r);if(r.estOrd==='No está en la IW38')(noiw[r.orden]=noiw[r.orden]||[]).push(r)});
  var miss={},aprox={};
  rs.forEach(function(r){if(r.estMiss)(miss[r.llave||'(sin hoja)']=miss[r.llave||'(sin hoja)']||[]).push(r);if(r.estAprox)(aprox[r.llave]=aprox[r.llave]||[]).push(r)});
  return{fm:fm,multi:multi,sinc:sinc,noiw:noiw,miss:miss,aprox:aprox};
}
function renderAlerts(rs){
  var R=reviewData(rs),n=function(o){return Object.keys(o).length},items=[];
  if(n(R.fm))items.push(['p-bad',n(R.fm)+' orden(es) con falta de material']);
  if(n(R.noiw))items.push(['p-warn',n(R.noiw)+' orden(es) no están en la IW38']);
  if(n(R.sinc))items.push(['p-warn',n(R.sinc)+' hoja(s) de ruta sin ciclo']);
  if(n(R.multi))items.push(['p-info',n(R.multi)+' hoja(s) de ruta con más de un ciclo']);
  if(n(R.miss))items.push(['p-warn',n(R.miss)+' hoja(s) sin HH en la Torre']);
  if(state&&!state.ia10)items.push(['p-warn','Falta cargar la IA10']);
  if(state&&!state.hasIW38)items.push(['p-warn','Falta cargar la IW38']);
  var crit=n(R.fm)+n(R.noiw)+n(R.sinc);
  $('revBadge').hidden=!crit;$('revBadge').textContent=crit;
  $('alerts').innerHTML=items.length?'<div class="sumbar"><span class="eyebrow">Para revisar</span>'+items.map(function(x){return'<span class="pill '+x[0]+'">'+esc(x[1])+'</span>'}).join('')+'<button class="linkbtn" type="button" id="goReview">Ver detalle en Revisión</button></div>':'';
}
function renderReview(rs){
  var R=reviewData(rs),out='';
  function sec(title,cls,desc,head,rows,extra){
    if(!rows.length)return'';
    return'<div class="rsec"><h3>'+esc(title)+' <span class="pill '+cls+'">'+rows.length+'</span>'+(extra||'')+'</h3><p>'+esc(desc)+'</p><div class="rtab"><table><thead><tr>'+head.map(function(h){return'<th>'+h+'</th>'}).join('')+'</tr></thead><tbody>'+rows.map(function(r){return'<tr>'+r.map(function(c){return'<td>'+c+'</td>'}).join('')+'</tr>'}).join('')+'</tbody></table></div></div>'}
  function day(r){if(!r.fecha)return'';var i=dd(r.fecha);return i.dow+' '+i.d}
  out+=sec('Falta disponibilidad de material','p-bad','Órdenes cuyo status de sistema trae FMAT. Hay que gestionar el material antes de congelar el programa.',['Orden','Fecha','Pto. resp.','Plan','Txt plan','HH'],
    Object.keys(R.fm).map(function(o){var rs=R.fm[o],r=rs[0];return['<span class="mono">'+esc(o)+'</span>',day(r),'<span class="mono">'+esc(r.pto)+'</span>','<span class="mono">'+esc(r.plan)+'</span>',esc(r.txt),'<span class="mono">'+fmt(rs.reduce(function(a,x){return a+x.hh},0),1)+'</span>']}),
    ' <button class="linkbtn" type="button" data-filter="Falta Disponibilidad Material">Ver en la Gantt</button>');
  out+=sec('Órdenes que no están en la IW38','p-warn','La IP19 trae número de orden, pero la IW38 cargada no la incluye. Vuelve a sacar la IW38 incluyendo estas órdenes.',['Orden','Fecha','Pto. resp.','Plan','Txt plan'],
    Object.keys(R.noiw).map(function(o){var r=R.noiw[o][0];return['<span class="mono">'+esc(o)+'</span>',day(r),'<span class="mono">'+esc(r.pto)+'</span>','<span class="mono">'+esc(r.plan)+'</span>',esc(r.txt)]}));
  out+=sec('Hojas de ruta sin ciclo en la IA10','p-warn','La llave GrHRuta + CGH no aparece en la IA10 cargada. Revisa que la IA10 incluya estas hojas de ruta.',['Llave','Plan','Txt plan','Operaciones'],
    Object.keys(R.sinc).map(function(k){var r=R.sinc[k][0];return['<span class="mono">'+esc(k)+'</span>','<span class="mono">'+esc(r.plan)+'</span>',esc(r.txt),R.sinc[k].length]}));
  out+=sec('Hojas de ruta con más de un ciclo','p-info','La IA10 trae varios paquetes para la misma llave. Se usa el primer ciclo, igual que BUSCARV. Revisa si es el que corresponde al plan.',['Llave','Plan','Txt plan','Ciclo usado','Otros ciclos en la IA10'],
    Object.keys(R.multi).sort().map(function(k){var r=R.multi[k][0];return['<span class="mono">'+esc(k)+'</span>','<span class="mono">'+esc(r.plan)+'</span>',esc(r.txt),esc(r.ciclo),esc(r.ciclosAlt.slice(1).join(' / '))]}));
  out+=sec('Planes sin orden sin HH en la Torre','p-warn','La hoja de ruta de estas posiciones no aparece en la IA10 de la Torre de control cargada, así que no se pudo estimar su carga.',['Llave','Plan','Txt plan','Posiciones'],
    Object.keys(R.miss).map(function(k){var r=R.miss[k][0];return['<span class="mono">'+esc(k)+'</span>','<span class="mono">'+esc(r.plan)+'</span>',esc(r.txt),R.miss[k].length]}));
  out+=sec('HH estimadas aproximadas','p-info','El ciclo del plan no coincide con ningún paquete de la hoja de ruta en la Torre. Se usó el paquete de ciclo más corto.',['Llave','Plan','Txt plan','Ciclo del plan','HH por posición'],
    Object.keys(R.aprox).map(function(k){var r=R.aprox[k][0];return['<span class="mono">'+esc(k)+'</span>','<span class="mono">'+esc(r.plan)+'</span>',esc(r.txt),esc(r.ciclo),'<span class="mono">'+fmt(r.hhEst,1)+'</span>']}));
  if(state&&!state.ia10)out+='<div class="rsec"><h3>Falta la IA10</h3><p>Carga la IA10 de esta semana para completar la columna Ciclo.</p></div>';
  if(state&&!state.hasIW38)out+='<div class="rsec"><h3>Falta la IW38</h3><p>Carga la IW38 de esta semana para conocer el estatus de las órdenes y del material.</p></div>';
  $('review').innerHTML=out||'<div class="empty">Nada pendiente de revisar con los filtros activos.</div>';
}
function niceStep(x){if(x<=0)return 1;var p=Math.pow(10,Math.floor(Math.log10(x))),n=x/p;return(n<=1?1:n<=2?2:n<=5?5:10)*p}
function renderDaily(rs,days){
  var W=920,H=230,pl=46,pr=10,pt=22,pb=34,cw=(W-pl-pr)/days.length,bw=Math.min(64,cw*.56);
  var tot=days.map(function(d){return val(rs.filter(function(r){return r.fecha===d}))});
  var mx=Math.max.apply(null,tot.concat([metric==='hh'?1:1])),step=niceStep(mx/4),top=Math.ceil(mx/step)*step||1;
  var y=function(v){return pt+(H-pt-pb)*(1-v/top)},g='',bg='';
  for(var t=0;t<=top+1e-9;t+=step){g+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+y(t)+'" y2="'+y(t)+'" stroke="var(--line)" stroke-width="1"/><text x="'+(pl-8)+'" y="'+(y(t)+4)+'" text-anchor="end" font-size="11" fill="var(--muted)" font-family="var(--f-mono)">'+fmt(t,step<1?1:0)+'</text>'}
  days.forEach(function(d,i){
    var x=pl+cw*i+(cw-bw)/2,acc=0,info=dd(d);
    if(info.we)bg+='<rect x="'+(pl+cw*i)+'" y="'+pt+'" width="'+cw+'" height="'+(H-pt-pb)+'" fill="var(--sunk)"/>';
    ESP.forEach(function(e){var sub=rs.filter(function(r){return r.fecha===d&&r.esp===e}),v=metric==='op'?sub.length:vReal(sub);if(!v)return;
      var y0=y(acc+v),h=y(acc)-y0;g+='<rect x="'+x+'" y="'+y0+'" width="'+bw+'" height="'+Math.max(h,1)+'" fill="var('+ESPVAR[e]+')"><title>'+info.dow+' '+info.d+' · '+e+': '+fmt(v)+(metric==='hh'?' HH con orden':'')+'</title></rect>';acc+=v});
    if(metric==='hh'){var ev=vEst(rs.filter(function(r){return r.fecha===d}));if(ev){var y1=y(acc+ev),h1=y(acc)-y1;g+='<rect x="'+x+'" y="'+y1+'" width="'+bw+'" height="'+Math.max(h1,1)+'" fill="var(--bad-soft)" stroke="var(--bad)" stroke-width="1.5" stroke-dasharray="4 3"><title>'+info.dow+' '+info.d+' · HH estimadas por hoja de ruta: '+fmt(ev)+'</title></rect>';acc+=ev}}
    g+='<text x="'+(x+bw/2)+'" y="'+(y(tot[i])-6)+'" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)" font-family="var(--f-mono)">'+(tot[i]?fmt(tot[i]):'')+'</text>';
    g+='<text x="'+(x+bw/2)+'" y="'+(H-pb+15)+'" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">'+info.dow+'</text><text x="'+(x+bw/2)+'" y="'+(H-pb+29)+'" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="var(--f-mono)">'+info.d+'</text>';
  });
  $('dailyChart').innerHTML='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Carga por día">'+bg+g+'</svg>';
  $('dailyTitle').textContent=(metric==='op'?'Operaciones por día':'HH por día')+(tab?' · '+tab:'');
  $('legend').innerHTML=ESP.filter(function(e){return rs.some(function(r){return r.esp===e})}).map(function(e){return'<span><span class="sw" style="background:var('+ESPVAR[e]+')"></span>'+e+'</span>'}).join('')+(metric==='hh'?(torre?'<span><span class="sw" style="background:var(--bad-soft);outline:1.5px dashed var(--bad)"></span>HH estimadas por hoja de ruta (sin orden)</span>':'<span>Solo HH de planes con orden. Carga una Torre de control para estimar el resto.</span>'):'');
}
function worstMat(rs){for(var i=0;i<MATS.length;i++){if(rs.some(function(r){return r.estMat===MATS[i]}))return MATS[i]}return''}
function renderGantt(){
  var base=tabRecs(),rs=base.filter(function(r){return pass(r)}),days=Core.weekDays(week(),base);
  if(!rs.length){$('gantt').innerHTML='<div class="empty">No hay planes con estos filtros'+(F.terms.length?' ni con los términos buscados':'')+'.</div>';return}
  var groups={};rs.forEach(function(r){(groups[r.pto]=groups[r.pto]||{}),(groups[r.pto][planKey(r)]=groups[r.pto][planKey(r)]||[]).push(r)});
  var cellMax=0;Object.keys(groups).forEach(function(p){Object.keys(groups[p]).forEach(function(k){days.forEach(function(d){cellMax=Math.max(cellMax,val(groups[p][k].filter(function(r){return r.fecha===d})))})})});
  var h='<table class="g"><thead><tr><th class="first">Puesto responsable · Plan<span class="dt" style="font-family:var(--f-body)">Total del día ('+(metric==='op'?'operaciones':'HH')+')</span></th>'+days.map(function(d){var i=dd(d);return'<th class="'+(i.we?'we':'')+'"><span class="dn">'+i.dow+'</span><span class="mono">'+i.d+'</span><span class="dt">'+fmt(val(rs.filter(function(r){return r.fecha===d})))+'</span>'+estLine(rs.filter(function(r){return r.fecha===d}))+'</th>'}).join('')+'<th>Total<span class="dt">'+fmt(val(rs))+'</span>'+estLine(rs)+'</th></tr></thead><tbody>';
  Object.keys(groups).sort().forEach(function(p){
    var all=[];Object.keys(groups[p]).forEach(function(k){all=all.concat(groups[p][k])});
    var e=all[0].esp,cl=!!closed[p];
    h+='<tr class="grp'+(cl?' closed':'')+'"><td class="first"><button type="button" data-grp="'+esc(p)+'" aria-expanded="'+!cl+'"><span class="car">▼</span><span class="sw" style="background:var('+ESPVAR[e]+')"></span><span class="mono">'+esc(p)+'</span><span class="muted" style="font-weight:500">'+e+' · '+Object.keys(groups[p]).length+' planes</span></button></td>'+
      days.map(function(d){var v=val(all.filter(function(r){return r.fecha===d}));return'<td class="sub">'+(v?fmt(v):'')+'</td>'}).join('')+'<td class="tot">'+fmt(val(all))+'</td></tr>';
    if(cl)return;
    Object.keys(groups[p]).sort(function(a,b){return groups[p][a][0].txt.localeCompare(groups[p][b][0].txt)}).forEach(function(k){
      var pr=groups[p][k],r0=pr[0],ords={};pr.forEach(function(r){if(r.orden)ords[r.orden]=1});var no=Object.keys(ords).length,wm=worstMat(pr);
      h+='<tr><td class="first"><div class="pl"><span class="t">'+hl(r0.txt)+'</span><span class="m"><span class="mono">'+esc(r0.plan)+'</span><span>'+esc(r0.ciclo||'')+(r0.ciclosAlt?' <span class="alt" title="Otros ciclos en IA10: '+esc(r0.ciclosAlt.join(' / '))+'">+'+(r0.ciclosAlt.length-1)+'</span>':'')+'</span><span>'+pr.length+' pos.</span>'+
        (no?'<span class="pill '+MATCLS[wm]+'">'+(no>1?no+' OT · ':'OT '+Object.keys(ords)[0]+' · ')+esc(wm)+'</span>':'<span class="pill p-none">Sin orden</span>')+'<span>'+esc(statShort(r0.stat))+'</span></span></div></td>';
      days.forEach(function(d){
        var cr=pr.filter(function(r){return r.fecha===d}),v=val(cr),inf=dd(d),c='';
        var re=vReal(cr),es=vEst(cr),tt=esc(r0.txt)+' · '+inf.dow+' '+inf.d;
        if(metric==='hh'&&cr.length&&!re&&!es)c='<div class="bar dash" title="'+cr.length+' posiciones sin orden y sin HH en la hoja de ruta">sin HH</div>';
        else if(metric==='hh'&&!re&&es)c='<div class="bar est" title="'+tt+': ≈'+fmt(es)+' HH estimadas por hoja de ruta ('+cr.length+' pos. sin orden)'+(cr.some(function(r){return r.estAprox})?' · aproximado':'')+'">≈'+fmt(es)+'</div>';
        else if(metric==='hh'&&re&&es){var pm=Math.round(18+44*(re/(cellMax||1)));c='<div class="bar mix" style="background:color-mix(in srgb,var('+ESPVAR[r0.esp]+') '+pm+'%,transparent)" title="'+tt+': '+fmt(re)+' HH con orden + ≈'+fmt(es)+' estimadas">'+fmt(re)+'<small>+≈'+fmt(es)+'</small></div>'}
        else if(v){var pct=Math.round(18+44*(v/(cellMax||1)));c='<div class="bar" style="background:color-mix(in srgb,var('+ESPVAR[r0.esp]+') '+pct+'%,transparent)" title="'+tt+': '+fmt(v)+(metric==='op'?' operaciones':' HH con orden')+'">'+fmt(v)+'</div>'}
        h+='<td class="cell'+(inf.we?' wkend':'')+'">'+c+'</td>'});
      h+='<td class="tot">'+fmt(val(pr))+'</td></tr>';
    });
  });
  h+='</tbody><tfoot><tr><td class="first">Total</td>'+days.map(function(d){return'<td class="cell">'+fmt(val(rs.filter(function(r){return r.fecha===d})))+'</td>'}).join('')+'<td class="tot">'+fmt(val(rs))+'</td></tr></tfoot></table>';
  $('gantt').innerHTML=h;
  $('gSub').textContent=(metric==='op'?'Cantidad de operaciones (posiciones) por plan y día.':(torre?'HH por plan y día: en color, las HH de las órdenes; en rojo con ≈, las HH estimadas por hoja de ruta para los planes que aún no generan orden.':'HH (Trabajo) por plan y día. Los planes sin orden aparecen como "sin HH"; carga una Torre de control para estimarlas.'))+' Toca un puesto responsable para plegarlo.';
}
function renderDetail(rs){
  if(!rs.length){$('detail').innerHTML='<div class="empty">No hay operaciones con estos filtros.</div>';return}
  var cols=[['Fecha',function(r){var i=dd(r.fecha||'0000-00-00');return r.fecha?i.dow+' '+i.d:''}],['Pto. resp.',function(r){return r.pto}],['Especialidad',function(r){return r.esp}],['Plan',function(r){return r.plan}],['Txt plan',function(r){return r.txt},3],['Posición',function(r){return r.pos}],['Ubicación técnica',function(r){return r.ubic}],['Llave',function(r){return r.llave}],['Ciclo',function(r){return r.ciclo}],['Orden',function(r){return r.orden}],['Estatus Ord',function(r){return r.estOrd}],['Estatus Material',function(r){return r.estMat},1],['StatOrdEntrega',function(r){return statShort(r.stat)}],['Cant.',function(r){return fmt(r.cant,1)},2],['HH orden',function(r){return fmt(r.hh,1)},2],['HH estim. hoja ruta',function(r){return r.orden||r.hhEst==null?'':'≈'+fmt(r.hhEst,1)},2]];
  var rows=rs.slice().sort(function(a,b){return(a.fecha+a.pto+a.txt).localeCompare(b.fecha+b.pto+b.txt)});
  $('detail').innerHTML='<table class="d"><thead><tr>'+cols.map(function(c){return'<th>'+c[0]+'</th>'}).join('')+'</tr></thead><tbody>'+rows.map(function(r){return'<tr>'+cols.map(function(c){var v=c[1](r);return c[2]===1?'<td><span class="pill '+MATCLS[v]+'">'+esc(v)+'</span></td>':c[2]===3?'<td>'+hl(v)+'</td>':'<td'+(c[2]===2?' class="n"':'')+'>'+esc(v)+'</td>'}).join('')+'</tr>'}).join('')+'</tbody></table>';
}
function renderAll(){
  renderWeeks();renderSlots();
  var has=!!state&&state.recs.length>0;
  $('main').hidden=!has;$('ctx').hidden=!has;
  var es=$('emptyState');
  if(!has){
    es.hidden=false;
    es.innerHTML=(!dbReady||loadingWeek)?'<p>Cargando la semana…</p>':'<h2>Aún no hay semanas cargadas</h2><p>Arrastra la IP19, la IA10 y la IW38 de la semana que quieres anticipar en el panel de carga al final de la página. Quedará guardada en la lista de semanas.</p><button class="btn primary" type="button" id="emptyLoad">Seleccionar archivos</button>';
    return}
  es.hidden=true;
  renderTabs();renderCtx();
  var base=tabRecs(),rs=base.filter(function(r){return pass(r)}),days=Core.weekDays(week(),base);
  var uniq=function(f){var o={};base.forEach(function(r){o[f(r)]=1});return Object.keys(o)};
  chips('f-mat','mat',MATS.filter(function(e){return uniq(function(r){return r.estMat}).indexOf(e)>=0}));
  chips('f-stat','stat',uniq(function(r){return r.stat}).sort(),statShort);
  chips('f-pto','pto',uniq(function(r){return r.pto}).sort());
  renderTerms();
  seg('m-op','m-hh',metric==='op');['g','d','r'].forEach(function(v){$('v-'+v).setAttribute('aria-pressed',view===v)});
  $('gantt').hidden=view!=='g';$('detail').hidden=view!=='d';$('review').hidden=view!=='r';$('foldAll').hidden=$('unfoldAll').hidden=view!=='g';
  $('gTitle').textContent=(view==='g'?'Carta Gantt':view==='d'?'Detalle de operaciones':'Revisión de datos')+' · Semana '+week()+(tab?' · '+tab:'');
  renderKPIs(rs);renderAlerts(rs);renderDaily(rs,days);
  if(view==='g')renderGantt();else if(view==='d'){renderDetail(rs);$('gSub').textContent=rs.length+' operaciones con los filtros activos.'}else{renderReview(rs);$('gSub').textContent='Puntos a revisar antes de congelar el programa, con los filtros activos.'}
}

/* ---------- Excel ---------- */
function buildWorkbook(){
  var base=state.recs,H=state.headers,I=state.idx,pi=I.pto,wk=week();
  var head=H.slice(0,pi+1).concat(['Especialidad'],H.slice(pi+1),['GrHRuta + CGH','Ciclo','Estatus Ord','Estatus Material','HH estimada hoja de ruta']);
  var numIdx=[I.trabajo,I.cant,I.dur].filter(function(x){return x>=0});
  var rows=base.map(function(r){
    var raw=r.raw.map(function(v,i){if(numIdx.indexOf(i)>=0)return Core.num(v);if(i===I.fecha&&r.fecha){var p=r.fecha.split('-');return new Date(Date.UTC(+p[0],+p[1]-1,+p[2],12))}return v});
    return raw.slice(0,pi+1).concat([r.esp],raw.slice(pi+1),[r.llave,r.ciclo,r.estOrd,r.estMat,r.orden||r.hhEst==null?'':r.hhEst])});
  var wb=XLSX.utils.book_new();
  var wsD=XLSX.utils.aoa_to_sheet([head].concat(rows),{cellDates:true,dateNF:'dd-mm-yyyy'});
  wsD['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:rows.length,c:head.length-1}})};
  var days=Core.weekDays(wk,base);
  function pivot(kind){
    var t=[['Proyeccion Semana '+wk.split('/').reverse().join('.')+' '+(kind==='op'?'OP':'HH')],[],[kind==='op'?'Cuenta de Plan mant.preventivo':'Suma de Trabajo','','','','','','Fecha planificada'],
      ['Pto.tbjo.responsable','Plan mant.preventivo','Txt plan mantenim.','Ciclo','Especialidad','Estatus Material'].concat(days.map(function(d){var p=d.split('-');return new Date(Date.UTC(+p[0],+p[1]-1,+p[2],12))}),['Total general'])];
    var g={};base.forEach(function(r){var k=r.pto+'\u0001'+r.plan+'\u0001'+r.txt;(g[k]=g[k]||[]).push(r)});
    var last='',tot=days.map(function(){return 0}),gt=0;
    Object.keys(g).sort().forEach(function(k){var rs=g[k],r0=rs[0];var line=[r0.pto===last?'':r0.pto,r0.plan,r0.txt,r0.ciclo,r0.esp,worstMat(rs)];last=r0.pto;var s=0;
      days.forEach(function(d,i){var c=rs.filter(function(r){return r.fecha===d});var v=kind==='op'?c.length:c.reduce(function(a,r){return a+r.hh},0);v=Math.round(v*100)/100;line.push(c.length?v:'');tot[i]+=v;s+=v});
      line.push(Math.round(s*100)/100);gt+=s;t.push(line)});
    t.push(['Total general','','','','',''].concat(tot.map(function(v){return Math.round(v*100)/100}),[Math.round(gt*100)/100]));
    var ws=XLSX.utils.aoa_to_sheet(t,{cellDates:true,dateNF:'dd-mm-yyyy'});ws['!cols']=[{wch:16},{wch:12},{wch:44},{wch:24},{wch:15},{wch:28}];return ws}
  XLSX.utils.book_append_sheet(wb,pivot('op'),'Resumen OP');
  XLSX.utils.book_append_sheet(wb,pivot('hh'),'Resumen HH');
  XLSX.utils.book_append_sheet(wb,wsD,'Data');
  if(state.ia10)XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['GrHRuta + CGH','GrHRuta','CGH','Ciclo']].concat(state.ia10.map(function(x){return[x.gr+'-'+x.cgh,x.gr,x.cgh,x.ciclo]}))),'IA10');
  return XLSX.write(wb,{bookType:'xlsx',type:'array'});
}
$('dl').addEventListener('click',function(){
  if(!state)return;
  if(!downloads){toast('Descargar no está disponible en esta vista.');return}
  var data;try{data=buildWorkbook()}catch(e){toast('No se pudo armar el Excel: '+e.message);return}
  var name='Proyeccion Semana '+(week().split('/')[1]||week())+'.xlsx';
  downloads.save({filename:name,data:new Blob([data])}).then(function(){toast('Excel guardado: '+name)},function(e){if(e&&e.code==='declined')return;toast(e&&e.code==='rate_limited'?'Ya hay una descarga pendiente de confirmar.':'No se pudo guardar el archivo.')});
});

/* ---------- Torre de control: almacenamiento ---------- */
var TCHUNK=200000;
function subscribeTorres(){
  db.collection('torres').onSnapshot(function(snap){
    torresMeta={};snap.docs.forEach(function(d){if(d.exists)torresMeta[d.id]=d.data()});
    torresReady=true;
    if(!torreId||(!torresMeta[torreId]&&!torreLoaded[torreId])){var ids=Object.keys(torresMeta).sort();torreId='';torre=null;if(ids.length)openTorre(ids[ids.length-1]);else{rebuildIfOpen();renderTorre()}}
    else renderTorre();
  },function(){torresReady=true;renderTorre()});
}
function rebuildIfOpen(){if(curId&&loaded[curId])rebuild()}
function openTorre(id){
  if(torreLoaded[id]){torreId=id;torre=torreLoaded[id];crossCache={};rebuildIfOpen();renderTorre();return}
  var m=torresMeta[id];if(!m||!db)return;
  torreId=id;torreLoading=true;renderTorre();
  db.collection('torres/'+id+'/parts').get().then(function(snap){
    var parts=snap.docs.filter(function(d){return d.exists}).map(function(d){return d.data()}).sort(function(a,b){return a.i-b.i}).slice(0,m.nChunks||99);
    var t=JSON.parse(parts.map(function(p){return p.s}).join(''));
    torreLoaded[id]=t;torreLoading=false;
    if(torreId===id){torre=t;crossCache={};rebuildIfOpen();renderTorre()}
  },function(){torreLoading=false;toast('No se pudo abrir la Torre guardada.');renderTorre()});
}
/* Excel de la Torre: se guarda en partes (base64) para poder descargarlo después */
var torreFiles={};
function u8ToB64(u){var s='',CH=0x8000;for(var i=0;i<u.length;i+=CH)s+=String.fromCharCode.apply(null,u.subarray(i,i+CH));return btoa(s)}
function b64ToU8(b){var s=atob(b),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u}
function saveTorreFile(id,file){
  if(!db||!file||!file.bytes)return Promise.resolve(0);
  var b=u8ToB64(file.bytes),parts=[];for(var i=0;i<b.length;i+=TCHUNK)parts.push(b.slice(i,i+TCHUNK));
  var old=(torresMeta[id]&&torresMeta[id].xlsxParts)||0,p=Promise.resolve();
  parts.forEach(function(s,i){p=p.then(function(){return db.doc('torres/'+id+'/xlsx/p'+i).set({i:i,s:s})})});
  for(var k=parts.length;k<old;k++)(function(k){p=p.then(function(){return db.doc('torres/'+id+'/xlsx/p'+k).delete()})})(k);
  return p.then(function(){return parts.length},function(){toast('La Torre se guardó, pero su Excel no cupo en el almacenamiento: descárgalo ahora para tenerlo.');return 0});
}
function getTorreFile(id){
  if(torreFiles[id])return Promise.resolve(torreFiles[id]);
  var m=torresMeta[id]||{},sem=m.sem||(torreLoaded[id]&&torreLoaded[id].sem)||'',name=m.xlsxName||m.file||('Torre de control '+sem.replace('/','S')+' FRA.xlsx');
  var fromDb=(db&&m.xlsxParts)?db.collection('torres/'+id+'/xlsx').get().then(function(snap){
    var parts=snap.docs.filter(function(d){return d.exists}).map(function(d){return d.data()}).sort(function(a,b){return a.i-b.i}).slice(0,m.xlsxParts);
    if(parts.length!==m.xlsxParts)return null;return{bytes:b64ToU8(parts.map(function(x){return x.s}).join('')),name:name}}):Promise.resolve(null);
  return fromDb.then(function(f){if(f)return f;
    if(typeof fetch!=='function')return null;
    return fetch('data/torres/'+id+'.xlsx',{cache:'no-cache'}).then(function(r){return r.ok?r.arrayBuffer():null}).then(function(ab){return ab?{bytes:new Uint8Array(ab),name:name}:null},function(){return null});
  }).then(function(f){if(f)torreFiles[id]=f;return f},function(){return null});
}
function downloadTorre(id){
  if(!id)return;
  if(!downloads){toast('Descargar no está disponible en esta vista.');return}
  toast('Preparando el Excel de la Torre…');
  getTorreFile(id).then(function(f){
    if(!f){toast('Esta Torre no tiene su Excel guardado. Vuelve a cargarla (Excel o transacciones) para poder descargarla.');return}
    downloads.save({filename:f.name,data:new Blob([f.bytes])}).then(function(){toast('Excel guardado: '+f.name)},function(e){if(e&&e.code==='declined')return;toast(e&&e.code==='rate_limited'?'Ya hay una descarga pendiente de confirmar.':'No se pudo guardar el archivo.')});
  });
}
function saveTorre(id,t,file){
  if(!db)return Promise.resolve(false);
  var js=JSON.stringify({sem:t.sem,file:t.file,ut:t.ut,pos:t.pos,planes:t.planes,ops:t.ops,hojas:t.hojas,ots:t.ots}),parts=[];
  for(var i=0;i<js.length;i+=TCHUNK)parts.push(js.slice(i,i+TCHUNK));
  var A=Torre.analyze(t),old=(torresMeta[id]&&torresMeta[id].nChunks)||0,p=Promise.resolve();
  parts.forEach(function(s,i){p=p.then(function(){return db.doc('torres/'+id+'/parts/p'+i).set({i:i,s:s})})});
  for(var k=parts.length;k<old;k++)(function(k){p=p.then(function(){return db.doc('torres/'+id+'/parts/p'+k).delete()})})(k);
  var xp=0;p=p.then(function(){return saveTorreFile(id,file).then(function(n){xp=n})});
  return p.then(function(){var meta={sem:t.sem,file:t.file,savedAt:new Date().toISOString(),nChunks:parts.length,
    planes:A.kpi.planesAbiertos,posActivas:A.kpi.posActivas,hhSem:Math.round(A.kpi.hhSem)};
    if(xp){meta.xlsxParts=xp;meta.xlsxName=file.name}else if(torresMeta[id]&&torresMeta[id].xlsxParts&&!file){meta.xlsxParts=torresMeta[id].xlsxParts;meta.xlsxName=torresMeta[id].xlsxName}
    return db.doc('torres/'+id).set(meta)}).then(function(){return true},function(e){
    toast(e&&e.code==='quota_exceeded'?'El almacenamiento está lleno. Elimina torres o semanas antiguas.':'No se pudo guardar la Torre. La ves igual, pero no quedó guardada.');return false});
}
function deleteTorre(id){
  var m=torresMeta[id];if(!db||!m)return;var p=Promise.resolve();
  for(var k=0;k<(m.nChunks||0);k++)(function(k){p=p.then(function(){return db.doc('torres/'+id+'/parts/p'+k).delete()})})(k);
  for(var q=0;q<(m.xlsxParts||0);q++)(function(q){p=p.then(function(){return db.doc('torres/'+id+'/xlsx/p'+q).delete()})})(q);
  delete torreFiles[id];
  p.then(function(){return db.doc('torres/'+id).delete()}).then(function(){delete torreLoaded[id];toast('Torre '+m.sem+' eliminada.')},function(){toast('No se pudo eliminar la Torre.')});
  torreId='';torre=null;tConfirmDel=false;rebuildIfOpen();
}
function isoWeekNow(){var d=new Date(),t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));var day=(t.getUTCDay()+6)%7;t.setUTCDate(t.getUTCDate()-day+3);var y=t.getUTCFullYear(),j4=new Date(Date.UTC(y,0,4));var w=1+Math.round(((t-j4)/86400000-3+((j4.getUTCDay()+6)%7))/7);return y+'/'+(w<10?'0':'')+w}
function applyTorre(t,file){
  if(!t.sem)t.sem=isoWeekNow();
  var id=wid(t.sem);torreLoaded[id]=t;torreId=id;torre=t;crossCache={};if(file)torreFiles[id]=file;rebuildIfOpen();renderTorre();
  var existed=!!torresMeta[id];
  if(!db){toast('Torre '+t.sem+' cargada. No se pudo guardar en esta vista.');return id}
  saveTorre(id,t,file).then(function(ok){if(ok)toast('Torre '+t.sem+(existed?' actualizada.':' guardada.')+' Las HH estimadas ya se aplican a la proyección.')});
  return id;
}
function loadTorreWB(name,wb,file){
  try{
    var sheets=wb.SheetNames.filter(function(n){return wb.Sheets[n]}).map(function(n){return{name:n,aoa:XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:''})}});
    applyTorre(Torre.build(sheets,name),file);
  }catch(e){$('tmsg').innerHTML='<div class="err">'+esc(name+': '+e.message)+'</div>'}
}
/* Torre desde transacciones de SAP */
var txPend={},txNames={};
var TXREQ=[['ih06','IH06','Ubicaciones técnicas',1],['ip16','IP16','Planes',1],['ip18','IP18','Posiciones (con Última orden)',1],['ia10','IA10','Hojas de ruta (formato lista)',1],['iw38','IW38','Órdenes de la "Última orden"',1],['maf','MAF','Operaciones con MAF (opcional)',0]];
function txReady(){return TXREQ.every(function(x){return!x[3]||txPend[x[0]]})}
function renderTx(){
  var any=Object.keys(txPend).length;$('txBox').hidden=!any;if(!any)return;
  $('txSlots').innerHTML=TXREQ.map(function(x){var ok=!!txPend[x[0]];return'<div class="slot '+(ok?'ok':'miss')+'"><span class="dot"></span><b>'+x[1]+'</b><small>'+esc(ok?txNames[x[0]]:(x[3]?'Falta · ':'')+x[2])+'</small></div>'}).join('');
  $('txBuild').disabled=!txReady();
}
function buildTorreTx(){
  if(!txReady())return;
  $('tmsg').innerHTML='<div class="sample-note">Armando la Torre de control con las transacciones… puede tardar unos segundos.</div>';
  setTimeout(function(){
    try{
      var r=TorreTx.build(txPend,Object.keys(txNames).map(function(k){return txNames[k]}));
      var wb=XLSX.utils.book_new();TorreTx.ORDER.forEach(function(n){XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(r.sheets[n],{cellDates:true}),n)});
      var bytes=new Uint8Array(XLSX.write(wb,{bookType:'xlsx',type:'array',compression:true}));
      var t=Torre.build(TorreTx.ORDER.map(function(n){return{name:n,aoa:r.sheets[n]}}),r.fileName);
      var id=applyTorre(t,{bytes:bytes,name:r.fileName});
      txPend={};txNames={};renderTx();
      var st=r.stats;
      $('tmsg').innerHTML='<div class="okmsg"><b>Torre '+esc(r.sem)+' armada.</b> '+fmt(st.ip18,0)+' posiciones, '+fmt(st.ip16,0)+' planes, '+fmt(st.hojas,0)+' hojas de ruta, '+fmt(st.ih06,0)+' ubicaciones y '+fmt(st.ots,0)+' órdenes. <button class="btn primary" type="button" data-tdl="'+esc(id)+'">Descargar '+esc(r.fileName)+'</button></div>';
    }catch(e){$('tmsg').innerHTML='<div class="err">No se pudo armar la Torre: '+esc(e.message)+'</div>'}
  },30);
}
function handleTorreFiles(files){
  var list=[].slice.call(files||[]);if(!list.length)return;
  $('tmsg').innerHTML='<div class="sample-note">Leyendo '+list.length+' archivo(s)…</div>';
  var notes=[];
  Promise.all(list.map(function(f){return readFile(f).then(function(x){return{f:f,x:x}},function(){notes.push(f.name+': no se pudo leer como Excel.');return null})})).then(function(arr){
    var gotTx=false,seen={};
    function addTx(role,a,name){
      var cur=txPend[role];
      if(seen[role]&&cur&&JSON.stringify(cur[0])===JSON.stringify(a[0])){
        var keys={};cur.forEach(function(r){keys[JSON.stringify(r)]=1});
        a.slice(1).forEach(function(r){var k=JSON.stringify(r);if(!keys[k]){keys[k]=1;cur.push(r)}});
        txNames[role]+=' + '+name;
      }else if(seen[role]&&cur&&cur.length>=a.length){return}
      else{txPend[role]=a.slice();txNames[role]=name}
      seen[role]=1;
    }
    arr.forEach(function(o){
      if(!o)return;
      if(o.x.torre){loadTorreWB(o.f.name,o.x.wb,{bytes:o.x.bytes,name:o.f.name});return}
      var hit=false;
      o.x.wb.SheetNames.forEach(function(sn){var a=aoa(o.x.wb.Sheets[sn]);var role=TorreTx.detect(a);if(role&&!hit){addTx(role,a,o.f.name);hit=true;gotTx=true}});
      if(!hit)notes.push(o.f.name+': no lo reconocí como Torre ni como IH06, IP16, IP18, IA10, IW38 o MAF.');
    });
    $('tmsg').innerHTML=notes.length?'<div class="err">'+esc(notes.join(' '))+'</div>':'';
    renderTx();
    if(gotTx&&txReady())buildTorreTx();
  });
}
$('txBuild').addEventListener('click',buildTorreTx);
$('txClear').addEventListener('click',function(){txPend={};txNames={};renderTx();$('tmsg').innerHTML=''});
(function(){var d=$('tdrop');
  ['dragenter','dragover'].forEach(function(e){d.addEventListener(e,function(ev){ev.preventDefault();d.classList.add('over')})});
  ['dragleave','drop'].forEach(function(e){d.addEventListener(e,function(ev){ev.preventDefault();d.classList.remove('over')})});
  d.addEventListener('drop',function(ev){handleTorreFiles(ev.dataTransfer.files)});
  $('tpick').addEventListener('click',function(e){e.stopPropagation();$('tfile').click()});
  d.addEventListener('click',function(){$('tfile').click()});
  d.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();$('tfile').click()}});
  $('tfile').addEventListener('change',function(){handleTorreFiles(this.files);this.value=''});
})();

/* ---------- Torre de control: vista ---------- */
var crossCache={},crossLoading=false;
function pct(a,b){return b?fmt(a/b*100,0)+' %':'—'}
function setPage(p){page=p;document.querySelectorAll('.navb').forEach(function(b){b.setAttribute('aria-selected',b.dataset.page===p)});$('pageProy').hidden=p!=='proy';$('pageTorre').hidden=p!=='torre';if(p==='torre')renderTorre();else renderAll()}
function ensureCross(){
  if(!torre||crossLoading)return;
  var ids=Object.keys(weeksMeta).sort(),need=ids.filter(function(id){return!crossCache[id]});
  if(!need.length)return;
  crossLoading=true;
  Promise.all(need.map(function(id){return fetchWeek(id).then(function(){var st=buildWeek(id);crossCache[id]={sem:weeksMeta[id].sem,days:Core.weekDays(weeksMeta[id].sem,[]),x:Torre.crossWeek(torre,st.recs)}},function(){})})).then(function(){crossLoading=false;if(page==='torre')renderTorre()});
}
function hbRow(label,segs,max,num,title){
  var w=segs.map(function(s){return'<span class="seg" style="width:'+(max?Math.max(0,s[0]/max*100):0)+'%;background:'+s[1]+(s[2]?';'+s[2]:'')+'"></span>'}).join('');
  return'<span class="lab">'+label+'</span><span class="trk" title="'+esc(title||'')+'">'+w+'</span><span class="num">'+num+'</span>';
}
function tableHTML(head,rows,num){return'<div class="rtab"><table><thead><tr>'+head.map(function(h,i){return'<th'+(num&&num.indexOf(i)>=0?' style="text-align:right"':'')+'>'+h+'</th>'}).join('')+'</tr></thead><tbody>'+rows.map(function(r){return'<tr>'+r.map(function(c,i){return'<td'+(num&&num.indexOf(i)>=0?' class="n" style="text-align:right;font-family:var(--f-mono)"':'')+'>'+c+'</td>'}).join('')+'</tr>'}).join('')+'</tbody></table></div>'}
function renderTorre(){
  if(page!=='torre')return;
  var ids=Object.keys(torresMeta).sort();if(torreId&&torreLoaded[torreId]&&ids.indexOf(torreId)<0)ids.push(torreId);
  $('tState').textContent=!torresReady&&db?'Cargando torres guardadas…':!db?'El almacenamiento no está disponible: la Torre que cargues no se guardará.':ids.length?'La Torre seleccionada también entrega las HH estimadas de la proyección.':'';
  $('tList').innerHTML=ids.map(function(id){var m=torresMeta[id],t=torreLoaded[id],sem=m?m.sem:t.sem;
    return'<button type="button" class="wk" data-torre="'+esc(id)+'" aria-pressed="'+(id===torreId)+'"><b>Torre S'+esc(sem.split('/')[1]||sem)+'<span style="font-weight:600;font-size:13px;opacity:.8"> · '+esc(sem.split('/')[0]||'')+'</span></b><small>'+(m?fmt(m.planes,0)+' planes · '+fmt(m.hhSem,0)+' HH/sem':'sin guardar')+'</small></button>'}).join('')+'<button type="button" class="wk add" id="goTLoad">+ Cargar Torre</button>';
  var a='';if(torreId&&!torresMeta[torreId]&&torreLoaded[torreId])a='<button class="btn" type="button" data-tdl="'+esc(torreId)+'">Descargar Torre (Excel)</button>';
  if(torreId&&torresMeta[torreId]){var m=torresMeta[torreId],sv=new Date(m.savedAt);a='<button class="btn" type="button" data-tdl="'+esc(torreId)+'">Descargar Torre (Excel)</button><span class="muted">Guardada el '+sv.toLocaleDateString('es-CL')+' · '+esc(m.file||'')+'</span>'+(tConfirmDel?'<span>¿Eliminar la Torre '+esc(m.sem)+'? <button class="btn danger" type="button" id="tDelYes">Eliminar</button> <button class="linkbtn" type="button" id="tDelNo">Cancelar</button></span>':'<button class="linkbtn danger" type="button" id="tDel">Eliminar esta Torre</button>')}
  $('tActions').innerHTML=a;
  var em=$('tEmpty');
  if(!torre){$('tBody').innerHTML='';$('tSearch').hidden=true;$('tKpis').hidden=true;em.hidden=false;em.innerHTML=(torreLoading||(!torresReady&&db))?'<p>Cargando la Torre de control…</p>':'<h2>Aún no hay una Torre de control cargada</h2><p>Arrastra el Excel de la Torre de control de Flotación en el panel de abajo. Con ella verás la salud del plan matriz y las HH estimadas por hoja de ruta en la proyección.</p>';return}
  em.hidden=true;$('tSearch').hidden=false;$('tKpis').hidden=false;renderSearch();
  var A=torre._A||(torre._A=Torre.analyze(torre)),K=A.kpi,h='';
  /* 1. Indicadores */
  var k=[['Planes abiertos',fmt(K.planesAbiertos,0),fmt(K.posActivas,0)+' posiciones activas'],['Posiciones inactivas',fmt(K.posInactivas,0),'NOAC '+K.noac+' · PTBO '+K.ptbo,'alert'],
    ['Equipos con plan',pct(K.equiposCon,K.equipos),fmt(K.equiposCon,0)+' de '+fmt(K.equipos,0)+' equipos (nivel 5 y 6)'],['Formato nuevo',fmt(K.neoPos*100,0)+' %','de las posiciones activas'],
    ['Hojas con material',pct(K.hojasConMaterial,K.hojasActivas),K.hojasConMaterial+' de '+K.hojasActivas+' hojas de ruta activas'],['Carga teórica',fmt(K.hhSem,0),'HH por semana del plan matriz activo']];
  $('tKpis').innerHTML=k.map(function(x){return'<div class="panel kpi'+(x[3]?' '+x[3]:'')+'"><span class="eyebrow">'+x[0]+'</span><span class="v">'+x[1]+'</span><span class="s">'+esc(x[2])+'</span></div>'}).join('');
  /* 2. Semanas proyectadas vs carga teórica */
  ensureCross();
  var wids=Object.keys(weeksMeta).sort().filter(function(id){return crossCache[id]}),teo={};
  A.pto.forEach(function(r){teo[r.esp]=(teo[r.esp]||0)+r.hhSem});
  h+='<section class="panel tsec"><h2>Semanas proyectadas frente a la carga teórica</h2><p>La carga teórica es el promedio semanal que exige el plan matriz activo: personas × horas de cada operación de la hoja de ruta, dividido por su ciclo en semanas. Cada semana proyectada suma las HH de las órdenes y, en rojo, las HH estimadas por hoja de ruta de los planes que aún no generan orden. Una semana muy por sobre la línea teórica concentra trabajo; muy por debajo, puede indicar planes que no están saltando.</p>';
  if(!wids.length)h+='<div class="empty">'+(Object.keys(weeksMeta).length?'Cargando las semanas guardadas…':'Aún no hay semanas proyectadas guardadas.')+'</div>';
  else{
    h+='<div class="cmp">'+['Mecánico','Eléctrico','Instrumentación'].map(function(e){
      var max=teo[e]||0;wids.forEach(function(id){var p=crossCache[id].x.porEsp[e]||{real:0,est:0};max=Math.max(max,p.real+p.est)});
      var rows=hbRow('Teórica semanal',[[teo[e]||0,'var(--ink)']],max,fmt(teo[e]||0,0)+' HH');
      wids.forEach(function(id){var c=crossCache[id],p=c.x.porEsp[e]||{real:0,est:0},tot=p.real+p.est,dv=teo[e]?((tot/teo[e]-1)*100):0;
        rows+=hbRow('Semana '+esc(c.sem.split('/')[1]||c.sem),[[p.real,'var('+ESPVAR[e]+')'],[p.est,'var(--bad-soft)','outline:1px dashed var(--bad);outline-offset:-1px']],max,fmt(tot,0)+' HH <span class="'+(Math.abs(dv)>25?'pill '+(dv>0?'p-bad':'p-warn'):'muted')+'" style="font-size:11px">'+(dv>0?'+':'')+fmt(dv,0)+' %</span>',fmt(p.real,1)+' HH con orden + '+fmt(p.est,1)+' HH estimadas')});
      return'<div class="cmp-grp"><h3><span class="sw" style="background:var('+ESPVAR[e]+')"></span>'+e+'</h3><div class="hb">'+rows+'</div></div>'}).join('')+'</div>';
    h+=tableHTML(['Semana','Fechas','Operaciones','HH con orden','HH estimadas','Total','Teórica','Criticidad (E · A · M · B)','Planes inactivos en la Torre'],
      wids.map(function(id){var c=crossCache[id],x=c.x,tot=x.hhReal+x.hhEst,tt=K.hhSem;
        return['<b>'+esc(c.sem)+'</b>',esc(c.days.length?dd(c.days[0]).d+' al '+dd(c.days[6]).d:''),fmt(x.ops,0),fmt(x.hhReal,0),'<span style="color:var(--bad)">≈'+fmt(x.hhEst,0)+'</span>','<b>'+fmt(tot,0)+'</b>',fmt(tt,0),
          '<span class="pill p-bad">E '+x.abc.E+'</span> <span class="pill p-warn">A '+x.abc.A+'</span> <span class="pill p-info">M '+x.abc.M+'</span> <span class="pill p-none">B '+x.abc.B+'</span>'+(x.abc['']?' <span class="muted">· '+x.abc['']+' sin ABC</span>':''),
          x.inact.length?'<span class="pill p-warn" title="'+esc(x.inact.map(function(i){return i[0]+' '+i[1]+' ('+i[2]+')'}).join('\n'))+'">'+x.inact.length+'</span>':'—']}),[2,3,4,5,6]);
  }
  h+='</section>';
  /* 3. Por puesto responsable */
  var pr=A.pto.filter(function(r){return r.act>0}),mx=Math.max.apply(null,pr.map(function(r){return r.hhSem}).concat([1]));
  h+='<section class="panel tsec"><h2>Plan matriz por puesto responsable</h2><p>Cuánto exige cada puesto por semana y qué tan sano está su plan: posiciones que nunca han generado orden, las que se generan a mano, cobertura de material en la hoja de ruta y cumplimiento del formato nuevo.</p><div class="hb">'+
    pr.map(function(r){return hbRow('<span class="mono">'+esc(r.pto)+'</span>',[[r.hhSem,'var('+ESPVAR[r.esp]+')']],mx,fmt(r.hhSem,0)+' HH/sem')}).join('')+'</div>'+
    tableHTML(['Pto. responsable','Especialidad','Planes','Pos. activas','Pos. inactivas','Nunca generaron OT','Manuales','Con material','Formato nuevo','HH/semana'],
      pr.map(function(r){return['<span class="mono">'+esc(r.pto)+'</span>',r.esp,r.nPlanes,r.act,r.inact,r.nuncaOT?'<span class="pill p-warn">'+r.nuncaOT+'</span>':'0',r.manual,pct(r.conMat,r.act),pct(r.neo,r.act),'<b>'+fmt(r.hhSem,0)+'</b>']}),[2,3,4,6,7,8,9])+'</section>';
  /* 3b. Por puesto ejecutor */
  var ej=A.ejec.filter(function(x){return x.code!=='(sin puesto)'}),emx=Math.max.apply(null,ej.map(function(x){return x.hhSem}).concat([1]));
  h+='<section class="panel tsec"><h2>Carga teórica por puesto ejecutor</h2><p>Qué cuadrilla o empresa ejecuta el plan matriz activo, según el puesto de cada operación de la hoja de ruta y la tabla de puestos de Flotación. Sirve para contrastar las HH por semana con la dotación contratada de cada empresa.</p><div class="hb">'+
    ej.slice(0,14).map(function(x){return hbRow('<span class="mono">'+esc(x.code)+'</span>',[[x.hhSem,x.enTabla?'var(--accent)':'var(--bad)']],emx,fmt(x.hhSem,0)+' HH/sem',x.desc)}).join('')+'</div>'+
    tableHTML(['Puesto','Descripción','Empresa ejecutora','Estado','Operaciones','Posiciones','Planes','HH/semana'],ej.map(function(x){return['<span class="mono">'+esc(x.code)+'</span>',x.enTabla?esc(x.desc):'<span class="pill p-warn">No está en la tabla de puestos</span>',esc(x.emp),esc(x.estado),x.ops,x.nPos,x.nPlanes,'<b>'+fmt(x.hhSem,1)+'</b>']}),[4,5,6,7])+'</section>';
  /* 4. Cobertura + top planes */
  var cov=A.cov,labs={E:'Esencial',A:'Alta',M:'Media',B:'Baja','':'Sin criticidad'},cmax=Math.max.apply(null,Object.keys(cov).map(function(k){return cov[k].total}).concat([1]));
  h+='<div class="grid2"><section class="panel tsec"><h2>Cobertura de equipos por criticidad</h2><p>Equipos de nivel 5 y 6 en la IH06. En turquesa, con plan activo; en dorado, solo con planes inactivos; el resto, sin plan.</p><div class="hb">'+
    ['E','A','M','B',''].map(function(k){var c=cov[k],sin=c.total-c.con-c.soloInact;return hbRow(labs[k],[[c.con,'var(--mec)'],[c.soloInact,'var(--ele)'],[sin,'var(--line)']],cmax,pct(c.con,c.total)+' <span class="muted">('+c.con+'/'+c.total+')</span>')}).join('')+'</div>'+
    (A.covGaps.length?'<details class="dq"><summary>Equipos críticos sin plan activo <span class="pill p-bad">'+A.covGaps.length+'</span></summary>'+tableHTML(['Criticidad','Ubicación técnica','Denominación','Pto. resp.','Planes inactivos'],A.covGaps.sort(function(a,b){return'EAM'.indexOf(a[5])-'EAM'.indexOf(b[5])}).map(function(u){return['<span class="pill '+(u[5]==='E'?'p-bad':u[5]==='A'?'p-warn':'p-info')+'">'+labs[u[5]]+'</span>','<span class="mono">'+esc(u[0])+'</span>',esc(u[1]),'<span class="mono">'+esc(u[4])+'</span>',u[8]||'—']}))+'</details>':'')+'</section>'+
    '<section class="panel tsec"><h2>Planes con mayor carga semanal</h2><p>Los planes que más pesan en la carga teórica. Revisa que la hoja de ruta corresponda al objeto: por ejemplo, un cajón con la misma hoja de un agitador infla la carga.</p>'+
    tableHTML(['Plan','Txt plan','Pto.','Posiciones','HH/sem'],A.topPlanes.map(function(p){return['<span class="mono">'+esc(p.plan)+'</span>',esc(p.txt),'<span class="mono">'+esc(p.pto)+'</span>',p.nPos,'<b>'+fmt(p.hh,1)+'</b>']}),[3,4])+'</section></div>';
  /* 4b. Tipo de equipo */
  var EQ=(A.equipos||[]).filter(function(x){return x.n>1||x.pos>0});
  if(EQ.length){var eqs=EQ.filter(function(x){return x.n>0&&x.con<x.n}).sort(function(a,b){return(b.n-b.con)-(a.n-a.con)});
    h+='<section class="panel tsec"><h2>Carga por tipo de equipo</h2><p>Equipos de nivel 5 agrupados por su código (el 5° tramo de la ubicación técnica, por ejemplo CAJT1 = cajón traspaso N°1), con la descripción del catálogo de nomenclaturas GCON. Sirve para comparar el mismo tipo de equipo entre líneas.</p>'+
      tableHTML(['Código','Tipo de equipo','Equipos','Con plan','Pos. activas','Planes','HH/sem'],EQ.slice(0,25).map(function(x){return['<span class="mono">'+esc(x.code)+'</span>',esc(x.desc)+(x.enCat?'':' <span class="pill p-warn">no está en el catálogo</span>'),x.n,x.con,x.pos,x.nPlanes,fmt(x.hhSem,1)]}),[2,3,4,5,6])+
      (eqs.length?'<details class="dq"><summary>Tipos de equipo con equipos sin plan activo <span class="pill p-warn">'+eqs.length+'</span></summary>'+tableHTML(['Código','Tipo de equipo','Equipos','Sin plan'],eqs.map(function(x){return['<span class="mono">'+esc(x.code)+'</span>',esc(x.desc),x.n,x.n-x.con]}),[2,3])+'</details>':'')+
      '<p class="muted" style="margin-top:8px">Se muestran los 25 tipos con más carga. Para ver un tipo en detalle, búscalo en el buscador con "Tipo de equipo".</p></section>';}
  /* 5. Órdenes */
  var O=A.ots;
  if(O.total){var smax=Math.max(O.st.CERR,O.st.CTEC,O.st['LIB.'],O.st.ABIE,1),mm=Math.max(O.mat.FMAT,O.mat.KKMP,O.mat.MACO,1);
    h+='<section class="panel tsec"><h2>Órdenes del plan matriz</h2><p>Status de sistema de las '+fmt(O.total,0)+' órdenes en la Torre. El estado del material se mide sobre las órdenes abiertas o liberadas.</p><div class="grid2"><div class="hb">'+
      [['Cerradas (CERR)',O.st.CERR,'var(--ink)'],['Cerradas técnicamente (CTEC)',O.st.CTEC,'var(--muted)'],['Liberadas (LIB.)',O.st['LIB.'],'var(--accent)'],['Abiertas (ABIE)',O.st.ABIE,'var(--ele)']].map(function(x){return hbRow(x[0],[[x[1],x[2]]],smax,fmt(x[1],0))}).join('')+'</div><div class="hb">'+
      [['Sin componentes (KKMP)',O.mat.KKMP,'var(--muted)'],['Material confirmado (MACO)',O.mat.MACO,'var(--mec)'],['Falta material (FMAT)',O.mat.FMAT,'var(--bad)']].map(function(x){return hbRow(x[0],[[x[1],x[2]]],mm,fmt(x[1],0))}).join('')+'</div></div>'+
      (O.fmat.length?'<details class="dq" open><summary>Órdenes con falta de material <span class="pill p-bad">'+O.fmat.length+'</span></summary>'+tableHTML(['Orden','Status usuario','Status sistema','Texto'],O.fmat.map(function(o){return['<span class="mono">'+esc(o[0])+'</span>',esc(o[1]),esc(o[2]),esc(o[3])]}))+'</details>':'')+'</section>';}
  /* 6. Calidad del dato */
  var P=Torre.P;
  h+='<section class="panel tsec"><h2>Calidad del dato del plan matriz</h2><p>Puntos que afectan la proyección y la carga: si no se corrigen, los planes no saltan o las HH no se pueden estimar.</p>'+
    dq('Posiciones activas que nunca han generado orden','p-warn',A.nuncaOT.length,['Plan','Txt plan','Posición','Ubicación técnica','Pto.','Criticidad'],A.nuncaOT.map(function(p){return['<span class="mono">'+esc(p[P.plan])+'</span>',esc(p[P.txt]),esc(p[P.ptxt]),'<span class="mono">'+esc(p[P.ut])+'</span>','<span class="mono">'+esc(p[P.pto])+'</span>',esc(p[P.abc]||'—')]}))+
    dq('Ciclo del texto distinto al ciclo del paquete','p-warn',A.cicloDescuadre.length,['Llave','Plan','Texto del ciclo','Ciclo del paquete','Pto.'],A.cicloDescuadre.map(function(d){return['<span class="mono">'+esc(d[0])+'</span>',esc(d[1]),esc(d[2]),esc(d[3]),'<span class="mono">'+esc(d[4])+'</span>']}))+
    dq('Operaciones sin personas u horas en hojas activas','p-warn',A.sinHoras.length,['Llave','Operación','Ciclo','Pto.','Plan'],A.sinHoras.map(function(d){return['<span class="mono">'+esc(d[0])+'</span>',esc(d[1]),esc(d[2]),'<span class="mono">'+esc(d[3])+'</span>',esc(d[4])]}))+
    dq('Equipos detenidos con plan activo','p-info',A.detenido.length,['Plan','Txt plan','Ubicación técnica','Denominación','Pto.'],A.detenido.map(function(p){return['<span class="mono">'+esc(p[P.plan])+'</span>',esc(p[P.txt]),'<span class="mono">'+esc(p[P.ut])+'</span>',esc(p[P.den]),'<span class="mono">'+esc(p[P.pto])+'</span>']}))+
    '<p style="font-size:12px">Supuesto: los ciclos por horas de operación (por ejemplo 1.750 o 7.000 horas) se convierten a semanas con 168 horas por semana, es decir, equipo operando continuo. Afecta a '+fmt(A.opsCicloHoras,0)+' operaciones.</p></section>';
  $('tBody').innerHTML=h;
}

/* ---------- Torre: buscador de planes ---------- */
var TF={txt:'Txt plan',ut:'Ubicación',den:'Denominación',pt:'Puesto',def:'Def. puesto',hr:'Hoja de ruta',plan:'N° plan',eq:'Tipo de equipo',all:'Todos'},tview='b',tField='txt',TS={terms:[],st:new Set()};
try{var _ts=JSON.parse(localStorage.getItem('torreBusqueda')||'null');if(_ts&&Array.isArray(_ts.terms))TS.terms=_ts.terms.filter(function(x){return x&&TF[x.f]&&x.v})}catch(e){}
function saveTS(){try{localStorage.setItem('torreBusqueda',JSON.stringify({terms:TS.terms}))}catch(e){}}
var P_=Torre.P;
function stOf(p){var s=p[P_.st]||'';return s==='ABIE'?'Activa':/PTBO/.test(s)?'Para borrar (PTBO)':/NOAC/.test(s)?'Inactiva (NOAC)':'Sin plan'}
/* Hoja de ruta: "82114" = todos sus contadores; "82114-1" = solo ese; texto = busca en el nombre de la hoja */
function hrNorm(v){var m=String(v).trim().match(/^0*(\d+)\s*(?:[-\s]\s*0*(\d+))?$/);return m?{g:m[1],c:m[2]||''}:null}
function fHit(r,f,v){
  if(f==='plan'){var pn=String(r.p[P_.plan]||'').replace(/^0+/,''),q=String(v).replace(/\s+/g,'').replace(/^0+/,'');return!!q&&pn.indexOf(q)>=0}
  if(f==='hr'){var n=hrNorm(v),k=String(r.p[P_.key]||'').split('-');if(n)return k[0]===n.g&&(!n.c||k[1]===n.c);return r.f.hr.indexOf(v)>=0}
  if(f==='all')return r.f.txt.indexOf(v)>=0||r.f.ut.indexOf(v)>=0||r.f.den.indexOf(v)>=0||r.f.pt.indexOf(v)>=0||r.f.def.indexOf(v)>=0||fHit(r,'hr',v)||fHit(r,'plan',v)||(r.f.eq||'').indexOf(v)>=0;
  return(r.f[f]||'').indexOf(v)>=0;
}
function tMatch(r,skipSt){
  if(!skipSt&&TS.st.size&&!TS.st.has(stOf(r.p)))return false;
  var g={};TS.terms.forEach(function(x){(g[x.f]=g[x.f]||[]).push(x.v)});
  return Object.keys(g).every(function(f){return g[f].some(function(v){return fHit(r,f,v)})});
}
function hlT(txt,f){
  var out=esc(txt),ts=TS.terms.filter(function(x){return x.f===f||x.f==='all'}).map(function(x){return x.v});if(!ts.length||!txt)return out;
  var fo=Core.fold(txt),marks=[];ts.forEach(function(v){var i=-1;while((i=fo.indexOf(v,i+1))>=0)marks.push([i,i+v.length])});
  if(!marks.length)return out;marks.sort(function(a,b){return a[0]-b[0]});var res='',pos=0;
  marks.forEach(function(m){if(m[0]<pos)return;res+=esc(txt.slice(pos,m[0]))+'<mark>'+esc(txt.slice(m[0],m[1]))+'</mark>';pos=m[1]});return res+esc(txt.slice(pos));
}
function tResults(){if(!torre)return[];return Torre.searchRows(torre).filter(function(r){return tMatch(r)}).sort(function(a,b){return(a.p[0]+'|'+a.p[5]).localeCompare(b.p[0]+'|'+b.p[5])})}
function renderSearch(){
  if(!torre)return;
  var all=Torre.searchRows(torre);
  document.querySelectorAll('[data-tf]').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.tf===tField)});
  $('tq').placeholder=tField==='eq'?'Ej.: CAJT1, cajon traspaso, agitador':tField==='plan'?'Ej.: 13001234 (sin ceros a la izquierda también sirve)':tField==='hr'?'Ej.: 82114 o 82114-1, valvula musculo':tField==='ut'?'Ej.: CHCO-FL-RMO, BBA':tField==='den'?'Ej.: espesador, celda':tField==='pt'?'Ej.: CCOMXM28, CCOAXRMI':tField==='def'?'Ej.: ingenalse, skf, mecanico ext':'Ej.: bomba, bba';
  $('tEmpRow').hidden=tField!=='def';
  if(tField==='def'){var ec={};all.forEach(function(r){var seen={};r.emps.forEach(function(e){if(!seen[e]){seen[e]=1;ec[e]=(ec[e]||0)+1}})});
    $('tEmp').innerHTML=Object.keys(ec).sort(function(a,b){return ec[b]-ec[a]}).map(function(e){var on=TS.terms.some(function(x){return x.f==='def'&&x.v===Core.fold(e)});return'<button type="button" class="chip" data-temp="'+esc(e)+'" aria-pressed="'+on+'">'+esc(e)+'<span class="n">'+ec[e]+'</span></button>'}).join('')}
  $('tTerms').innerHTML=TS.terms.map(function(x,i){var n=all.filter(function(r){return fHit(r,x.f,x.v)}).length;
    return'<button type="button" class="chip term tterm" data-tterm="'+i+'" aria-label="Quitar '+esc(x.v)+'"><b>'+TF[x.f]+'</b>'+esc(x.v)+'<span class="n">'+n+'</span><span class="x" aria-hidden="true">×</span></button>'}).join('');
  var base=all.filter(function(r){return tMatch(r,true)});
  $('tSt').innerHTML=['Activa','Inactiva (NOAC)','Para borrar (PTBO)','Sin plan'].map(function(s){var n=base.filter(function(r){return stOf(r.p)===s}).length;if(!n&&!TS.st.has(s))return'';return'<button type="button" class="chip" data-tst="'+esc(s)+'" aria-pressed="'+TS.st.has(s)+'">'+s+'<span class="n">'+n+'</span></button>'}).join('');
  var rs=tResults(),plans={},uts={},he=0,hs=0;rs.forEach(function(r){if(r.p[0])plans[r.p[0]]=1;uts[r.p[5]]=1;he+=r.hhExec||0;if(r.p[P_.st]==='ABIE')hs+=r.hhSem});
  $('tSum').innerHTML=TS.terms.length||TS.st.size?'<span class="pill p-info">'+fmt(rs.length,0)+' posiciones</span><span class="pill p-info">'+fmt(Object.keys(plans).length,0)+' planes</span><span class="pill p-info">'+fmt(Object.keys(uts).length,0)+' ubicaciones</span><span class="pill p-none">'+fmt(he,1)+' HH por ejecución</span><span class="pill p-none">'+fmt(hs,1)+' HH/semana (activas)</span>':'<span class="muted" style="font-size:13px">Agrega un término para buscar entre las '+fmt(all.length,0)+' posiciones de la Torre '+esc(torre.sem)+'.</span>';
  if(!TS.terms.length&&!TS.st.size){$('tRes').innerHTML='';return}
  if(!rs.length){$('tRes').innerHTML='<div class="empty">Ninguna posición cumple la búsqueda.</div>';return}
  var LIM=400,abcC={E:'p-bad',A:'p-warn',M:'p-info',B:'p-none'},stC={'Activa':'p-ok','Inactiva (NOAC)':'p-warn','Para borrar (PTBO)':'p-bad','Sin plan':'p-none'};
  $('tRes').innerHTML=(rs.length>LIM?'<div class="hint muted" style="padding:8px 12px;margin:0">Mostrando '+LIM+' de '+fmt(rs.length,0)+' posiciones. La descarga incluye todas.</div>':'')+
    '<table class="d"><thead><tr><th>Plan</th><th>Status</th><th>Txt plan MT</th><th>Posición</th><th>Ubicación técnica</th><th>Denominación UT</th><th>ABC</th><th>Pto. resp.</th><th>Puesto de trabajo (ejecutor)</th><th>Hoja de ruta</th><th>Ciclo</th><th>HH por ejecución</th><th>HH/sem</th><th>Última OT</th></tr></thead><tbody>'+
    rs.slice(0,LIM).map(function(r){var p=r.p,s=stOf(p);return'<tr><td class="mono">'+(p[P_.plan]?hlT(String(p[P_.plan]),'plan'):'—')+'</td><td><span class="pill '+stC[s]+'">'+s+'</span></td><td>'+hlT(p[P_.txt],'txt')+'</td><td>'+hlT(p[P_.ptxt],'txt')+'</td><td class="mono">'+hlT(p[P_.ut],'ut')+'</td><td>'+hlT(p[P_.den],'den')+'</td><td>'+(p[P_.abc]?'<span class="pill '+(abcC[p[P_.abc]]||'p-none')+'">'+esc(p[P_.abc])+'</span>':'')+'</td><td class="mono">'+hlT(p[P_.pto],'pt')+'</td><td>'+(r.ejec.length?r.ejec.map(function(c,i){return'<span class="mono">'+hlT(c,'pt')+'</span>'+(r.defs[i]?'<br><span class="muted" style="font-size:11.5px">'+hlT(r.defs[i],'def')+(r.emps[i]?' · '+hlT(r.emps[i],'def'):'')+'</span>':'<br><span class="pill p-warn" style="font-size:10.5px">sin descripción</span>')}).join('<br>'):'—')+'</td><td class="mono">'+hlT(p[P_.key],'hr')+'</td><td>'+esc(p[P_.ctx])+'</td><td class="n">'+(r.hhExec==null?'—':fmt(r.hhExec,1))+'</td><td class="n">'+fmt(r.hhSem,2)+'</td><td class="mono">'+(p[P_.ot]?esc(p[P_.ult]):'<span class="pill p-warn">Nunca</span>')+'</td></tr>'}).join('')+'</tbody></table>';
}
$('tTermForm').addEventListener('submit',function(e){e.preventDefault();
  $('tq').value.split(/[,;]+/).forEach(function(p){var v=Core.fold(p).trim();if(tField==='hr'){var hn=hrNorm(v);if(hn)v=hn.g+(hn.c?'-'+hn.c:'')}if(tField==='plan')v=v.replace(/\s+/g,'').replace(/^0+(?=\d)/,'');if(v&&!TS.terms.some(function(x){return x.f===tField&&x.v===v}))TS.terms.push({f:tField,v:v})});
  $('tq').value='';saveTS();renderSearch()});
$('tClear').addEventListener('click',function(){TS.terms=[];TS.st.clear();saveTS();renderSearch()});
document.addEventListener('click',function(e){var t;
  if((t=e.target.closest('[data-tf]'))){tField=t.dataset.tf;renderSearch();$('tq').focus();return}
  if((t=e.target.closest('[data-temp]'))){var v=Core.fold(t.dataset.temp),ix=-1;TS.terms.forEach(function(x,i){if(x.f==='def'&&x.v===v)ix=i});if(ix>=0)TS.terms.splice(ix,1);else TS.terms.push({f:'def',v:v});saveTS();renderSearch();return}
  if((t=e.target.closest('[data-tterm]'))){TS.terms.splice(+t.dataset.tterm,1);saveTS();renderSearch();return}
  if((t=e.target.closest('[data-tst]'))){var s=t.dataset.tst;TS.st.has(s)?TS.st.delete(s):TS.st.add(s);renderSearch();return}
});
$('tDl').addEventListener('click',function(){
  if(!torre)return;var rs=tResults();if(!rs.length){toast('No hay resultados para descargar.');return}
  if(!downloads){toast('Descargar no está disponible en esta vista.');return}
  var head=['Plan mant.prev.','Status','Status sistema','Txt plan MT','Pos.mantenim.','TxtPosicManten','Ubicac.técnica','Denominación U.T.','Nivel','Indicador ABC','Pto.tbjo.resp.','Puesto Trab','Def. Puesto Trabajo','Estado puesto','Empresa ejecutora','Todos los ejecutores de la hoja','H&C','Texto Ciclo','HH por ejecución','HH por semana','Tiene OT','Última orden','Automático','Con material','Formato nuevo','Estado equipo'];
  var rows=rs.map(function(r){var p=r.p;return[p[P_.plan],stOf(p),p[P_.st],p[P_.txt],p[P_.pos],p[P_.ptxt],p[P_.ut],p[P_.den],p[P_.niv],p[P_.abc],p[P_.pto],r.pt1||'--',r.def||'-',r.est||'-',r.emp||'',r.ejec.map(function(c,i){return c+(r.defs[i]?' ('+r.defs[i]+')':'')}).join('; '),p[P_.key],p[P_.ctx],r.hhExec==null?'':r.hhExec,r.hhSem,p[P_.ot]?'Si':'No',p[P_.ult],p[P_.auto],p[P_.mat]?'Con Material':'',p[P_.neo],p[P_.eq]]});
  var crit=TS.terms.map(function(x){return TF[x.f]+': '+x.v}).concat(TS.st.size?['Status: '+Array.from(TS.st).join(', ')]:[]).join(' · ');
  var wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet([['Búsqueda Torre de control '+torre.sem],[crit],[]].concat([head],rows));
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:3,c:0},e:{r:3+rows.length,c:head.length-1}})};ws['!cols']=head.map(function(h,i){return{wch:[3,5,6,7].indexOf(i)>=0?36:14}});
  XLSX.utils.book_append_sheet(wb,ws,'Resultados');
  var name='Busqueda Torre '+(torre.sem.split('/')[1]||'')+'.xlsx';
  downloads.save({filename:name,data:new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})])}).then(function(){toast('Excel guardado: '+name)},function(e){if(e&&e.code==='declined')return;toast('No se pudo guardar el archivo.')});
});

function dq(title,cls,n,head,rows){if(!n)return'';return'<details class="dq"><summary>'+esc(title)+' <span class="pill '+cls+'">'+n+'</span></summary>'+tableHTML(head,rows)+'</details>'}
document.addEventListener('click',function(e){
  var t;
  if((t=e.target.closest('.navb'))){setPage(t.dataset.page);return}
  if((t=e.target.closest('[data-torre]'))){var id=t.dataset.torre;if(id!==torreId)openTorre(id);return}
  if(e.target.closest('#goTLoad')){$('tdrop').scrollIntoView({behavior:'smooth'});return}
  if((t=e.target.closest('[data-tdl]'))){downloadTorre(t.dataset.tdl);return}
  if(e.target.closest('#tDel')){tConfirmDel=true;renderTorre();return}
  if(e.target.closest('#tDelNo')){tConfirmDel=false;renderTorre();return}
  if(e.target.closest('#tDelYes')){deleteTorre(torreId);renderTorre();return}
});

/* ---------- Inicio ---------- */
renderAll();
if(window.claude&&window.claude.use){
  window.claude.use('downloads').then(function(d){downloads=d;$('dl').hidden=!d},function(){$('dl').hidden=true});
  window.claude.use('db').then(function(d){db=d;if(db){subscribeWeeks();subscribeTorres()}else{dbReady=true;torresReady=true;renderAll()}},function(){dbReady=true;torresReady=true;renderAll()});
}else{dbReady=true;$('dl').hidden=true;renderAll()}
})();
