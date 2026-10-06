/*
 * Importación de listas de proveedores. Reconoce encabezados con nombres variados,
 * varias tablas en una misma hoja (encabezados repetidos) y títulos de sección,
 * que se usan como categoría.
 */
(function (root) {
  'use strict';

  var COLS = {
    codigo: /^(c[oó]d(igo)?\.?|ref(erencia)?\.?|sku|item code|c[oó]digo interno)$/i,
    descripcion: /^(descripci[oó]n|producto|nombre|art[ií]culo|detalle|insumos?|[ií]tem|elemento|material)/i,
    categoria: /^(categor[ií]a|[aá]rea|l[ií]nea|grupo|familia|tipo|secci[oó]n)$/i,
    proveedor: /^(proveedor|fabricante|laboratorio)$/i,
    unidad: /^(unidad|presentaci[oó]n|empaque|u\/m|um|medida|embalaje)$/i,
    contenido: /^(ml|volumen|contenido)$/i,
    rendimiento: /^(rendimiento|pruebas|test|determinaciones)$/i,
    marca: /^(marca)$/i,
    costo: /^(costo|precio( de)? costo|valor unitario|vr\.? unit|precio unitario|precio distribuidor|precio compra|precio neto|precio|valor)(?!.*total)/i,
    iva: /^(%\s*)?(iva|impuesto)/i,
    sinonimos: /^(sin[oó]nimos?|alias|otros nombres|palabras clave)/i
  };

  function clean(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }

  function parseMoney(v) {
    if (typeof v === 'number') return Math.round(v * 100) / 100;
    var s = String(v == null ? '' : v).replace(/[^0-9.,-]/g, '');
    if (!s) return 0;
    var lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) {
      var dec = lastDot > lastComma ? '.' : ',';
      s = s.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
    } else if (lastComma >= 0) {
      s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    var n = parseFloat(s);
    return isNaN(n) ? 0 : Math.round(n * 100) / 100;
  }

  function parseIva(v) {
    if (v === '' || v == null) return null;
    var n = parseMoney(v);
    return n > 0 && n < 1 ? Math.round(n * 100) : n;
  }

  function headerMap(row) {
    var m = {};
    row.forEach(function (cell, j) {
      var v = root.Matcher.stripAccents(clean(cell));
      if (!v) return;
      Object.keys(COLS).some(function (k) {
        if (m[k] == null && COLS[k].test(v)) { m[k] = j; return true; }
        return false;
      });
    });
    return m.descripcion != null && (m.costo != null || m.codigo != null) ? m : null;
  }

  /**
   * rows: matriz de celdas de una hoja. opts: { hoja, proveedor, categoria, ivaDefault }
   * Devuelve [{codigo, descripcion, categoria, proveedor, unidad, marca, costo, iva, sinonimos}]
   */
  function parseSheet(rows, opts) {
    opts = opts || {};
    var out = [], map = null, section = '';
    rows.forEach(function (r) {
      r = r || [];
      var filled = r.map(clean).filter(Boolean);
      if (!filled.length) return;
      var hm = headerMap(r);
      if (hm) { map = hm; return; }
      // Título de sección: una sola celda con texto y sin números de precio
      if (map && filled.length === 1 && /[a-z]{3,}/i.test(filled[0]) && typeof r.find(function (c) { return clean(c); }) === 'string') {
        section = filled[0];
        return;
      }
      if (!map) return;
      var desc = clean(r[map.descripcion]);
      if (!desc || !/[a-z]{2,}/i.test(desc)) return;
      var costo = map.costo != null ? parseMoney(r[map.costo]) : 0;
      var unidad = map.unidad != null ? clean(r[map.unidad]) : '';
      if (map.contenido != null && clean(r[map.contenido])) {
        var c = clean(r[map.contenido]);
        unidad = (unidad ? unidad + ' ' : '') + (/^\d+([.,]\d+)?$/.test(c) ? c + ' ml' : c);
      }
      var rend = map.rendimiento != null ? clean(r[map.rendimiento]) : '';
      var p = {
        codigo: map.codigo != null ? clean(r[map.codigo]) : '',
        descripcion: desc,
        categoria: opts.categoria || (map.categoria != null && clean(r[map.categoria])) || section || opts.hoja || '',
        proveedor: opts.proveedor || (map.proveedor != null ? clean(r[map.proveedor]) : ''),
        unidad: unidad,
        marca: map.marca != null ? clean(r[map.marca]) : '',
        costo: costo,
        iva: map.iva != null && parseIva(r[map.iva]) != null ? parseIva(r[map.iva]) : (opts.ivaDefault != null ? opts.ivaDefault : 19),
        sinonimos: map.sinonimos != null ? clean(r[map.sinonimos]) : ''
      };
      if (/^\d+$/.test(rend)) p.unidad = (p.unidad ? p.unidad + ' · ' : '') + rend + ' pruebas';
      out.push(p);
    });
    return out;
  }

  function prefixFrom(s) {
    var w = root.Matcher.normalize(s || 'PROD').toUpperCase().split(' ').filter(function (x) { return /^[A-Z]/.test(x); });
    return (w.length > 1 ? w.slice(0, 3).map(function (x) { return x[0]; }).join('') : (w[0] || 'PRD').slice(0, 3)) || 'PRD';
  }

  /**
   * Une productos importados con el catálogo actual.
   * Sin código: se busca por descripción igual; si no existe se genera un código estable (p. ej. IPR-0007).
   */
  function merge(products, incoming, mode) {
    var N = root.Matcher.normalize;
    if (mode === 'replace') products = [];
    if (mode === 'replace-prov') {
      var provs = new Set(incoming.map(function (p) { return p.proveedor; }));
      products = products.filter(function (p) { return !provs.has(p.proveedor); });
    }
    var byCode = new Map(), byDesc = new Map();
    products.forEach(function (p, i) { byCode.set(String(p.codigo).toUpperCase(), i); byDesc.set(N(p.descripcion), i); });
    var used = new Set(byCode.keys());
    var counters = {};
    var added = 0, updated = 0;
    incoming.forEach(function (p) {
      var idx;
      if (p.codigo) idx = byCode.get(p.codigo.toUpperCase());
      else {
        idx = byDesc.get(N(p.descripcion));
        if (idx != null) p.codigo = products[idx].codigo;
        else {
          var pre = prefixFrom(p.categoria || p.proveedor);
          var n = counters[pre] || 0, code;
          do { n++; code = pre + '-' + String(n).padStart(4, '0'); } while (used.has(code));
          counters[pre] = n;
          p.codigo = code;
        }
      }
      used.add(p.codigo.toUpperCase());
      if (idx != null) {
        var old = products[idx];
        if (!p.sinonimos) p.sinonimos = old.sinonimos;
        products[idx] = p; updated++;
      } else {
        byCode.set(p.codigo.toUpperCase(), products.length);
        byDesc.set(N(p.descripcion), products.length);
        products.push(p); added++;
      }
    });
    return { products: products, added: added, updated: updated };
  }

  var api = { parseSheet: parseSheet, merge: merge, parseMoney: parseMoney };
  root.Catalog = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
