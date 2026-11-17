const X=require('/home/claude/proy/node_modules/xlsx'),fs=require('fs');
const TX=require('/home/claude/proy/torretx_built.js'),T=require('/home/claude/proy/torre.js');
const D='/mnt/user-data/uploads/Proyeccion/Torre de Control S46/';
const inp={},nm={};
for(const f of ['IH06.xlsx','IP16.xlsx','IP18.xlsx','IA10.xlsx','IW38.xlsx','MAF.xlsx']){const wb=X.readFile(D+f,{cellDates:true});
 for(const sn of wb.SheetNames){const a=X.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:''});const r=TX.detect(a);console.log(f,sn,a.length,'filas ->',r);if(r&&!inp[r]){inp[r]=a;nm[r]=f;break}}}
const r=TX.build(inp,['Torre 2026S46']);console.log('sem',r.sem,r.fileName,r.stats);
const wb=X.utils.book_new();TX.ORDER.forEach(n=>X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(r.sheets[n],{cellDates:true}),n));
X.writeFile(wb,'Torre de control 2026S46 FRA.xlsx',{compression:true});
const t=T.build(TX.ORDER.map(n=>({name:n,aoa:r.sheets[n]})),r.fileName);const A=T.analyze(t);
const t45=require('/home/claude/torreprueba/t45full.json');const A45=T.analyze(t45);
const k=o=>({planes:o.kpi.planesAbiertos,pos:o.kpi.posActivas,hhSem:Math.round(o.kpi.hhSem)});console.log('S46',k(A),'S45',k(A45));
const pe=a=>{const m={};a.pto.forEach(x=>m[x.esp]=(m[x.esp]||0)+x.hhSem);Object.keys(m).forEach(x=>m[x]=Math.round(m[x]));return m};console.log('HH/sem por esp S46',pe(A),'S45',pe(A45));
console.log('kpi keys',Object.keys(A.kpi));console.log(JSON.stringify(A.kpi).slice(0,800));console.log(JSON.stringify(A45.kpi).slice(0,800));
fs.writeFileSync('t46.json',JSON.stringify({sem:t.sem,file:t.file,ut:t.ut,pos:t.pos,planes:t.planes,ops:t.ops,hojas:t.hojas,ots:t.ots}));
// cambios de planes y posiciones
const P=T.P,act=x=>new Set(x.pos.filter(p=>p[P.st]==='ABIE').map(p=>String(p[P.plan])));const a46=act(t),a45=act(t45);
console.log('posiciones activas nuevas',[...a46].filter(x=>!a45.has(x)).length,'que salieron',[...a45].filter(x=>!a46.has(x)).length);
