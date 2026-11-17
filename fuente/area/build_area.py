import re
P='/home/claude/proy/';O='/home/claude/offline/'
def R(t,a,b,name):
    assert a in t, name+': '+a[:70]; return t.replace(a,b)
# ---------- Torre genérica (sin tabla de puestos de FRA; la lee de la hoja Datos)
t=open(P+'torre.js').read()
t=re.sub(r'  /\* Puestos de trabajo de Flotación[^\n]*\n  var PUESTOS = \{.*?\};\n','  /* Puestos de trabajo: se leen de la hoja Datos de la Torre cargada (Pto Tbjo, Estado, Respons., Tp., Descripción, Empresa-Ejecutor, Proceso) */\n  var PUESTOS = {};\n',t,count=1,flags=re.S)
assert 'var PUESTOS = {};' in t and 'INGENALSE' not in t
if 'pto. trabajo' not in t: t=R(t,"""    if (c.est < 0) c.est = H.row.findIndex(function (x) { return x.indexOf('estado') === 0 && x.indexOf('hoja') >= 0; });
    var ops = [], hojas = {};""","""    if (c.est < 0) c.est = H.row.findIndex(function (x) { return x.indexOf('estado') === 0 && x.indexOf('hoja') >= 0; });
    /* El puesto ejecutor puede venir en "Estrategia" o en "Pto. Trabajo Eje." según el export: se elige la columna con códigos de puesto (8 caracteres) */
    var pe = H.row.findIndex(function (x) { return x.indexOf('pto. trabajo') === 0; });
    if (pe >= 0 && pe !== c.pt) { var sE = 0, sP = 0, seen = 0;
      for (var q = H.r + 1; q < aoa.length && seen < 400; q++) { var b = aoa[q] || []; if (s(b[c.gr]) || !s(b[c.op])) continue; seen++;
        if (/^[A-Z0-9]{8}$/.test(s(b[c.pt]))) sE++; if (/^[A-Z0-9]{8}$/.test(s(b[pe]))) sP++; }
      if (sP > sE) c.pt = pe; }
    var ops = [], hojas = {};""",'ia10 col')
t=R(t,"""  function sheetRole(name, aoa) {
    var nm = h(name);""","""  function parseDatos(aoa) {
    for (var r = 0; r < Math.min(aoa.length, 10); r++) {
      var row = (aoa[r] || []).map(h), pc = row.indexOf('pto tbjo');
      if (pc < 0 || row.indexOf('descripción', pc) < 0) continue;
      var f = function (nm) { return row.indexOf(nm, pc); }, ix = { e: f('estado'), r: f('respons.'), t: f('tp.'), d: f('descripción'), m: f('empresa-ejecutor'), p: f('proceso') }, out = {}, nOk = 0;
      for (var i = r + 1; i < aoa.length; i++) { var a = aoa[i] || [], k = s(a[pc]); if (!k) continue;
        out[k] = [ix.e >= 0 ? s(a[ix.e]) : '', ix.r >= 0 ? s(a[ix.r]) : '', ix.t >= 0 ? s(a[ix.t]) : '', ix.d >= 0 ? s(a[ix.d]) : '', ix.m >= 0 ? s(a[ix.m]) : '', ix.p >= 0 ? s(a[ix.p]) : '']; nOk++; }
      return nOk ? out : null;
    }
    return null;
  }

  function sheetRole(name, aoa) {
    var nm = h(name);
    if (/^datos$/.test(nm)) return 'datos';""",'datos')
t=R(t,"""      else if (role === 'ots' && !t.ots) t.ots = parseOTs(sh.aoa);""","""      else if (role === 'ots' && !t.ots) t.ots = parseOTs(sh.aoa);
      else if (role === 'datos' && !t.puestos) t.puestos = parseDatos(sh.aoa);""",'build')
