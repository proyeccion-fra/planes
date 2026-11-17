# Cambios propios de la versión para áreas. build_area.py lo ejecuta con exec() pasando R, t, j, h, P.
import json as _j

# ---------- 1) Torre: tabla de puestos de toda la concentradora + hoja UTS
_rows = _j.load(open('/home/claude/area/datos_area.json'))
_P = {}
for _r in _rows[2:]:
    if len(_r) > 11 and _r[11]:
        _f = lambda i: '' if i >= len(_r) or _r[i] is None else str(_r[i]).strip()
        _P[_f(11)] = [_f(12), _f(13), _f(14), _f(15), _f(16), _f(17)]
t = R(t, "  var PUESTOS = {};\n", "  var PUESTOS0 = " + _j.dumps(_P, ensure_ascii=False) + ";\n  var PUESTOS = PUESTOS0;\n", 'p0')
t = R(t, "    PUESTOS = t.puestos || {};\n", "    PUESTOS = t.puestos ? Object.assign({}, PUESTOS0, t.puestos) : PUESTOS0;\n", 'idx2')
t = R(t, "    if (/^datos$/.test(nm)) return 'datos';", "    if (/^datos$/.test(nm)) return 'datos';\n    if (/^uts$/.test(nm)) return 'uts';", 'uts role')
t = R(t, "      else if (role === 'datos' && !t.puestos) t.puestos = parseDatos(sh.aoa);\n    });",
      "      else if (role === 'datos' && !t.puestos) t.puestos = parseDatos(sh.aoa);\n      else if (role === 'uts') uts = parseUTS(sh.aoa);\n    });\n"
      "    if (uts) { t.puestos = t.puestos || {}; Object.keys(uts).forEach(function (k) { if (!t.puestos[k]) t.puestos[k] = uts[k]; }); }", 'uts build')
t = R(t, "    var t = { sem: semFromName(fileName), file: fileName,", "    var uts = null;\n    var t = { sem: semFromName(fileName), file: fileName,", 'uts var')
t = R(t, "  function sheetRole(name, aoa) {", r"""  /* Hoja UTS: tabla de puestos de trabajo de toda la concentradora (PtoTbjo, Ctro, Tp., Respons., Descripción, Empresa, Especialidad, Área) */
  function parseUTS(aoa) {
    for (var r = 0; r < Math.min(aoa.length, 10); r++) {
      var row = (aoa[r] || []).map(h), pc = row.indexOf('ptotbjo'); if (pc < 0) continue;
      var f = function (nm) { return row.indexOf(nm, pc); }, ix = { t: f('tp.'), r: f('respons.'), d: f('descripción'), e: f('empresa'), s: f('especialidad'), a: f('área') }, out = {}, n0 = 0;
      for (var i = r + 1; i < aoa.length; i++) { var a = aoa[i] || [], k = s(a[pc]); if (!k) continue;
        var g = function (j) { return j >= 0 ? s(a[j]) : ''; }, resp = g(ix.e) === 'PTO. TBJO RESP';
        out[k] = [resp ? 'P.T. Resp.' : '', g(ix.r), g(ix.t), g(ix.d), resp ? '' : [g(ix.e), g(ix.s)].filter(Boolean).join(' '), g(ix.a)]; n0++; }
      return n0 ? out : null;
    }
    return null;
  }

  function sheetRole(name, aoa) {""", 'parseUTS')
t = R(t, "var WANT = /ih06|ip18|ip16|^ia10|^ots?$|^datos$/i;", "var WANT = /ih06|ip18|ip16|^ia10|^ots?$|^datos$|^uts$/i;", 'want2')

# ---------- 2) Armar la Torre desde transacciones (tabla de puestos de todas las áreas)
tx = open(P + 'torretx.js').read()
tx = R(tx, "var DATOS = /*DATOS_FRA*/null;", "var DATOS = " + open('/home/claude/area/datos_area.json').read() + ";", 'tx datos')
tx = tx.replace("'IH06 (UT_fra)'", "'IH06 (UT)'")
tx = R(tx, """    var sem = semFromNames(names || []);
    return { sheets: S, sem: sem, fileName: 'Torre de control ' + sem.replace('/', 'S') + ' FRA.xlsx',""",
"""    var sem = semFromNames(names || []), ac = {};
    ih.forEach(function (x) { var p = t(x['Ubicación técnica']).split('-'); if (p.length > 1 && p[1]) ac[p[1]] = 1; });
    var ak = Object.keys(ac).sort(), tag = ak.length && ak.length <= 3 ? ak.join('-') : 'AREA';
    return { sheets: S, sem: sem, fileName: 'Torre de control ' + sem.replace('/', 'S') + ' ' + tag + '.xlsx',""", 'tx name')
