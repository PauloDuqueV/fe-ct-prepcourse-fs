/*
 * Reglas comerciales al homologar:
 *  - Marca distinta: el cliente pide una marca y se ofrece otra (fila naranja claro).
 *  - Presentación distinta: se elige la presentación más cercana y se ajusta la cantidad (fila azul claro).
 *  - Equivalencias propias de la empresa ("guardian grande = guardian 2.9").
 *  - Unidades del cliente con tamaño conocido ("gradilla" = 100 tubos).
 */
(function (root) {
  'use strict';
  var N = function (s) { return root.Matcher.stripAccents(String(s || '')).toLowerCase(); };

  // Marcas frecuentes del sector; se suman las marcas que tenga el catálogo.
  var KNOWN_BRANDS = ('abbott abbot alere bioline sd standard wondfo roche sysmex siemens beckman coulter mindray bd vacutainer vacuette ' +
    'greiner inprove albor hmb ctk dglab cirumedics randox spinreact biosystems wiener human linear diasys bioanalytica mission ' +
    'combur dirui sempermed nipro terumo becton alltest alttess biotech acon atlas biopanda prodema escala precision cureband ' +
    'jgb 3m kendall labtrol mediglove medigloves topglove').split(/\s+/);

  // Tamaño de unidades que usan los clientes (en unidades sueltas)
  var UNIT_SIZE = { gradilla: 100, gradillas: 100, ciento: 100, cientos: 100, docena: 12, docenas: 12 };
  var LOOSE_UNITS = /^(und|unds|unidad|unidades|ud|uds|un|tubos?|pruebas?|test|pbas?|sobres?|pares?|piezas?)$/;

  var VOL = /(\d+(?:[.,]\d+)?)\s*(ml|cc|lts?|litros?|l|galon(?:es)?|gal)\b/;
  var MULT_VOL = /(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(ml|cc)\b/;
  var PACK = /(?:^|[^0-9.])x\s*(\d{2,5})(?!\s*(?:ml|cc|mm|cm|g|gr|mg|ul|l|lt|lts|[.,]\d|x|\d))\b/;
  var PACK_WORDS = /(\d{2,5})\s*(?:und|unds|unidades|tubos|pruebas|test|tests|pbas|pbs|sobres|tiras)\b/;

  var CONTAINER = /\b(tubos?|jeringas?|recolector|frasco recolector|frasco coprologico|frasco citoquimico|pipetas?|agujas?|copas?|eppendorf|vasos?)\b/;

  function num(s) { return parseFloat(String(s).replace(',', '.')); }

  /** Devuelve { ml, pack } a partir de un texto: "AGUA X 20 LITROS" -> ml 20000; "CAJA X 100" -> pack 100 */
  function size(text) {
    var t = N(text).replace(/(\d)x(\d)/g, '$1 x $2').replace(/cj\s*x|caja\s*x/g, ' x ');
    var out = {};
    var m = t.match(MULT_VOL);
    if (m) out.ml = num(m[1]) * num(m[2]);
    else if ((m = t.match(VOL))) {
      var v = num(m[1]), u = m[2];
      out.ml = /^(l|lt|lts|litro|litros)$/.test(u) ? v * 1000 : /^gal/.test(u) ? v * 3785 : v;
    }
    if ((m = t.match(PACK)) || (m = t.match(PACK_WORDS))) out.pack = num(m[1]);
    return out;
  }

  function productText(p) { return [p.descripcion, p.unidad].filter(Boolean).join(' '); }

  /** Distancia relativa entre presentaciones (0 = igual). null si no se pueden comparar. */
  function sizeDistance(req, prod) {
    if (req.ml && prod.ml) return Math.abs(Math.log(prod.ml / req.ml));
    if (req.pack && prod.pack) return Math.abs(Math.log(prod.pack / req.pack));
    return null;
  }

  /**
   * Entre candidatos casi empatados con el mejor, elige el de presentación más cercana a la pedida.
   * cands: [{product, score}] ordenados. Devuelve el índice elegido.
   */
  function nearestPresentation(reqText, cands, tolerance) {
    var req = size(reqText);
    if (!cands.length || (!req.ml && !req.pack)) return 0;
    var top = cands[0].score, best = 0, bestD = Infinity;
    cands.forEach(function (c, i) {
      if (c.score < top - (tolerance || 0.08)) return;
      var d = sizeDistance(req, size(productText(c.product)));
      if (d != null && d < bestD - 1e-9) { bestD = d; best = i; }
    });
    return best;
  }

  /**
   * Compara lo pedido con el producto ofrecido.
   * item: { texto, cantidad, unidad }  ->  { cantidad, presentacion: null | 'texto explicativo' }
   */
  function adjustQuantity(item, product) {
    var qty = Number(item.cantidad) || 1;
    var prod = size(productText(product));
    var req = size(item.texto);
    var unit = N(item.unidad).trim();
    var note = null, newQty = qty;

    if (UNIT_SIZE[unit]) {
      // "4 gradillas de tubos" = 400 tubos
      var loose = qty * UNIT_SIZE[unit];
      if (prod.pack && prod.pack !== UNIT_SIZE[unit]) {
        newQty = Math.ceil(loose / prod.pack);
        note = qty + ' ' + unit + ' = ' + loose + ' unidades → ' + newQty + ' × presentación de ' + prod.pack;
      } // sin empaque conocido se asume 1 gradilla = 1 presentación de 100
    } else if (req.ml && prod.ml && Math.abs(req.ml - prod.ml) / req.ml > 0.05) {
      // En tubos, jeringas o recolectores el volumen es una característica, no una cantidad a reponer
      var container = CONTAINER.test(N(productText(product))) || req.pack || prod.pack;
      if (!container) newQty = Math.max(1, Math.ceil(qty * req.ml / prod.ml - 1e-9));
      note = 'Pide ' + fmtMl(req.ml) + ', se ofrece ' + fmtMl(prod.ml) + (newQty !== qty ? ' → cantidad ' + qty + ' → ' + newQty : '');
    } else if (req.pack && prod.pack && req.pack !== prod.pack) {
      newQty = Math.max(1, Math.ceil(qty * req.pack / prod.pack - 1e-9));
      note = 'Pide presentación x ' + req.pack + ', se ofrece x ' + prod.pack + (newQty !== qty ? ' → cantidad ' + qty + ' → ' + newQty : '');
    } else if (!unit && prod.pack && qty >= prod.pack && qty % prod.pack === 0) {
      // "TUBO LILA 1000" sin unidad y el producto viene x 100: son unidades sueltas -> 10 cajas
      newQty = qty / prod.pack;
      note = qty + ' unidades → ' + newQty + ' × presentación de ' + prod.pack + ' (verifique)';
    } else if (!unit && !prod.pack && qty >= 100 && CONTAINER.test(N(productText(product)))) {
      note = 'Cantidad ' + qty + ': parece pedida en unidades sueltas; verifique cuántas cajas son';
    } else if (LOOSE_UNITS.test(unit) && prod.pack && qty >= prod.pack) {
      // "200 tubos" con caja x 100 -> 2 cajas
      newQty = Math.ceil(qty / prod.pack);
      note = qty + ' ' + unit + ' → ' + newQty + ' × presentación de ' + prod.pack;
    }
    return { cantidad: newQty, presentacion: note };
  }

  function fmtMl(ml) { return ml >= 1000 ? (ml / 1000).toLocaleString('es-CO') + ' L' : ml.toLocaleString('es-CO') + ' ml'; }

  function brandSet(products) {
    var set = new Set(KNOWN_BRANDS);
    (products || []).forEach(function (p) { N(p.marca).split(/[^a-z0-9]+/).forEach(function (w) { if (w.length >= 3) set.add(w); }); });
    set.delete('abbot'); // se normaliza a abbott
    return set;
  }

  function wordsOf(s) { return N(s).replace(/abbot\b/g, 'abbott').split(/[^a-z0-9]+/).filter(Boolean); }

  /** Marcas mencionadas por el cliente (en el texto o en la columna de requisito). */
  function requestedBrands(item, brands) {
    var found = [];
    wordsOf((item.texto || '') + ' ' + (item.nota || '')).forEach(function (w) {
      if ((w.length >= 3 || w === 'bd' || w === '3m') && brands.has(w) && found.indexOf(w) < 0) found.push(w);
    });
    return found;
  }

  /** Si el cliente pidió marca y el producto no la tiene, devuelve la marca pedida; si no, null. */
  function brandMismatch(item, product, brands) {
    var req = requestedBrands(item, brands);
    if (!req.length) return null;
    var have = new Set(wordsOf([product.descripcion, product.marca, product.proveedor].join(' ')));
    var ok = req.some(function (b) { return have.has(b) || (b === 'vacutainer' && have.has('bd')) || (b === 'bd' && have.has('vacutainer')); });
    return ok ? null : req.map(function (b) { return b.toUpperCase(); }).join(' / ');
  }

  /** "guardian grande = guardian 2.9" (una por línea) -> [[regex, reemplazo]] */
  function parseEquivalences(text) {
    return String(text || '').split(/\r?\n/).map(function (l) {
      var m = l.split('=');
      if (m.length !== 2 || /^\s*#/.test(l)) return null;
      var a = N(m[0]).trim(), b = m[1].trim();
      if (!a || !b) return null;
      // cada palabra admite plural: "guardian grande" también reconoce "guardianes grandes"
      var pat = a.split(/\s+/).map(function (w) {
        var e = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return /[a-z]$/.test(w) ? e + '(?:es|s)?' : e;
      }).join('\\s+');
      return [new RegExp('(^|[^a-z0-9])' + pat + '(?![a-z0-9])', 'g'), b];
    }).filter(Boolean);
  }

  function applyEquivalences(text, rules) {
    var t = N(text);
    (rules || []).forEach(function (r) { t = t.replace(r[0], function (all, pre) { return pre + r[1]; }); });
    return t;
  }

  var DEFAULT_EQUIVALENCES = [
    '# Una equivalencia por línea:  lo que escribe el cliente = cómo está en nuestro catálogo',
    'guardian grande = guardian 2.9',
    'guardian pequeno = guardian 1.5',
    'tubo morado = tubo lila',
    'tapabocas = mascarilla'
  ].join('\n');

  var api = {
    size: size, nearestPresentation: nearestPresentation, adjustQuantity: adjustQuantity,
    brandSet: brandSet, requestedBrands: requestedBrands, brandMismatch: brandMismatch,
    parseEquivalences: parseEquivalences, applyEquivalences: applyEquivalences, DEFAULT_EQUIVALENCES: DEFAULT_EQUIVALENCES
  };
  root.Rules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
