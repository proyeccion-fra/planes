import os
os.chdir('/home/claude/proy')
h=open('app.html').read();j=open('app.js').read()
core=open('core.js').read().replace("if (typeof module !== 'undefined') module.exports = Core;","")
tor=open('torre.js').read().replace("if (typeof module !== 'undefined') module.exports = Torre;","")
tx=open('torretx_built.js').read().replace("if (typeof module !== 'undefined') module.exports = TorreTx;","")
open('proyeccion-semana.html','w').write(h.replace('/*CORE*/',core+'\n'+tor+'\n'+tx).replace('/*APP*/',j))
