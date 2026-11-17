import json,os,glob
os.chdir('/home/claude/proy')
h=open('app.html').read();j=open('app.js').read()
core=open('core.js').read().replace("if (typeof module !== 'undefined') module.exports = Core;","")
tor=open('torre.js').read().replace("if (typeof module !== 'undefined') module.exports = Torre;","")
tx=open('torretx_built.js').read().replace("if (typeof module !== 'undefined') module.exports = TorreTx;","")
out=h.replace('/*CORE*/',core+'\n'+tor+'\n'+tx).replace('/*APP*/',j)
reps=[('Cada semana cargada se guarda en el almacenamiento privado de esta página para que puedas volver a revisarla; solo la ven quienes tengan acceso al link.','El historial del repositorio se carga solo al abrir. Lo que cargues aquí se procesa y se guarda en este navegador, sin subirse a ningún servidor; para sumarlo al historial compartido, envíalo a la conversación de mantención.'),
 ("'El almacenamiento no está disponible en esta vista: las semanas que cargues no se guardarán.'","'Este navegador no permite guardar datos: las semanas que cargues no quedarán guardadas.'"),
 ('<title>Proyección Semana N-4</title>','<title>Proyecciones FRA</title>\n<meta name="robots" content="noindex,nofollow">')]
for a,b in reps:
    assert a in out, a[:50]; out=out.replace(a,b)
shim=open('shim.js').read()
i=out.index('<script src="https://cdnjs')
out=out[:i]+'<script>\n'+shim+'\n</script>\n'+out[i:]
page='<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.45 system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n'+out+'\n</body>\n</html>\n'
os.makedirs('gh/data',exist_ok=True);open('gh/index.html','w').write(page)
# historial: semanas + torre
base={}
for m in sorted(glob.glob('seed-2026-*-meta.json')):
    wid=m.split('seed-')[1].replace('-meta.json','')
    base['weeks/'+wid]=json.load(open(m))
    for c in sorted(glob.glob('seed-%s-c*.json'%wid)):
        base['weeks/%s/rows/%s'%(wid,c.rsplit('-',1)[1].replace('.json',''))]=json.load(open(c))
for p in sorted(glob.glob('tseed/p*.json')):
    base['torres/2026-42/parts/'+os.path.basename(p)[:-5]]=json.load(open(p))
base['torres/2026-42']=json.load(open('tseed/meta.json'))
json.dump(base,open('gh/data/base.json','w'),ensure_ascii=False,separators=(',',':'))
open('gh/README.md','w').write("""# Proyecciones FRA

Proyección de planes de mantenimiento a N-4 semanas (estándar SOMA) para Flotación FRA, Concentradora Chuquicamata.

- **Proyección N-4**: arrastra la IP19, IA10 e IW38 de SAP. Arma especialidad, ciclo y estatus, y muestra la carta Gantt de operaciones y HH. Las HH de planes sin orden se estiman con la hoja de ruta de la Torre de control (en rojo).
- **Torre de control**: buscador de planes (Txt plan, ubicación técnica, denominación, puesto, empresa) y análisis del plan matriz.

`data/base.json` guarda el historial de semanas y la Torre vigente; la página lo carga sola al abrir. Lo que se carga en el navegador queda solo en ese navegador.
""")
print(sorted(k for k in base if k.count('/')==1), os.path.getsize('gh/data/base.json'), os.path.getsize('gh/index.html'))
