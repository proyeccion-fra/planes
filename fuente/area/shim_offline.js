/* ===== Versión local (sin internet): historial incluido en el archivo + almacenamiento en este navegador (IndexedDB) + descargas directas ===== */
(function(){
  var DBN='proyecciones-fra-local',ST='docs',dbp=null,listeners={},base=window.__BASE__||{},HI=String.fromCharCode(0xFFFF);
  function open(){if(dbp)return dbp;dbp=new Promise(function(res,rej){var r=indexedDB.open(DBN,1);r.onupgradeneeded=function(){r.result.createObjectStore(ST)};r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error)}});return dbp}
  function tx(mode,fn){return open().then(function(d){return new Promise(function(res,rej){var t=d.transaction(ST,mode),s=t.objectStore(ST),out=fn(s);t.oncomplete=function(){res(out&&out.result!==undefined?out.result:undefined)};t.onerror=function(){rej(t.error)};t.onabort=function(){rej(t.error||{name:'QuotaExceededError'})}})})}
  function parentOf(p){return p.split('/').slice(0,-1).join('/')}
  function allLocal(){return open().then(function(d){return new Promise(function(res,rej){var t=d.transaction(ST,'readonly'),s=t.objectStore(ST),m={},rq=s.openCursor();rq.onsuccess=function(){var c=rq.result;if(c){m[String(c.key)]=c.value;c.continue()}else res(m)};rq.onerror=function(){rej(rq.error)}})})}
  function snap(col){return open().then(function(d){return new Promise(function(res,rej){
    var t=d.transaction(ST,'readonly'),s=t.objectStore(ST),m={},n=col.split('/').length+1;
    Object.keys(base).forEach(function(k){if(k.indexOf(col+'/')===0&&k.split('/').length===n)m[k]=base[k]});
    var rq=s.openCursor(IDBKeyRange.bound(col+'/',col+'/'+HI));
    rq.onsuccess=function(){var c=rq.result;if(c){var k=String(c.key);if(k.split('/').length===n)m[k]=c.value;c.continue()}else{
      var docs=Object.keys(m).sort().filter(function(k){return!(m[k]&&m[k].__borrado)}).map(function(k){var v=m[k];return{id:k.split('/').pop(),exists:true,data:function(){return v}}});
      res({docs:docs,size:docs.length,empty:!docs.length})}};
    rq.onerror=function(){rej(rq.error)}})})}
  function notify(col){(listeners[col]||[]).forEach(function(f){snap(col).then(f)})}
  var db={
    collection:function(col){return{get:function(){return snap(col)},onSnapshot:function(f,err){(listeners[col]=listeners[col]||[]).push(f);snap(col).then(f,function(e){err&&err({code:'unavailable',message:String(e)})});return function(){listeners[col]=(listeners[col]||[]).filter(function(x){return x!==f})}}}},
    doc:function(p){return{
      set:function(d){return tx('readwrite',function(s){return s.put(JSON.parse(JSON.stringify(d)),p)}).then(function(){notify(parentOf(p))},function(e){throw{code:(e&&e.name==='QuotaExceededError')?'quota_exceeded':'unavailable',message:String(e)}})},
      delete:function(){return tx('readwrite',function(s){return base[p]?s.put({__borrado:1},p):s.delete(p)}).then(function(){notify(parentOf(p))})},
      get:function(){return tx('readonly',function(s){return s.get(p)}).then(function(v){if(v===undefined)v=base[p];if(v&&v.__borrado)v=undefined;return{exists:v!==undefined,data:function(){return v}}})}}}
  };
  function saveFile(name,data){var b=data instanceof Blob?data:new Blob([data]),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(u);a.remove()},1500)}
  var downloads={save:function(o){try{saveFile(o.filename,o.data);return Promise.resolve({status:'saved'})}catch(e){return Promise.reject({code:'unavailable',message:String(e)})}}};
  var ok=typeof indexedDB!=='undefined';
  window.claude={use:function(n){return Promise.resolve(n==='db'?(ok?db:null):n==='downloads'?downloads:null)}};
  /* Respaldo: todo el historial (incluido + cargado aquí) en un .json para llevarlo a otro computador */
  window.__respaldo={
    exportar:function(){return allLocal().then(function(loc){var m={},k;for(k in base)m[k]=base[k];for(k in loc){if(loc[k]&&loc[k].__borrado)delete m[k];else m[k]=loc[k]}
      var d=new Date(),f=d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
      var nW=Object.keys(m).filter(function(x){return/^weeks\/[^/]+$/.test(x)}).length,nT=Object.keys(m).filter(function(x){return/^torres\/[^/]+$/.test(x)}).length;
      saveFile('Respaldo Proyecciones FRA '+f+'.json',JSON.stringify({app:'proyecciones-fra',version:1,fecha:d.toISOString(),docs:m}));return{semanas:nW,torres:nT}})},
    importar:function(text){var j=JSON.parse(text);if(!j||j.app!=='proyecciones-fra'||!j.docs)throw new Error('El archivo no es un respaldo de Proyecciones FRA.');
      var keys=Object.keys(j.docs);return tx('readwrite',function(s){keys.forEach(function(k){s.put(j.docs[k],k)})}).then(function(){return{semanas:keys.filter(function(x){return/^weeks\/[^/]+$/.test(x)}).length,torres:keys.filter(function(x){return/^torres\/[^/]+$/.test(x)}).length}})}
  };
})();
