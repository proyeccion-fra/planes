/* ===== Núcleo de cálculo: Proyección Semana N-4 (IP19 + IA10 + IW38) ===== */
var Core = (function () {
  function s(v) { return v == null ? '' : String(v).trim(); }
  function norm(v) { return s(v).toLowerCase().replace(/\s+/g, ' '); }
  function stripZeros(v) { var t = s(v); return t.replace(/^0+(?=\d)/, ''); }

  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var t = s(v); if (!t) return 0;
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(t); return isFinite(n) ? n : 0;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  /* Fechas: Date, número de serie Excel, dd.mm.yyyy, dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd */
  function dateKey(v) {
    if (v instanceof Date && !isNaN(v)) {
      var d = new Date(v.getTime() + 12 * 3600 * 1000);
      return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      var dt = new Date(Math.round((v - 25569) * 86400000));
      return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
    var t = s(v), m;
    if ((m = t.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/))) return ymd(+m[3], +m[2], +m[1]);
    if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return ymd(+m[1], +m[2], +m[3]);
    return '';
  }

  var IP19_COLS = {
    sem: ['semcalend', 'semana de calendario'],
    pto: ['ptotrbres', 'pto.tbjo.responsable'],
    plan: ['pl.mantprv', 'plan mant.preventivo'],
    toma: ['nºordentre', 'nº toma mant.'],
    ubic: ['ubicación técnica'],
    denom: ['denominación de la ubicación técnica', 'denom.ubic.técnica'],
    txt: ['txt plan mantenim.'],
    op: ['texto breve operación', 'txt.brv.operación'],
    fecha: ['fechaprev.', 'fecha planificada'],
    cant: ['nº', 'cantidad'],
    dur: ['durnor', 'duración normal'],
    trabajo: ['trabajo'],
    stat: ['statordentrega'],
    orden: ['orden'],
    cgh: ['cgh', 'cont.grupo hruta'],
    pos: ['txt.pos.mantenim.'],
    gr: ['grhruta', 'grupo hojas ruta'],
    psto: ['pstotbjo', 'puesto de trabajo']
  };
  /* Columnas que la página calcula: si vienen de un archivo ya armado, se descartan */
  var DERIVED = ['especialidad', 'grhruta + cgh', 'ciclo', 'estatus ord', 'estatus material'];

  function findHeaderRow(aoa, mustHave, maxScan) {
    for (var r = 0; r < Math.min(aoa.length, maxScan || 15); r++) {
      var row = (aoa[r] || []).map(norm), ok = true;
      for (var i = 0; i < mustHave.length; i++) {
        var alts = mustHave[i];
        if (!alts.some(function (a) { return row.indexOf(a) >= 0; })) { ok = false; break; }
      }
      if (ok) return r;
    }
    return -1;
  }

  function isIP19(aoa) { return findHeaderRow(aoa, [IP19_COLS.pto, IP19_COLS.stat, IP19_COLS.plan]) >= 0; }
  function isIW38(aoa) { return findHeaderRow(aoa, [['orden'], ['status de sistema', 'status sistema', 'status del sistema']]) >= 0; }

  /* IP19: quita filas y columnas vacías, ubica encabezados por nombre */
  function parseIP19(aoa) {
    var hr = findHeaderRow(aoa, [IP19_COLS.pto, IP19_COLS.stat, IP19_COLS.plan]);
    if (hr < 0) throw new Error('No encontré los encabezados de la IP19 (PtoTrbRes, StatOrdEntrega, Pl.MantPrv).');
    var head = aoa[hr].map(s);
    var body = aoa.slice(hr + 1).filter(function (r) { return r && r.some(function (c) { return s(c) !== ''; }); });
    var keep = [];
    for (var c = 0; c < head.length; c++) {
      var h = norm(head[c]);
      if (DERIVED.indexOf(h) >= 0) continue;
      if (h === '' && !body.some(function (r) { return s(r[c]) !== ''; })) continue;
      keep.push(c);
    }
    var headers = keep.map(function (c) { return head[c] || ('Col' + (c + 1)); });
    var rows = body.map(function (r) { return keep.map(function (c) { var v = r[c];
      if (v == null) return '';
      if (v instanceof Date) { var k = dateKey(v); if (k) { var q = k.split('-'); return q[2] + '.' + q[1] + '.' + q[0]; } return ''; }
      return typeof v === 'string' ? v.trim() : v; }); });
    /* Si el archivo ya venía armado (Estatus Ord), se usa como respaldo de la IW38 */
    var hOrd = head.map(norm).indexOf('estatus ord'), hOr = head.map(norm).indexOf('orden'), prev = null;
    if (hOrd >= 0 && hOr >= 0) {
      prev = {};
      body.forEach(function (r) { var o = stripZeros(r[hOr]); if (!o) return; var st = s(r[hOrd]); prev[o] = /^sin or/i.test(st) ? '' : st; });
    }
    var nh = headers.map(norm), idx = {};
    Object.keys(IP19_COLS).forEach(function (k) {
      idx[k] = -1;
      IP19_COLS[k].some(function (a) { var i = nh.indexOf(a); if (i >= 0) { idx[k] = i; return true; } });
    });
    return { headers: headers, rows: rows, idx: idx, prevStatus: prev };
  }

  function key(gr, cgh) { gr = stripZeros(gr); cgh = stripZeros(cgh); return gr && cgh ? gr + '-' + cgh : ''; }

  /* IA10: export crudo (col A vacía, B GrHRuta, C CGH, D paquete, E ciclo) o ya armado con encabezados */
  function parseIA10(aoa) {
    var list = [], hr = -1, gi = -1, ci = -1, ki = -1, yi = -1;
    for (var r = 0; r < Math.min(aoa.length, 8); r++) {
      var row = (aoa[r] || []).map(norm);
      var y = row.findIndex(function (x) { return x === 'ciclo' || x === 'txt.ciclo' || x === 'texto ciclo'; });
      if (y >= 0) {
        hr = r; yi = y;
        gi = row.findIndex(function (x) { return x === 'grhruta' || x === 'grupo hojas ruta'; });
        ci = row.findIndex(function (x) { return x === 'cgh' || x === 'cont.grupo hruta' || x === 'contador'; });
        ki = row.findIndex(function (x) { return x.indexOf('+') >= 0; });
        break;
      }
    }
    if (hr < 0) {
      var offs = {};
      for (var r2 = 0; r2 < Math.min(aoa.length, 60); r2++) {
        var rr = aoa[r2] || [];
        for (var c = 0; c < rr.length; c++) if (s(rr[c]) !== '') { offs[c] = (offs[c] || 0) + 1; break; }
      }
      var off = 0, best = -1;
      Object.keys(offs).forEach(function (k) { if (offs[k] > best) { best = offs[k]; off = +k; } });
      gi = off; ci = off + 1; yi = off + 3;
    }
    for (var i = hr + 1; i < aoa.length; i++) {
      var a = aoa[i] || [];
      var g = gi >= 0 ? s(a[gi]) : '', cc = ci >= 0 ? s(a[ci]) : '', cy = s(a[yi]);
      if ((!g || !cc) && ki >= 0) { var p = s(a[ki]).split('-'); g = p[0] || ''; cc = p[1] || ''; }
      if (!/^\d+$/.test(g) || !/^\d+$/.test(cc) || !cy) continue;
      list.push({ gr: stripZeros(g), cgh: stripZeros(cc), ciclo: cy });
    }
    if (!list.length) throw new Error('No encontré filas de ciclos en la IA10 (Grupo hoja de ruta, contador y ciclo).');
    return list;
  }

  function parseIW38(aoa) {
    var hr = findHeaderRow(aoa, [['orden'], ['status de sistema', 'status sistema', 'status del sistema']]);
    var h = aoa[hr].map(norm);
    var oi = h.indexOf('orden');
    var si = h.findIndex(function (x) { return x === 'status de sistema' || x === 'status sistema' || x === 'status del sistema'; });
    var map = {};
    for (var i = hr + 1; i < aoa.length; i++) {
      var o = stripZeros((aoa[i] || [])[oi]); if (!o) continue;
      map[o] = s((aoa[i] || [])[si]);
    }
    return map;
  }

  function especialidad(pto) {
    var c = s(pto).slice(-1).toUpperCase();
    return c === 'I' ? 'Instrumentación' : c === 'E' ? 'Eléctrico' : c === 'M' ? 'Mecánico' : 'Sin especialidad';
  }

  function material(ordenOk, status) {
    var u = s(status).toUpperCase();
    if (u.indexOf('FMAT') >= 0) return 'Falta Disponibilidad Material';
    if (u.indexOf('KKMP') >= 0) return 'Sin Componentes';
    if (u.indexOf('MACO') >= 0) return 'Material Confirmado';
    return 'Revisar';
  }

  /* Une las tres fuentes y calcula las columnas F, AO, AP, AQ y AR */
  function build(ip, ia10List, iw38) {
    if (!iw38 && ip.prevStatus) iw38 = ip.prevStatus;
    var cyc = {};
    (ia10List || []).forEach(function (x) {
      var k = x.gr + '-' + x.cgh;
      if (!cyc[k]) cyc[k] = { first: x.ciclo, all: [] };
      if (cyc[k].all.indexOf(x.ciclo) < 0) cyc[k].all.push(x.ciclo);
    });
    var I = ip.idx;
    function g(r, k) { return I[k] >= 0 ? r[I[k]] : ''; }
    var recs = ip.rows.map(function (r) {
      var orden = stripZeros(g(r, 'orden'));
      var llave = key(g(r, 'gr'), g(r, 'cgh'));
      var cy = cyc[llave];
      var estOrd, estMat;
      if (!orden) { estOrd = 'Sin Orden'; estMat = 'Sin Orden'; }
      else if (!iw38) { estOrd = 'Falta cargar IW38'; estMat = 'Revisar'; }
      else if (!(orden in iw38)) { estOrd = 'No está en la IW38'; estMat = 'Revisar'; }
      else if (!iw38[orden]) { estOrd = 'Sin Orden'; estMat = 'Sin Orden'; }
      else { estOrd = iw38[orden]; estMat = material(true, iw38[orden]); }
      return {
        raw: r,
        sem: s(g(r, 'sem')), pto: s(g(r, 'pto')), esp: especialidad(g(r, 'pto')),
        plan: stripZeros(g(r, 'plan')), toma: s(g(r, 'toma')), txt: s(g(r, 'txt')),
        op: s(g(r, 'op')), pos: s(g(r, 'pos')), ubic: s(g(r, 'ubic')), denom: s(g(r, 'denom')),
        fecha: dateKey(g(r, 'fecha')), stat: s(g(r, 'stat')), orden: orden, psto: s(g(r, 'psto')),
        cant: num(g(r, 'cant')), dur: num(g(r, 'dur')), hh: num(g(r, 'trabajo')),
        llave: llave, ciclo: cy ? cy.first : (ia10List ? 'Sin ciclo en IA10' : ''),
        ciclosAlt: cy && cy.all.length > 1 ? cy.all : null,
        estOrd: estOrd, estMat: estMat
      };
    });
    return { headers: ip.headers, idx: ip.idx, recs: recs, ia10: ia10List || null, hasIW38: !!iw38 };
  }

  /* Semana ISO "2026/48" → lunes */
  function weekDays(sem, recs) {
    var m = s(sem).match(/^(\d{4})\D+(\d{1,2})$/), days = [];
    if (m) {
      var y = +m[1], w = +m[2];
      var jan4 = new Date(Date.UTC(y, 0, 4));
      var mon = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000 + (w - 1) * 7 * 86400000);
      for (var i = 0; i < 7; i++) {
        var d = new Date(mon.getTime() + i * 86400000);
        days.push(ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
      }
    }
    (recs || []).forEach(function (r) { if (r.fecha && days.indexOf(r.fecha) < 0) days.push(r.fecha); });
    return days.sort();
  }

  function indexHeaders(headers) {
    var nh = headers.map(norm), idx = {};
    Object.keys(IP19_COLS).forEach(function (k) {
      idx[k] = -1;
      IP19_COLS[k].some(function (a) { var i = nh.indexOf(a); if (i >= 0) { idx[k] = i; return true; } });
    });
    return idx;
  }
  function fold(t) { return s(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  return { indexHeaders: indexHeaders, fold: fold, parseIP19: parseIP19, parseIA10: parseIA10, parseIW38: parseIW38, build: build, isIP19: isIP19, isIW38: isIW38,
    weekDays: weekDays, especialidad: especialidad, num: num, dateKey: dateKey, s: s };
})();
if (typeof module !== 'undefined') module.exports = Core;
