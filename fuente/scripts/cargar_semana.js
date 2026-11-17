const X=require('xlsx'),C=require('./core.js'),T=require('./torre.js'),fs=require('fs');
const D='/mnt/user-data/uploads/Proyeccion/Proyeccion S51/';
const sh=f=>{const wb=X.readFile(D+f,{cellDates:true});return X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:''})};
const ip=C.parseIP19(sh('IP19 Semana 51.xlsx')),ia=C.parseIA10(sh('IA10.xlsx')),iw=C.parseIW38(sh('IW38.xlsx'));
const sems=[...new Set(ip.rows.map(r=>C.s(r[ip.idx.sem])))];console.log('semanas',sems,'filas',ip.rows.length,'ia10',ia.length,'iw38',Object.keys(iw).length);
const status={};ip.rows.forEach(r=>{const o=C.s(r[ip.idx.orden]).replace(/^0+(?=\d)/,'');if(o&&o in iw)status[o]=iw[o]});
const st=C.build(ip,ia,status);const torre=JSON.parse(fs.readFileSync('/home/claude/t46/t46.json'));
let est=0,miss=0,ap=0;st.recs.forEach(r=>{if(!r.orden){const e=T.estimate(torre,r.llave,r.ciclo);if(e){est+=e.hh;if(e.aprox)ap++}else miss++}});
const cnt=g=>st.recs.reduce((m,x)=>(m[g(x)]=(m[g(x)]||0)+1,m),{});
const planes=new Set(st.recs.map(x=>x.plan+'|'+x.toma)).size,hh=Math.round(st.recs.reduce((a,x)=>a+x.hh,0)*10)/10;
const ords=new Set(st.recs.filter(x=>x.orden).map(x=>x.orden));
console.log({planes,ops:st.recs.length,hh,est:Math.round(est),miss,ap,ordenes:ords.size,noIW:[...ords].filter(o=>!(o in iw)).length});
console.log(cnt(x=>x.estMat),cnt(x=>x.esp),cnt(x=>x.fecha),'sin ciclo',st.recs.filter(x=>x.ciclo==='Sin ciclo en IA10').length,'multi',new Set(st.recs.filter(x=>x.ciclosAlt).map(x=>x.llave)).size);
const fm=st.recs.filter(x=>x.estMat==='Falta Disponibilidad Material');console.log('FMAT',[...new Set(fm.map(x=>x.orden+' '+x.txt))]);
const sem=sems[0],id=sem.replace('/','-');
const chunks=[];let cur=[],size=0;ip.rows.forEach(row=>{const l=JSON.stringify(row).length;if(size+l>180000&&cur.length){chunks.push(cur);cur=[];size=0}cur.push(row);size+=l});chunks.push(cur);
const meta={sem,savedAt:new Date().toISOString(),files:{ip19:'IP19 Semana 51.xlsx',ia10:'IA10.xlsx',iw38:'IW38.xlsx'},headers:ip.headers,status,ia10:ia,nChunks:chunks.length,planes,ops:st.recs.length,hh};
if(JSON.stringify(meta).length>250000){const used={};st.recs.forEach(r=>used[r.llave]=1);meta.ia10=ia.filter(x=>used[x.gr+'-'+x.cgh])}
fs.writeFileSync(`seed-${id}-meta.json`,JSON.stringify(meta));chunks.forEach((c,i)=>fs.writeFileSync(`seed-${id}-c${i}.json`,JSON.stringify({i,rows:c})));
// por especialidad vs teórica
const A=T.analyze(torre),teo={};A.pto.forEach(r=>teo[r.esp]=(teo[r.esp]||0)+r.hhSem);
st.recs.forEach(r=>{if(!r.orden){const e=T.estimate(torre,r.llave,r.ciclo);r.hhEst=e?e.hh:null}});
const x=T.crossWeek(torre,st.recs);console.log(Object.entries(x.porEsp).map(([k,v])=>k+':'+Math.round(v.real+v.est)+' ('+Math.round(((v.real+v.est)/teo[k]-1)*100)+'%)').join(' | '),JSON.stringify(x.abc));
const byDay={};st.recs.forEach(r=>{const v=r.orden?r.hh:(r.hhEst||0);byDay[r.fecha]=(byDay[r.fecha]||0)+v});console.log(byDay);
