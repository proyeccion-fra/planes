/* Panel de respaldo (solo versión local) */
(function(){
  var foot=document.querySelector('footer');if(!foot||!window.__respaldo)return;
  var sec=document.createElement('section');sec.className='panel tsec';sec.setAttribute('aria-label','Respaldo del historial');
  sec.innerHTML='<h2>Respaldo del historial</h2><p>Esta es la versión local: funciona sin internet y guarda lo que cargas en este navegador. Para llevar tus semanas y Torres a otro computador, descarga un respaldo y cárgalo allá en esta misma página.</p>'+
    '<div class="frow" style="gap:10px"><button class="btn primary" type="button" id="rExp">Descargar respaldo</button><button class="btn" type="button" id="rImp">Cargar respaldo</button><input type="file" id="rFile" accept=".json" hidden><span class="muted" id="rMsg" style="font-size:13px"></span></div>';
  foot.parentNode.insertBefore(sec,foot);
  var msg=document.getElementById('rMsg');
  document.getElementById('rExp').addEventListener('click',function(){window.__respaldo.exportar().then(function(r){msg.textContent='Respaldo descargado: '+r.semanas+' semana(s) y '+r.torres+' Torre(s).'},function(e){msg.textContent='No se pudo crear el respaldo: '+e})});
  document.getElementById('rImp').addEventListener('click',function(){document.getElementById('rFile').click()});
  document.getElementById('rFile').addEventListener('change',function(){var f=this.files&&this.files[0];this.value='';if(!f)return;var rd=new FileReader();
    rd.onload=function(){try{window.__respaldo.importar(rd.result).then(function(r){msg.textContent='Respaldo cargado: '+r.semanas+' semana(s) y '+r.torres+' Torre(s). Actualizando…';setTimeout(function(){location.reload()},900)},function(e){msg.textContent='No se pudo cargar: '+e})}catch(e){msg.textContent=e.message}};rd.readAsText(f)});
})();
