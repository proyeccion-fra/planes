/* ===== Torre de control desde transacciones SAP (IH06, IP16, IP18, IA10, MAF, IW38) ===== */
var TorreTx = (function () {
  var DATOS = /*DATOS_FRA*/null;
  function s(v) { return v == null ? '' : (v instanceof Date ? v : String(v).trim()); }
  function t(v) { return v == null ? '' : String(v).trim(); }
  function z(v) { return t(v).replace(/^0+(?=\d)/, ''); }
  function num(v) { if (typeof v === 'number') return v; var x = t(v); if (x.indexOf(',') >= 0) x = x.replace(/\./g, '').replace(',', '.'); var n = parseFloat(x); return isFinite(n) ? n : 0; }
  function h(v) { return t(v).replace(/\s+/g, ' ').toLowerCase(); }
  function firstRow(aoa) { for (var i = 0; i < Math.min(aoa.length, 15); i++) if ((aoa[i] || []).some(function (v) { return t(v) !== ''; })) return i; return -1; }
  /* Reconoce la transacción por sus encabezados (o por la forma de la lista, en IA10 y MAF) */
  function detect(aoa) {
    var r = firstRow(aoa); if (r < 0) return null;
    var row = (aoa[r] || []).map(h), has = function (x) { return row.indexOf(x) >= 0; };
    if (has('ubicación técnica') && has('denom.ubic.técnica')) return 'ih06';
    if (has('posición mantenim.') && has('última orden')) return 'ip18';
    if (has('plan mant.preventivo') && has('ctd.pos.mant.')) return 'ip16';
    if (has('orden') && has('status de sistema') && (has('autor') || has('texto breve'))) return 'iw38';
    var w = Math.max.apply(null, aoa.slice(0, 60).map(function (x) { return (x || []).length; }));
    var b = aoa.slice(r, r + 40).some(function (x) { return t((x || [])[1]) && t((x || [])[4]) && t((x || [])[5]); });
    if (b && w >= 25 && aoa.slice(r, r + 60).some(function (x) { return t((x || [])[2]) && t((x || [])[5]); })) return 'ia10';
    if (b && w >= 11 && w <= 20) return 'maf';
    return null;
  }
  function table(aoa) {
    var r = firstRow(aoa), hd = (aoa[r] || []).map(t), out = [];
    for (var i = r + 1; i < aoa.length; i++) { var a = aoa[i] || []; if (!a.some(function (v) { return t(v) !== ''; })) continue; var o = {}; hd.forEach(function (k, j) { if (k) o[k] = a[j]; }); out.push(o); }
    return out;
  }
  var C = { B: 1, C: 2, D: 3, E: 4, F: 5, J: 9, K: 10, N: 13, S: 18, T: 19, AH: 33, AI: 34, AJ: 35, AK: 36, AL: 37, AM: 38, AN: 39 };
  function semFromNames(names) {
    for (var i = 0; i < names.length; i++) { var m = t(names[i]).match(/(20\d\d)\s*[-_ ]?\s*S\s*(\d{1,2})/i); if (m) return m[1] + '/' + (m[2].length < 2 ? '0' : '') + m[2]; }
    var d = new Date(), x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day + 3);
    var y = x.getUTCFullYear(), j4 = new Date(Date.UTC(y, 0, 4)), wk = 1 + Math.round(((x - j4) / 86400000 - 3 + ((j4.getUTCDay() + 6) % 7)) / 7);
    return y + '/' + (wk < 10 ? '0' : '') + wk;
  }

  /* La IA10 sale de SAP como lista de ancho fijo: las columnas cambian según el área o la variante de pantalla.
     Se calibra con las filas más frecuentes de cada tipo y se lleva todo al formato de referencia (el de Flotación). */
  var REF = { H: [1, 4, 5, 33, 36, 38], O: [2, 5, 10, 35, 37, 39], K: [3, 9, 13, 19, 34], M: [3, 18] };
  function normIA10(aoa) {
    if (!aoa || !aoa.length) return aoa;
    var cnt = { H: {}, O: {}, K: {}, M: {} };
    aoa.forEach(function (r) {
      var c = []; (r || []).forEach(function (v, i) { if (t(v) !== '') c.push(i); }); if (!c.length) return;
      var ty = c[0] === 1 ? 'H' : c[0] === 2 ? 'O' : c[0] === 3 ? (c.length === REF.K.length ? 'K' : c.length === 2 ? 'M' : '') : '';
      if (ty && c.length === REF[ty].length) { var k = c.join(','); cnt[ty][k] = (cnt[ty][k] || 0) + 1; }
    });
    var map = {}, same = true;
    Object.keys(REF).forEach(function (ty) {
      var best = null, n = 0; Object.keys(cnt[ty]).forEach(function (k) { if (cnt[ty][k] > n) { n = cnt[ty][k]; best = k; } });
      var cols = best ? best.split(',').map(Number) : REF[ty], m = {}; cols.forEach(function (c, i) { m[c] = REF[ty][i]; });
      if (cols.join() !== REF[ty].join()) same = false; map[ty] = { m: m, cols: cols };
    });
    if (same) return aoa;
    var kN = map.K.cols[2], kT = map.K.cols[3], mS = map.M.cols[1];
    return aoa.map(function (r) {
      r = r || []; var first = -1; for (var i = 0; i < r.length; i++) if (t(r[i]) !== '') { first = i; break; }
      var ty = first === 1 ? 'H' : first === 2 ? 'O' : first === 3 ? ((t(r[kN]) || t(r[kT])) ? 'K' : t(r[mS]) ? 'M' : '') : '';
      var out = new Array(40).fill('');
      if (!ty) { if (first >= 0) out[first] = r[first]; return out; }
      var m = map[ty].m; r.forEach(function (v, i) { if (i in m) out[m[i]] = v; });
      return out;
    });
  }

  /* inputs: {ih06, ip16, ip18, ia10, maf?, iw38?} como aoa. Devuelve las hojas de la Torre (mismo formato que la S42/S45) */
  function build(inp, names) {
    var dr = DATOS || [], cyc = {}, pto = {}, pri = {}, tob = {}, tut = {};
    dr.slice(2).forEach(function (r) {
      if (t(r[7])) cyc[t(r[7])] = [r[8], t(r[9])];
      if (t(r[11])) pto[t(r[11])] = [t(r[15]), t(r[12])];
      if (t(r[1])) pri[t(r[1])] = t(r[2]);
      if (t(r[4])) tob[t(r[4])] = t(r[5]);
      if (t(r[19])) tut[t(r[19])] = t(r[20]);
    });
    function cy(ct) { return cyc[ct] || ['--', '--']; }
    function pt(c, d) { return pto[c] || [d, d]; }
    // IA10
    var hojas = {}, order = [], ops = [], cur = null, last = null, mat = {};
    normIA10(inp.ia10 || []).forEach(function (r) {
      var g = function (c) { return C[c] < r.length ? t(r[C[c]]) : ''; };
      if (g('B') && g('E')) { var k = z(g('B')) + '-' + z(g('E')); cur = k; last = null; if (!hojas[k]) order.push(k); hojas[k] = { gr: z(g('B')), cg: z(g('E')), txt: g('F'), estr: g('AH'), resp: g('AK'), inst: g('AM') }; }
      else if (g('C') && g('F')) { last = { key: cur, op: g('F'), txt: g('K'), pt: g('AJ'), per: num(r[C.AL]), hrs: num(r[C.AN]), pk: [] }; ops.push(last); }
      else if (g('D') && g('N') && g('T')) { if (last) last.pk.push([g('N'), g('T'), g('AI')]); }
      else if (g('D') && g('S')) { (mat[cur] = mat[cur] || []).push(1); }
    });
    // MAF
    var maf = {}, mafH = {}; cur = null; var lop = null;
    (inp.maf || []).forEach(function (r) {
      var g = function (i) { return i < r.length ? t(r[i]) : ''; };
      if (g(1) && g(4)) { cur = z(g(1)) + '-' + z(g(4)); lop = null; }
      else if (g(2) && g(5)) lop = cur + '-' + g(5);
      else if (g(3) && lop && !r.some(function (v, i) { return i !== 3 && t(v) !== ''; })) { maf[lop] = 1; mafH[lop.split('-').slice(0, 2).join('-')] = 1; }
    });
    var ip16 = table(inp.ip16 || []), ip18 = table(inp.ip18 || []), ih = table(inp.ih06 || []), iw = inp.iw38 ? table(inp.iw38) : [];
    var P16 = {}; ip16.forEach(function (x) { P16[z(x['Plan mant.preventivo'])] = x; });
    var UT = {}; ih.forEach(function (x) { UT[t(x['Ubicación técnica'])] = x; });
    var OT = {}; iw.forEach(function (x) { OT[z(x['Orden'])] = x; });
    function stp(p) { return P16[p] ? t(P16[p]['Status de sistema']) : '--'; }
    function autor(o) { return OT[o] ? t(OT[o]['Autor']) : ''; }
    function auto(a) { return !a ? '' : a === 'S/I' ? 'S/I' : (/^\d{4}$/.test(a.slice(2, 6)) ? 'Auto' : 'Manual'); }
    function neo3(x) { return ['MRT', 'MGA', 'PPL'].indexOf(t(x).slice(0, 3)) >= 0 ? 1 : 0; }
    var hst = {}; ip18.forEach(function (x) { var k = z(x['Grupo hojas ruta']) + '-' + z(x['Cont.grupo HRuta']); (hst[k] = hst[k] || {})[stp(z(x['Plan mant.preventivo']))] = 1; });
    function eh(k) { var v = hst[k] || {}; return v['ABIE'] ? 'Abierta' : v['ABIE NOAC'] ? 'No Act.' : v['PTBO NOAC'] ? 'PTBO' : 'N/A'; }
    var byk = {}; ops.forEach(function (o) { (byk[o.key] = byk[o.key] || []).push(o); });
    var S = {}, firstCtx = {}, firstPt = {};
    var A = [['--', 'Gpo.hojas ruta', 'Cont.gpo.Hruta\nOpe.', 'Texto Breve\nDesc. Oper.', 'Estrategia', 'Estado Instalación', 'Paquete Mant.', 'Texto Ciclo', 'Pto. Trabajo Eje.', 'Cant. (Personas)', 'Horas', 'Cant.', 'Material\n(Cod. SAP)', 'Texto breve material', 'MAF', 'Material Hoja Ruta', 'Def. Puesto Trabajo', 'Estado\nPuesto Trabajo', 'Estado\nHoja Ruta', 'Neo Formato', 'Cant. Ciclo', 'Texto Ciclo', 'Un. Ciclo', 'Ciclo']];
    order.forEach(function (k) {
      var hj = hojas[k], cm = mat[k] ? 'Con Material' : '--', p0 = pt(hj.resp, '--');
      A.push([k, hj.gr, hj.cg, hj.txt, hj.estr, hj.inst, null, null, hj.resp, null, null, null, null, null, mafH[k] ? 'Con MAF' : '--', cm, p0[0], p0[1], eh(k), neo3(hj.txt), null, null, null, null]);
      (byk[k] || []).forEach(function (o) {
        (o.pk.length ? o.pk : [['', '', '']]).forEach(function (pk) {
          var c = cy(pk[1]), p1 = pt(o.pt, '--');
          if (!(k in firstCtx)) firstCtx[k] = pk[1]; if (!(k in firstPt)) firstPt[k] = o.pt;
          A.push([k, null, o.op, o.txt, pk[2], null, pk[0], pk[1], o.pt, o.per, o.hrs, null, null, null, maf[k + '-' + o.op] ? 'Con MAF' : '--', cm, p1[0], p1[1], eh(k), neo3(hj.txt), c[0], pk[1], c[1], c[0] !== '--' ? c[0] + ' ' + c[1] : '--']);
        });
      });
    });
    S['IA10'] = A;
    // IP18 (P_V)
    var B = [['Plan mant.prev.', 'Status sistema', 'Txt plan MT', 'Cl.actividad PM', 'Pos.mantenim.', 'TxtPosicManten', 'Ubicac.técnica', 'Denominación U.T.', 'Status sistema UT', 'Nivel', 'Indicador ABC', 'Pto.tbjo.resp.', 'Tiene Hoja Ruta', 'Tipo hoja ruta', 'Gpo.hojas ruta', 'Cont.gpo.HRuta', 'H&C', 'Texto Breve HdR', 'Texto Ciclo', 'Unid Ciclo', 'Ciclo', 'Estado Equipo', 'MAF', 'C/Material', 'Puesto Trab', 'Def. Puesto Trabajo', 'Estado', 'Estrategia', 'Tp.pl.manten.', 'Creado por', 'Creado el', 'Modificado por', 'Modificado el', 'Status', 'Tiene OT', 'Última orden', 'Autor', 'Automático', 'N° Tomas', 'Grupo planif.', 'Neo Formato']];
    var cnt = {}, pcyc = {};
    ip18.forEach(function (x) {
      var p = z(x['Plan mant.preventivo']), ut = t(x['Ubicación técnica']), u = UT[ut] || {}, k = z(x['Grupo hojas ruta']) + '-' + z(x['Cont.grupo HRuta']), hj = hojas[k];
      var ct = k in firstCtx ? firstCtx[k] : '--', c = cy(ct), p1 = firstPt[k] || '--', d1 = pt(p1, '-'), uo = z(x['Última orden']), au = autor(uo);
      B.push([p, stp(p), P16[p] ? t(P16[p]['Txt plan mantenim.']) : '--', t(x['Clase actividad PM']), z(x['Posición mantenim.']), t(x['Txt.pos.mantenim.']), ut, t(u['Denom.ubic.técnica']), t(u['Status de sistema']), ut ? ut.split('-').length : '', t(u['Indicador ABC']), t(x['Pto.tbjo.responsable']), t(x['Grupo hojas ruta']) ? 'Si' : 'No', t(x['Tipo de hoja de ruta']), z(x['Grupo hojas ruta']), z(x['Cont.grupo HRuta']), k, hj ? hj.txt : '--', ct, (c[0] === '' || c[0] == null) ? '--' : c[0], c[1] || '--', hj ? (hj.inst === '0' ? 'Detenido' : 'Funcionado') : '--', mafH[k] ? 'Con MAF' : '--', mat[k] ? 'Con Material' : '--', p1, d1[0], d1[1], t(x['Estrategia mantenim.']), t(x['Tp.plan manten.']), t(x['Creado por']), s(x['Creado el']), t(x['Modificado por']), s(x['Modificado el']), t(x['Estado']), t(x['Última orden']) ? 'Si' : 'No', t(x['Última orden']), au, auto(au), P16[p] ? P16[p]['Ctd.pos.mant.'] : '-', t(x['Grupo planificación']), ['MRT ', 'MGA ', 'PPL '].indexOf(t(x['Txt.pos.mantenim.']).slice(0, 4)) >= 0 ? 1 : 0]);
      var sp = stp(p), cc = cnt[ut] = cnt[ut] || [0, 0, 0];
      if (sp === 'ABIE') cc[0]++; else if (sp === 'ABIE NOAC') cc[1]++; else if (sp === 'PTBO NOAC') cc[2]++;
      var v = parseFloat(c[0]); if (isFinite(v) && (!(p in pcyc) || v < pcyc[p][0])) pcyc[p] = [v, c[1]];
    });
    S['IP18 (P_V)'] = B;
    // IP16
    var Cc = [['Plan mant.prev.', 'Txt plan MT', 'Ciclo', 'Status sistema', 'Modificado el', 'Modificado por', 'Creado el', 'Creado por', 'Estrategia', 'Intervalo toma', 'Ctd.posiciones', 'Número de toma', 'Horizonte-apert', 'Concl.retrasada', 'Tolerancia (+)', 'Concl.anticip.', 'Tolerancia (-)', 'Factor dilatac.', 'Neo Formato']];
    ip16.forEach(function (x) {
      var p = z(x['Plan mant.preventivo']), tx = t(x['Txt plan mantenim.']), pc = pcyc[p];
      Cc.push([p, tx, pc ? pc[0] + ' ' + pc[1] : '', t(x['Status de sistema']), s(x['Modificado el']), t(x['Modificado por']), s(x['Creado el']), t(x['Creado por']), t(x['Estrategia mantenim.']), t(x['Intervalo de toma']), t(x['Ctd.pos.mant.']), x['Nº toma mant.'], t(x['Horizonte apertura']), t(x['Fact.dec.conclusión retr.']), t(x['Tolerancia (+)']), t(x['Fact.dec.concl.anticipada']), t(x['Tolerancia (-)']), x['Factor de dilatación'], ['MRT ', 'MGA ', 'PPL ', 'CAM '].indexOf(tx.slice(0, 4)) >= 0 ? 1 : 0]);
    });
    S['IP16 (IP16 PLANES)'] = Cc;
    // IH06
    var D = [['Ubicac.técnica', 'Denominación', 'Nivel', 'Status sistema', 'Emplazamiento', 'Pto.tbjo.resp.', 'Indicador ABC', 'Indicador ABC', 'Campo clasif.', 'Origen ind. ABC', 'Tp.objeto', 'Tipo', 'Centro coste', 'Puesto trabajo', 'Ind.estructura', 'Grupo planif.', 'Perfil catálogo', 'Centro planif.', 'Creado el', 'Creado por', 'Modificado el', 'Modificado por', 'Tipo ubic.técnica', 'Tipo U.T', 'Act', 'No Act', 'P. Borrados', 'Sin Plan']];
    ih.forEach(function (x) {
      var ut = t(x['Ubicación técnica']), c = cnt[ut] || [0, 0, 0], abc = t(x['Indicador ABC']), tp = t(x['Clase de objeto']), tu = t(x['Tipo ubic.técnica']);
      D.push([ut, t(x['Denom.ubic.técnica']), ut.split('-').length, t(x['Status de sistema']), t(x['Emplazamiento']), t(x['Pto.tbjo.responsable']), abc, pri[abc] || '--', t(x['Campo clasificación']), t(x['Origen indicador ABC']), tp, tob[tp] || '--', t(x['Centro de coste']), t(x['Puesto de trabajo']), t(x['Indicador estructura']), t(x['Grupo planificación']), t(x['Perfil de catálogo']), t(x['Centro planificación']), s(x['Creado el']), t(x['Creado por']), s(x['Modificado el']), t(x['Modificado por']), tu, tut[tu] || '--', c[0], c[1], c[2], (c[0] + c[1] + c[2]) === 0 ? 1 : 0]);
    });
    S['IH06 (UT_fra)'] = D;
    // MAF
    var E = [['Gpo.hojas ruta', 'Cont.gpo.HRuta', 'Operación', '--', 'MAF', 'Documento', 'Materiales', 'Status', 'Hoja', 'Det']];
    Object.keys(maf).sort().forEach(function (m) { var q = m.split('-'); E.push([q[0], q[1], q[2], m, '(falta en el export)', '(falta en el export)', '--', '--', q[0] + '-' + q[1], 'Con MAF']); });
    S['MAF'] = E;
    // OTs
    var F = [['Orden', 'Autor', 'Status usuario', 'Status sistema', 'Texto breve', 'Aviso', 'Plan mant.preventivo', 'Ubicación técnica', 'Pto.tbjo.responsable']];
    iw.forEach(function (x) { F.push([z(x['Orden']), t(x['Autor']), t(x['Status de usuario']), t(x['Status de sistema']), t(x['Texto breve']), t(x['Aviso']), z(x['Plan mant.preventivo']), t(x['Ubicación técnica']), t(x['Pto.tbjo.responsable'])]); });
    S['OTs'] = F;
    S['Datos'] = dr;
    var sem = semFromNames(names || []);
    return { sheets: S, sem: sem, fileName: 'Torre de control ' + sem.replace('/', 'S') + ' FRA.xlsx',
      stats: { hojas: order.length, ops: ops.length, maf: Object.keys(maf).length, ip18: ip18.length, ip16: ip16.length, ih06: ih.length, ots: iw.length } };
  }
  var ORDER = ['IA10', 'IP18 (P_V)', 'IP16 (IP16 PLANES)', 'IH06 (UT_fra)', 'MAF', 'OTs', 'Datos'];
  return { normIA10: normIA10, detect: detect, build: build, ORDER: ORDER, semFromNames: semFromNames };
})();
if (typeof module !== 'undefined') module.exports = TorreTx;