t=R(t,"var WANT = /ih06|ip18|ip16|^ia10|^ots?$/i;","var WANT = /ih06|ip18|ip16|^ia10|^ots?$|^datos$/i;",'want')
t=R(t,"""  function index(t) {
""","""  function index(t) {
    PUESTOS = t.puestos || {};
""",'index')
t=t.replace("if (typeof module !== 'undefined') module.exports = Torre;","")
open('torre_area.js','w').write(t)
# ---------- App
h=open(P+'app.html').read();j=open(P+'app.js').read()
core=open(P+'core.js').read().replace("if (typeof module !== 'undefined') module.exports = Core;","")
j=R(j,"var js=JSON.stringify({sem:t.sem,file:t.file,ut:t.ut,pos:t.pos,planes:t.planes,ops:t.ops,hojas:t.hojas,ots:t.ots})","var js=JSON.stringify({sem:t.sem,file:t.file,ut:t.ut,pos:t.pos,planes:t.planes,ops:t.ops,hojas:t.hojas,ots:t.ots,puestos:t.puestos||null})",'save')
j=j.replace("'torreBusqueda'","'torreBusquedaArea'")
j=R(j,"Arrastra el Excel de la Torre de control de Flotación en el panel de abajo.","Arrastra el Excel de la Torre de control del área en el panel de abajo.",'t1')
j=R(j,"la tabla de puestos de Flotación. Sirve","la tabla de puestos de la hoja Datos de la Torre. Sirve",'t2')
j=j.replace("'Ej.: CHCO-FL-RMO, BBA'","'Ej.: parte de la ubicación técnica'")
j=R(j,"'Ej.: CCOMXM28, CCOAXRMI'","'Ej.: código del puesto'",'t3')
j=re.sub(r"'Ej\.: ingenal[^']*'","'Ej.: nombre de la empresa o del puesto'",j)
h=R(h,"(por ejemplo CCOMXM28)","(su código en SAP)",'h1')
h=R(h,"(por ejemplo Ingenalse, SKF o Berliam), según la tabla de puestos de Flotación;","según la hoja Datos de la Torre cargada;",'h2')
h=h.replace('ubicación CHCO-FL-RMO)','una ubicación técnica)')
h=re.sub(r'Se leen las hojas IH06, IP18, IP16, IA10 y OTs','Se leen las hojas IH06, IP18, IP16, IA10, OTs y Datos (tabla de puestos de trabajo)',h)
exec(open('/home/claude/area/area_extra.py').read())
out=h.replace('/*CORE*/',core+'\n'+t+'\n'+tx).replace('/*APP*/',j)
for a,b in [('Cada semana cargada se guarda en el almacenamiento privado de esta página para que puedas volver a revisarla; solo la ven quienes tengan acceso al link.','Versión local en blanco: funciona sin internet. Lo que cargues se guarda solo en este navegador, sin salir de tu computador.'),
 ("'El almacenamiento no está disponible en esta vista: las semanas que cargues no se guardarán.'","'Este navegador no permite guardar datos: las semanas que cargues no quedarán guardadas.'"),
 ('<title>Proyección Semana N-4</title>','<title>Proyección N-4 (área)</title>'),
 ('class="eyebrow">Mantenimiento · Priorización SOMA N-4','class="eyebrow">Mantenimiento · Priorización SOMA N-4 · Versión local')]:
    out=R(out,a,b,'rep')
shim=open(O+'shim_offline.js').read()
shim=R(shim,"var DBN='proyecciones-fra-local'","var DBN='proyeccion-n4-area'",'db')
shim=shim.replace("app:'proyecciones-fra'","app:'proyeccion-n4-area'").replace("j.app!=='proyecciones-fra'","j.app!=='proyeccion-n4-area'").replace("'El archivo no es un respaldo de Proyecciones FRA.'","'El archivo no es un respaldo de esta versión (Proyección N-4 área).'").replace("'Respaldo Proyecciones FRA '","'Respaldo Proyeccion N-4 area '")
assert 'proyecciones-fra' not in shim
# Funciona igual como archivo local y publicado como artefacto: datos en este navegador (IndexedDB) y descargas por el visor de Claude cuando existe
shim=R(shim,"  function saveFile(name,data){","  var realDl=null;function getReal(){if(!realDl)realDl=(window.claude&&window.claude.use)?Promise.race([window.claude.use('downloads'),new Promise(function(r){setTimeout(function(){r(null)},4000)})]).catch(function(){return null}):Promise.resolve(null);return realDl}\n  function anchorSave(name,data){",'sf1')
shim=R(shim,"  var downloads={save:function(o){try{saveFile(o.filename,o.data);return Promise.resolve({status:'saved'})}catch(e){return Promise.reject({code:'unavailable',message:String(e)})}}};",
"  function saveFile(name,data){var b=data instanceof Blob?data:new Blob([data]);return getReal().then(function(d){if(d)return d.save({filename:name,data:b});anchorSave(name,b);return{status:'saved'}})}\n  var downloads={save:function(o){return saveFile(o.filename,o.data)}};getReal();",'sf2')
shim=R(shim,"  window.claude={use:","  window.__LOCAL__={use:",'local')
j=j.replace("if(window.claude&&window.claude.use){","if(window.__LOCAL__){").replace("window.claude.use('downloads')","window.__LOCAL__.use('downloads')").replace("window.claude.use('db')","window.__LOCAL__.use('db')")
assert "window.claude" not in j
lib=open(P+'node_modules/xlsx/dist/xlsx.full.min.js').read()
cdn='<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>'
out=out.replace("if(window.claude&&window.claude.use){","if(window.__LOCAL__){").replace("window.claude.use('downloads')","window.__LOCAL__.use('downloads')").replace("window.claude.use('db')","window.__LOCAL__.use('db')")
out=R(out,cdn,'<script>window.__BASE__={};</script>\n<script>\n'+shim+'\n</script>\n<script>\n'+lib+'\n</script>','cdn')
out=out.rstrip()+'\n<script>\n'+open(O+'respaldo_ui.js').read()+'\n</script>\n'
page='<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.45 system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n'+out+'\n</body>\n</html>\n'
open('Proyeccion_N4_Area_local.html','w').write(page)
import collections
leak=[w for w in ['2026/42','2026-42','S42','proyecciones-fra','2026/48','2026/45','UT_fra',' FRA.xlsx','Torre_de_control_2026S42'] if w in page]
print('ok',round(len(page.encode())/1e6,2),'MB','| restos FRA:',leak)