assert 'UT_fra' not in tx
tx = tx.replace('(mismo formato que la S42/S45)', '(mismo formato que la Torre de control)')
tx = tx.replace("if (typeof module !== 'undefined') module.exports = TorreTx;", "")

h = R(h, "(por ejemplo Torre de control 2026S45 FRA.xlsx)", "(por ejemplo Torre de control 2026S45 AREA.xlsx)", 'h3')
j = R(j, "+' FRA.xlsx');", "+' AREA.xlsx');", 'j fra')

# ---------- 3) Filtro por área
AREA_JS = r"""
/* ===== Filtro por área: segundo tramo de la ubicación técnica (CHCO-FL = Flotación) ===== */
var AREA_NOM={FL:'Flotación',MO:'Molibdeno',FI:'Filtros',CH:'Chancado 2°-3° (CH23)',CP:'Chancado primario (CH1)',A0:'Concentradora A0',A1:'Concentradora A1',A2:'Concentradora A2',A3:'Planta de escoria A3',IN:'Instalaciones concentradora'};
function areaOf(ut){var p=String(ut||'').split('-');return p.length>1?p[1].trim():''}
function areaLabel(c){return c?c+' · '+(AREA_NOM[c]||c):'Sin ubicación'}
function loadAreas(){try{var a=JSON.parse(localStorage.getItem('areasN4')||'[]');return Array.isArray(a)?a:[]}catch(e){return[]}}
function saveAreas(){try{localStorage.setItem('areasN4',JSON.stringify(Array.from(F.area)))}catch(e){}}
function areaOk(ut){return!F.area.size||F.area.has(areaOf(ut))}
function torreView(){
  if(!torre)return null;if(!F.area.size)return torre;
  var k=Array.from(F.area).sort().join(',');if(torre._v&&torre._vk===k)return torre._v;
  var P=Torre.P,v={};Object.keys(torre).forEach(function(x){if(x.charAt(0)!=='_')v[x]=torre[x]});
  v.pos=(torre.pos||[]).filter(function(p){return areaOk(p[P.ut])});
  if(torre.ut)v.ut={rows:(torre.ut.rows||[]).filter(function(u){return areaOk(u[0])}),porNivel:torre.ut.porNivel};
  torre._v=v;torre._vk=k;return v;
}
function renderTArea(){
  var b=$('tAreaBox');if(!torre){b.hidden=true;return}b.hidden=false;
  var P=Torre.P,c={};(torre.pos||[]).forEach(function(p){if(p[P.st]==='ABIE'){var a=areaOf(p[P.ut]);c[a]=(c[a]||0)+1}});
  F.area.forEach(function(a){if(!(a in c))c[a]=0});
  $('t-area').innerHTML=Object.keys(c).sort().map(function(a){return'<button type="button" class="chip" aria-pressed="'+F.area.has(a)+'" data-k="area" data-v="'+esc(a)+'">'+esc(areaLabel(a))+'<span class="n">'+fmt(c[a],0)+'</span></button>'}).join('');
}
"""
j = R(j, "var F={mat:new Set(),stat:new Set(),pto:new Set(),terms:[]};", "var F={mat:new Set(),stat:new Set(),pto:new Set(),area:new Set(),terms:[]};", 'F')
j = R(j, "function toast(t){", AREA_JS + "F.area=new Set(loadAreas());\nfunction toast(t){", 'areajs')
j = R(j, "  if(skip!=='pto'&&F.pto.size&&!F.pto.has(r.pto))return false;", "  if(skip!=='pto'&&F.pto.size&&!F.pto.has(r.pto))return false;\n  if(skip!=='area'&&F.area.size&&!F.area.has(areaOf(r.ubic)))return false;", 'pass')
j = R(j, "(key==='mat'?r.estMat:key==='stat'?r.stat:r.pto)===v", "(key==='mat'?r.estMat:key==='stat'?r.stat:key==='area'?areaOf(r.ubic):r.pto)===v", 'chips')
j = R(j, "  chips('f-pto','pto',uniq(function(r){return r.pto}).sort());", "  chips('f-pto','pto',uniq(function(r){return r.pto}).sort());\n  var ar=uniq(function(r){return areaOf(r.ubic)});F.area.forEach(function(a){if(ar.indexOf(a)<0)ar.push(a)});chips('f-area','area',ar.sort(),areaLabel);", 'chips area')
j = R(j, """  F.pto.forEach(function(v){p.push('<span class="pill p-none mono">'+esc(v)+'</span>')});""", """  F.pto.forEach(function(v){p.push('<span class="pill p-none mono">'+esc(v)+'</span>')});
  F.area.forEach(function(v){p.push('<span class="pill p-info">Área '+esc(areaLabel(v))+'</span>')});""", 'ctx')
