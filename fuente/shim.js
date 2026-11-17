/* ===== Versión GitHub Pages: historial del repositorio + almacenamiento en este navegador (IndexedDB) + descargas directas ===== */
(function(){
  var DBN='proyecciones-fra',ST='docs',dbp=null,listeners={},base={},baseP=null,HI=String.fromCharCode(0xFFFF);
  /* data/base.json trae las semanas y la Torre del repositorio. Lo cargado en el navegador se suma o las reemplaza. */
  function loadBase(){if(baseP)return baseP;baseP=fetch('data/base.json',{cache:'no-cache'}).then(function(r){return r.ok?r.json():{}}).then(function(j){base=j||{};return base},function(){base={};return base});return baseP}
  function open(){if(dbp)return dbp;dbp=new Promise(function(res,rej){var r=indexedDB.open(DBN,1);r.onupgradeneeded=function(){r.result.createObjectStore(ST)};r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error)}});return dbp}
  function tx(mode,fn){return open().then(function(d){return new Promise(function(res,rej){var t=d.transaction(ST,mode),s=t.objectStore(ST),out=fn(s);t.oncomplete=function(){res(out&&out.result!==undefined?out.result:undefined)};t.onerror=function(){rej(t.error)};t.onabort=function(){rej(t.error||{name:'QuotaExceededError'})}})})}
  function parentOf(p){return p.split('/').slice(0,-1).join('/')}
  function snap(col){return loadBase().then(function(){return open()}).then(function(d){return new Promise(function(res,rej){
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
      delete:function(){return loadBase().then(function(){return tx('readwrite',function(s){return base[p]?s.put({__borrado:1},p):s.delete(p)})}).then(function(){notify(parentOf(p))})},
      get:function(){return loadBase().then(function(){return tx('readonly',function(s){return s.get(p)})}).then(function(v){if(v===undefined)v=base[p];if(v&&v.__borrado)v=undefined;return{exists:v!==undefined,data:function(){return v}}})}}}
  };
  var downloads={save:function(o){try{var b=o.data instanceof Blob?o.data:new Blob([o.data]),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=o.filename;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(u);a.remove()},1500);return Promise.resolve({status:'saved'})}catch(e){return Promise.reject({code:'unavailable',message:String(e)})}}};
  var ok=typeof indexedDB!=='undefined';
  window.claude={use:function(n){return Promise.resolve(n==='db'?(ok?db:null):n==='downloads'?downloads:null)}};
})();
