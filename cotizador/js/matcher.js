/*
 * Homologación: convierte el texto que envía el cliente en productos del catálogo.
 * Combina coincidencia por palabras (con prefijos), trigramas de caracteres,
 * números/medidas y alias aprendidos de cotizaciones anteriores.
 */
(function (root) {
  'use strict';

  // Palabras que no aportan al identificar un producto.
  var STOPWORDS = new Set(('de del la las el los un una unos unas y o e para por con sin en al a ' +
    'x por favor cotizar cotizacion necesito necesitamos requiero requerimos solicito ' +
    'solicitamos favor gracias precio precios valor buen buenos buenas dias tardes noches ' +
    'hola cotizame enviar envie envien que su sus nos me le').split(/\s+/));

  // Equivalencias frecuentes en el sector (abreviaturas -> forma canónica).
  var SYNONYMS = {
    und: 'unidad', unds: 'unidad', un: 'unidad', unid: 'unidad', unidades: 'unidad', uds: 'unidad', ud: 'unidad',
    cj: 'caja', cjs: 'caja', cajas: 'caja', cja: 'caja',
    pqt: 'paquete', paq: 'paquete', paquetes: 'paquete', pq: 'paquete',
    fco: 'frasco', frascos: 'frasco', fcos: 'frasco',
    tubos: 'tubo', tb: 'tubo',
    guante: 'guantes', glove: 'guantes', gloves: 'guantes',
    nitrilo: 'nitrilo', nitrilos: 'nitrilo', latex: 'latex',
    talla: 'talla', t: 'talla',
    ml: 'ml', mililitros: 'ml', cc: 'ml',
    lt: 'litro', lts: 'litro', litros: 'litro', l: 'litro',
    gr: 'g', grs: 'g', gramos: 'g',
    pba: 'prueba', pbas: 'prueba', pruebas: 'prueba', test: 'prueba', tests: 'prueba',
    rapida: 'rapida', rapidas: 'rapida',
    reactivos: 'reactivo', rvo: 'reactivo',
    tiras: 'tira', strips: 'tira',
    agujas: 'aguja', jeringas: 'jeringa', jer: 'jeringa',
    tapa: 'tapa', tapon: 'tapa',
    lila: 'lila', morada: 'lila', morado: 'lila', edta: 'edta',
    roja: 'roja', rojo: 'roja', amarilla: 'amarilla', amarillo: 'amarilla', gris: 'gris', azul: 'azul', verde: 'verde',
    coprologico: 'coprologico', coprologicos: 'coprologico', copro: 'coprologico', heces: 'coprologico',
    parcial: 'parcial', citoquimico: 'citoquimico', citoquimicos: 'citoquimico', orina: 'orina',
    // Vocabulario de laboratorio clínico (español / inglés / siglas)
    hiv: 'vih', syphilis: 'sifilis', sifilis: 'sifilis', vdrl: 'sifilis',
    tgo: 'ast', got: 'ast', ast: 'ast', tgp: 'alt', gpt: 'alt', alt: 'alt',
    crp: 'pcr', pcr: 'pcr', rf: 'fr', fr: 'fr', aso: 'aso',
    alp: 'fosfatasa', fosfatasa: 'fosfatasa', hba1c: 'glicosilada', glicosilada: 'glicosilada', a1c: 'glicosilada',
    ferritin: 'ferritina', albumin: 'albumina', calcium: 'calcio', glucose: 'glucosa', protein: 'proteina', proteinas: 'proteina',
    triglyceride: 'triglicerido', triglycerides: 'triglicerido', trigliceridos: 'triglicerido', trigliceride: 'triglicerido',
    magnesium: 'magnesio', iron: 'hierro', phosphorus: 'fosforo', bilirubina: 'bilirrubina', bilirrubinas: 'bilirrubina',
    toxo: 'toxoplasma', toxoplasmosis: 'toxoplasma', hbsag: 'hepatitis', hcv: 'hepatitis',
    tapabocas: 'mascarilla', cubrebocas: 'mascarilla', mascarillas: 'mascarilla', mascara: 'mascarilla',
    portaobjeto: 'portaobjeto', portaobjetos: 'portaobjeto', cubreobjeto: 'cubreobjeto', cubreobjetos: 'cubreobjeto', laminilla: 'lamina', laminillas: 'lamina', laminas: 'lamina',
    multidrug: 'multidroga', multidrogas: 'multidroga', drogas: 'multidroga', 'multi': 'multi',
    cassete: 'cassette', casete: 'cassette', cassettes: 'cassette',
    pbs: 'prueba', tirillas: 'tira', tirilla: 'tira', uroanalisis: 'uroanalisis',
    bajalengua: 'bajalenguas', depresor: 'bajalenguas', depresores: 'bajalenguas',
    galon: 'galon', galones: 'galon', isopropilico: 'isopropilico', violeta: 'violeta', genciana: 'violeta',
    puntas: 'punta', puntillas: 'punta', tips: 'punta', microtubo: 'eppendorf', eppendorf: 'eppendorf',
    guardian: 'guardian', guardianes: 'guardian', corto: 'guardian', cortopunzante: 'guardian',
    hcg: 'embarazo', embarazo: 'embarazo', bun: 'urea', hexoquinasa: 'hk', hexokinasa: 'hk',
    cocaina: 'coc', marihuana: 'thc', cannabis: 'thc', anfetamina: 'amp', anfetaminas: 'amp', benzodiacepina: 'bzo', benzodiacepinas: 'bzo',
    morfina: 'mop', metanfetamina: 'met', metadona: 'mtd', extasis: 'mdma', opiaceos: 'opi', opiaceo: 'opi', barbituricos: 'bar'
  };

  var QUALIFIERS = ['calibrador', 'multicalibrador', 'control', 'duo', 'ns1'];

  // Frases de varias palabras que equivalen a un solo término
  var PHRASES = [
    [/\bfactor(es)? reumatoide[oa]?s?\b/g, 'fr'], [/\bporta ?objetos?\b/g, 'portaobjeto'], [/\bcubre ?objetos?\b/g, 'cubreobjeto'],
    [/\bproteina c reactiva\b/g, 'pcr'], [/\bnitrogeno ureico\b/g, 'urea'], [/\bacido urico\b/g, 'acidourico'],
    [/\bsangre oculta\b/g, 'sangreoculta'], [/\bguardian(es)?\b/g, 'guardian'], [/\b(cj|caja|cajas)x\s?(\d)/g, 'caja x $2'],
    [/\bx(\d)/g, 'x $1']
  ];

  function stripAccents(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function normalize(s) {
    var t = stripAccents(s).toLowerCase();
    PHRASES.forEach(function (p) { t = t.replace(p[0], p[1]); });
    return t
      .replace(/(\d),(\d)/g, '$1.$2')          // 7,5 -> 7.5
      .replace(/(\d)\s*(ml|cc|mm|cm|g|gr|mg|l|lt|ul|µl)\b/g, '$1 $2')
      .replace(/(\d)x(\d)/g, '$1 x $2')        // 13x75 -> 13 x 75
      .replace(/([a-z])\/(?=[a-z])/g, '$1 ')     // coc/amp/thc -> coc amp thc
      .replace(/[^a-z0-9.%/ ]+/g, ' ')
      .replace(/\s\.|\.\s|\.$|^\./g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(s) {
    return normalize(s).split(' ').filter(Boolean).map(function (t) {
      // plural simple: "jeringas" -> "jeringa" si no está en el diccionario
      var syn = SYNONYMS[t];
      if (syn) return syn;
      if (t.length > 4 && /[a-z]s$/.test(t) && !/\d/.test(t)) return t.slice(0, -1);
      return t;
    }).filter(function (t) { return !STOPWORDS.has(t); });
  }

  function trigrams(s) {
    var str = '  ' + normalize(s).replace(/ /g, '  ') + '  ';
    var set = new Set();
    for (var i = 0; i < str.length - 2; i++) set.add(str.substr(i, 3));
    return set;
  }

  function diceSets(a, b) {
    if (!a.size || !b.size) return 0;
    var inter = 0;
    a.forEach(function (x) { if (b.has(x)) inter++; });
    return (2 * inter) / (a.size + b.size);
  }

  function isNumberToken(t) { return /^\d+(\.\d+)?%?$/.test(t); }

  // Similitud entre dos palabras: igual = 1, prefijo (>=3 letras) = 0.85, casi igual = 0.7
  function tokenSim(a, b) {
    if (a === b) return 1;
    if (isNumberToken(a) || isNumberToken(b)) return 0;
    var min = Math.min(a.length, b.length);
    if (min >= 3 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)) return 0.85;
    if (min >= 5 && levenshtein(a, b) <= 1) return 0.75;
    if (min >= 7 && levenshtein(a, b) <= 2) return 0.6;
    return 0;
  }

  function levenshtein(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 99;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /**
   * Construye un índice del catálogo para búsquedas rápidas.
   * products: [{codigo, descripcion, categoria, proveedor, marca, unidad, sinonimos}]
   */
  function buildIndex(products) {
    var docs = products.map(function (p, i) {
      var text = [p.descripcion, p.marca, p.unidad, p.sinonimos].filter(Boolean).join(' ');
      var toks = tokenize(text);
      return {
        i: i,
        product: p,
        codeNorm: normalize(p.codigo).replace(/\s/g, ''),
        tokens: toks,
        tokenSet: new Set(toks),
        grams: trigrams(p.descripcion + ' ' + (p.sinonimos || '')),
        catTokens: new Set(tokenize(p.categoria || ''))
      };
    });
    // Frecuencia de palabras para dar más peso a las palabras raras (idf)
    var df = Object.create(null);
    docs.forEach(function (d) { d.tokenSet.forEach(function (t) { df[t] = (df[t] || 0) + 1; }); });
    var n = docs.length || 1;
    var idf = function (t) { return Math.log(1 + n / (1 + (df[t] || 0))); };
    return { docs: docs, idf: idf, byCode: new Map(docs.map(function (d) { return [d.codeNorm, d]; })) };
  }

  /**
   * Devuelve los mejores candidatos para un texto solicitado.
   * aliases: { textoNormalizado: codigo } aprendidos.
   */
  function match(query, index, opts) {
    opts = opts || {};
    var limit = opts.limit || 5;
    var aliases = opts.aliases || {};
    var qNorm = normalize(query);
    if (!qNorm) return [];
    var results = [];

    // 1) Alias aprendido (el usuario ya homologó este texto antes)
    var aliasCode = aliases[qNorm];
    if (aliasCode) {
      var ad = index.byCode.get(normalize(aliasCode).replace(/\s/g, ''));
      if (ad) results.push({ product: ad.product, score: 1, reason: 'alias' });
    }

    var qTokens = tokenize(query);
    var qGrams = trigrams(query);
    var qCompact = qNorm.replace(/\s/g, '');
    var qNums = qTokens.filter(isNumberToken);
    var qWords = qTokens.filter(function (t) { return !isNumberToken(t); });

    index.docs.forEach(function (d) {
      var score = 0;
      // 2) El cliente escribió nuestro código
      if (d.codeNorm && d.codeNorm.length >= 3 &&
          (qTokens.indexOf(d.codeNorm) >= 0 || qCompact === d.codeNorm)) {
        score = 0.98;
      } else {
        // 3) Coincidencia ponderada por palabras
        var wSum = 0, wHit = 0;
        qWords.forEach(function (qt) {
          var w = index.idf(qt);
          wSum += w;
          if (d.tokenSet.has(qt)) { wHit += w; return; }
          var best = 0;
          for (var k = 0; k < d.tokens.length && best < 0.85; k++) {
            var s = tokenSim(qt, d.tokens[k]);
            if (s > best) best = s;
          }
          if (!best && d.catTokens.has(qt)) best = 0.5;
          wHit += w * best;
        });
        var wordScore = wSum ? wHit / wSum : 0;

        // Cobertura inversa: qué parte del producto está en la solicitud
        var dWords = d.tokens.filter(function (t) { return !isNumberToken(t); });
        var cover = 0;
        if (dWords.length) {
          var qSet = new Set(qWords);
          dWords.forEach(function (t) {
            if (qSet.has(t)) cover++;
            else if (qWords.some(function (q) { return tokenSim(q, t) >= 0.75; })) cover += 0.7;
          });
          cover /= dWords.length;
        }

        // 4) Números / medidas (tallas, ml, calibres): pesan mucho
        var numScore = 0.5;
        if (qNums.length) {
          var dNums = d.tokens.filter(isNumberToken);
          if (dNums.length) {
            var hits = qNums.filter(function (x) { return dNums.indexOf(x) >= 0; }).length;
            numScore = hits / Math.max(qNums.length, 1);
            if (hits === 0) numScore = 0;
          } else {
            numScore = 0.3;
          }
        }

        // Controles, calibradores y kits "duo" son productos distintos al reactivo: solo si se piden

        var gramScore = diceSets(qGrams, d.grams);
        score = 0.55 * wordScore + 0.15 * cover + 0.2 * gramScore + 0.1 * numScore;
        if (qNums.length && numScore === 0) score *= 0.8;
        // Controles, calibradores y kits "duo" son productos distintos al reactivo: solo si se piden
        QUALIFIERS.forEach(function (w) { if (d.tokenSet.has(w) && qWords.indexOf(w) < 0) score *= 0.85; });
      }
      if (score > 0.12) results.push({ product: d.product, score: score, reason: 'similitud' });
    });

    // Quitar duplicados (alias + similitud del mismo producto)
    var seen = new Set();
    return results.sort(function (a, b) { return b.score - a.score; })
      .filter(function (r) {
        if (seen.has(r.product.codigo)) return false;
        seen.add(r.product.codigo);
        return true;
      })
      .slice(0, limit)
      .map(function (r) { r.score = Math.min(1, Math.round(r.score * 100) / 100); return r; });
  }

  var api = { normalize: normalize, tokenize: tokenize, buildIndex: buildIndex, match: match, stripAccents: stripAccents };
  root.Matcher = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