j = R(j, "$('clear').addEventListener('click',function(){F.mat.clear();F.stat.clear();F.pto.clear();", "$('clear').addEventListener('click',function(){F.mat.clear();F.stat.clear();F.pto.clear();if(F.area.size){F.area.clear();saveAreas();crossCache={};renderTorre()}", 'clear')
j = R(j, "var k=t.dataset.k,v=t.dataset.v;F[k].has(v)?F[k].delete(v):F[k].add(v);renderAll();return}", "var k=t.dataset.k,v=t.dataset.v;F[k].has(v)?F[k].delete(v):F[k].add(v);if(k==='area'){saveAreas();crossCache={};renderTorre()}renderAll();return}", 'click')
j = R(j, "var A=torre._A||(torre._A=Torre.analyze(torre)),K=A.kpi,h='';", "var TV=torreView(),A=TV._A||(TV._A=Torre.analyze(TV)),K=A.kpi,h='';", 'analyze')
j = R(j, "  $('tActions').innerHTML=a;", "  $('tActions').innerHTML=a;renderTArea();", 'tarea')
j = R(j, "function tResults(){if(!torre)return[];return Torre.searchRows(torre)", "function tResults(){if(!torre)return[];return Torre.searchRows(torreView())", 'sr1')
j = R(j, "  var all=Torre.searchRows(torre);", "  var all=Torre.searchRows(torreView());", 'sr2')
j = R(j, "x:Torre.crossWeek(torre,st.recs)", "x:Torre.crossWeek(torreView(),st.recs.filter(function(r){return areaOk(r.ubic)}))", 'cross')
h = R(h, '    <div class="frow"><span class="flabel">Estatus material</span>', '    <div class="frow"><span class="flabel">Área</span><div class="chips" id="f-area"></div></div>\n    <div class="frow"><span class="flabel">Estatus material</span>', 'h area')
h = R(h, '    <section class="kpis" id="tKpis"', """    <section class="panel filters" id="tAreaBox" aria-label="Área" hidden>
      <div class="frow"><span class="flabel">Área</span><div class="chips" id="t-area"></div></div>
      <div class="hint muted">Filtra los indicadores, el análisis y el buscador por área, según el segundo tramo de la ubicación técnica (CHCO-<b>FL</b> = Flotación). Puedes marcar varias. El número es la cantidad de posiciones activas. El mismo filtro se aplica a la proyección.</div>
    </section>
    <section class="kpis" id="tKpis\"""", 'h tarea')

# ---------- 4) La semana la define la IP19 (proyección abierta), no el nombre del archivo de la Torre
j = R(j, "function applyTorre(t,file){\n  if(!t.sem)t.sem=isoWeekNow();",
      "function projSem(){return curId&&loaded[curId]?curId.replace('-','/'):''}\nfunction applyTorre(t,file){\n  if(!t.sem)t.sem=projSem()||isoWeekNow();", 'projsem')
j = R(j, "      var r=TorreTx.build(txPend,Object.keys(txNames).map(function(k){return txNames[k]}));",
      "      var r=TorreTx.build(txPend,Object.keys(txNames).map(function(k){return txNames[k]}));\n      var ps=projSem();if(ps){r.sem=ps;r.fileName=r.fileName.replace(/\\d{4}S\\d{1,2}/,ps.replace('/','S'))}",
      'tx sem')
j = R(j, "'<div class=\"okmsg\"><b>Torre '+esc(r.sem)+' armada.</b> '",
      "'<div class=\"okmsg\"><b>Torre '+esc(r.sem)+' armada'+(ps?' para la semana de la IP19 abierta':' con la semana actual (aún no hay IP19 cargada)')+'.</b> '", 'tx msg')
h = R(h, "La semana se toma del nombre del archivo o, si no lo trae, de la semana actual.",
      "<b>La semana la marca la IP19</b>: la Torre queda asociada a la semana de la proyección que tengas abierta. Si todavía no subes la IP19, se usa la semana actual.", 'h sem')
h = R(h, "La página arma especialidad, ciclo y estatus, y te muestra operaciones y HH por día para anticipar si la semana es ejecutable.",
      "La semana a analizar se toma de la IP19 (columna Sem. calendario). La página arma especialidad, ciclo y estatus, y te muestra operaciones y HH por día para anticipar si la semana es ejecutable.", 'h ip19')
