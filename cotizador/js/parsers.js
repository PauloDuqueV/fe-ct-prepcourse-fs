/*
 * Lectura de solicitudes: texto/WhatsApp, Excel/CSV, Word, PDF e imágenes (OCR).
 * Todo termina en una lista homogénea: [{ cantidad, unidad, texto }]
 */
(function (root) {
  'use strict';

  var UNIT_WORDS = 'unidades|unidad|unds|und|uds|ud|un|cajas|caja|cjs|cj|paquetes|paquete|pqts|pqt|paq|' +
    'frascos|frasco|fcos|fco|kits|kit|rollos|rollo|bolsas|bolsa|galones|galon|litros|litro|lts|lt|' +
    'pares|par|cientos|ciento|blister|tubos|tubo|sobres|sobre|cartuchos|cartucho|viales|vial|ampollas|ampolla|' +
    'pruebas|prueba|test|pbas|pba|resmas|resma';
  var NUM = '(\\d+(?:[.,]\\d+)?)';

  var reWhatsappPrefix = /^\s*\[?\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?\s?m\.?)?\]?\s*(?:-\s*)?[^:]{1,40}:\s*/i;
  var reBullet = /^\s*(?:[-*•·▪►➢✓✔>]+|\(?[a-z]\)|\d{1,3}\s*[.)-](?!\d))\s*/i;
  var reLeadQty = new RegExp('^' + NUM + '\\s*(' + UNIT_WORDS + ')?\\.?\\s+(?:de\\s+)?(.+)$', 'i');
  var reTrailQty = new RegExp('^(.+?)[\\s,:;-]+(?:x|por|cant(?:idad)?\\.?:?|qty:?)\\s*' + NUM + '\\s*(' + UNIT_WORDS + ')?\\.?\\s*$', 'i');
  var reTrailQtyUnit = new RegExp('^(.+?)[\\s,:;-]+' + NUM + '\\s*(' + UNIT_WORDS + ')\\.?\\s*$', 'i');
  var reNoise = /^(hola|buen[oa]s?\s*(dias|d[ií]as|tardes|noches)?|gracias|muchas gracias|saludos|cordial(mente)?|atentamente|feliz\s+d[ií]a|quedo atent[oa]|por favor|favor cotizar|cotizar|cotizaci[oó]n|buen d[ií]a|ok|listo|<media omitted>|<multimedia omitido>|imagen omitida|este mensaje fue eliminado)[\s.!,:]*$/i;

  function toNumber(s) {
    if (s == null || s === '') return null;
    if (typeof s === 'number') return s;
    var n = parseFloat(String(s).replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  /** Interpreta una línea suelta: "10 cajas de guantes nitrilo M" o "Guantes nitrilo M x 10" */
  function parseLine(raw) {
    var line = String(raw || '').replace(reWhatsappPrefix, '').replace(/\t+/g, ' ').trim();
    line = line.replace(reBullet, '').trim();
    if (!line || line.length < 3 || !/[a-záéíóúñ]{2,}/i.test(line)) return null;
    if (reNoise.test(line)) return null;
    if (/(favor|por favor|solicito|solicitamos|necesitamos|requerimos)?\s*cotiz/i.test(line) && line.split(/\s+/).length <= 5) return null;
    if (/^(cliente|nit|fecha|direcci[oó]n|tel[eé]fono|cel|email|correo|ciudad|atn|se[nñ]ores?)\b\s*[:.]/i.test(line)) return null;

    var m, cantidad = null, unidad = '', texto = line;
    if ((m = line.match(reLeadQty)) && !/^\d+(\.\d+)?\s*(ml|cc|mm|cm|mg|g|gr|ul|%)\b/i.test(line)) {
      cantidad = toNumber(m[1]); unidad = (m[2] || '').toLowerCase(); texto = m[3];
    } else if ((m = line.match(reTrailQty))) {
      texto = m[1]; cantidad = toNumber(m[2]); unidad = (m[3] || '').toLowerCase();
    } else if ((m = line.match(reTrailQtyUnit))) {
      texto = m[1]; cantidad = toNumber(m[2]); unidad = (m[3] || '').toLowerCase();
    }
    texto = texto.replace(/[\s,;:.-]+$/, '').trim();
    if (!texto) return null;
    return { cantidad: cantidad || 1, cantidadDetectada: cantidad != null, unidad: unidad, texto: texto };
  }

  function parseText(text) {
    var lines = [];
    String(text || '').split(/\r?\n|;(?=\s*\d)/).forEach(function (l) {
      // "1 TGO y 1 TGP" / "2 VIH, 3 sifilis": varias cantidades en la misma línea
      var body = l.replace(reWhatsappPrefix, '').replace(reBullet, '');
      if (/^\s*\d/.test(body) && /\s+y\s+\d+\s+[a-z]{2,}|,\s*\d+\s+[a-z]{2,}\s+[a-z]/i.test(body)) {
        body.split(/\s+y\s+(?=\d+\s+[a-z]{2,})|,\s*(?=\d+\s+[a-z]{2,}\s+[a-z])/i).forEach(function (x) { lines.push(x); });
      } else lines.push(l);
    });
    return lines.map(parseLine).filter(Boolean);
  }

  var HEADER_DESC = /^(descripci[oó]n|producto|productos|art[ií]culo|nombre|detalle|insumo|elemento|material|concepto)\b/i;
  var HEADER_DESC_WEAK = /^(item|[ií]tem|referencia|ref)\b/i;
  var HEADER_QTY = /^(cant|cantidad|cantidades|qty|unidades solicitadas|solicitado|pedido|total unidades)\b/i;
  var HEADER_UNIT = /^(unidad|u\/m|um|presentaci[oó]n|empaque|medida)\b/i;
  var HEADER_CODE = /^(c[oó]digo|cod|ref|referencia cliente|sku)\b/i;

  /** Convierte una tabla (array de filas) en solicitudes, detectando encabezados. */
  function parseTable(rows) {
    rows = (rows || []).map(function (r) { return (r || []).map(function (c) { return c == null ? '' : String(c).trim(); }); })
      .filter(function (r) { return r.some(Boolean); });
    if (!rows.length) return [];

    var hIdx = -1, cols = null;
    for (var i = 0; i < Math.min(rows.length, 25); i++) {
      var r = rows[i], c = { desc: -1, qty: -1, unit: -1, code: -1 };
      r.forEach(function (cell, j) {
        var v = cell.toLowerCase();
        if (c.desc < 0 && HEADER_DESC.test(v)) c.desc = j;
        else if (c.qty < 0 && HEADER_QTY.test(v)) c.qty = j;
        else if (c.unit < 0 && HEADER_UNIT.test(v)) c.unit = j;
        else if (c.code < 0 && HEADER_CODE.test(v)) c.code = j;
      });
      if (c.desc < 0) {
        // "Ítem" o "Referencia" solo cuentan como descripción si no hay otra columna mejor
        r.forEach(function (cell, j) {
          if (c.desc < 0 && j !== c.qty && j !== c.unit && HEADER_DESC_WEAK.test(cell)) c.desc = j;
        });
        if (c.code === c.desc) c.code = -1;
      }
      if (c.desc >= 0 && (c.qty >= 0 || r.filter(Boolean).length > 1)) { hIdx = i; cols = c; break; }
    }

    if (!cols) {
      // Sin encabezados: cada fila se interpreta como una línea de texto.
      return rows.map(function (r) {
        // si hay una celda solo numérica y otra con texto, úsalas como cantidad + descripción
        var nums = r.filter(function (x) { return /^\d+([.,]\d+)?$/.test(x); });
        var texts = r.filter(function (x) { return /[a-z]{3,}/i.test(x); });
        if (nums.length && texts.length) {
          var longest = texts.sort(function (a, b) { return b.length - a.length; })[0];
          var p = parseLine(longest);
          if (p && !p.cantidadDetectada) { p.cantidad = toNumber(nums[nums.length - 1]) || 1; p.cantidadDetectada = true; }
          return p;
        }
        return parseLine(r.join(' '));
      }).filter(Boolean);
    }

    var out = [];
    rows.slice(hIdx + 1).forEach(function (r) {
      var desc = r[cols.desc] || '';
      if (!desc || !/[a-z]{2,}/i.test(desc)) return;
      if (/^(total|subtotal|iva|observaciones)\b/i.test(desc)) return;
      var qty = cols.qty >= 0 ? toNumber(r[cols.qty]) : null;
      var item = parseLine(desc) || { texto: desc, cantidad: 1, unidad: '' };
      if (qty != null) { item.cantidad = qty; item.cantidadDetectada = true; }
      if (cols.unit >= 0 && r[cols.unit]) item.unidad = r[cols.unit];
      if (cols.code >= 0 && r[cols.code]) item.codigoCliente = r[cols.code];
      out.push(item);
    });
    return out;
  }

  // ---------- Lectores de archivo (solo navegador) ----------

  function readAsArrayBuffer(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = rej;
      fr.readAsArrayBuffer(file);
    });
  }
  function readAsDataURL(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }

  async function fromExcel(file) {
    var wb = XLSX.read(await readAsArrayBuffer(file), { type: 'array' });
    var all = [];
    wb.SheetNames.forEach(function (name) {
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
      all = all.concat(parseTable(rows));
    });
    return { items: all, rawText: '' };
  }

  async function fromWord(file) {
    var buf = await readAsArrayBuffer(file);
    var html = (await mammoth.convertToHtml({ arrayBuffer: buf })).value;
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var items = [];
    doc.querySelectorAll('table').forEach(function (t) {
      var rows = Array.from(t.querySelectorAll('tr')).map(function (tr) {
        return Array.from(tr.querySelectorAll('td,th')).map(function (td) { return td.textContent; });
      });
      items = items.concat(parseTable(rows));
      t.remove();
    });
    var text = Array.from(doc.body.querySelectorAll('p,li,h1,h2,h3,h4')).map(function (p) { return p.textContent; }).join('\n');
    items = items.concat(parseText(text));
    return { items: items, rawText: text };
  }

  async function fromPdf(file) {
    var pdf = await pdfjsLib.getDocument({ data: await readAsArrayBuffer(file) }).promise;
    var lines = [];
    for (var p = 1; p <= pdf.numPages; p++) {
      var content = await (await pdf.getPage(p)).getTextContent();
      var rows = {};
      content.items.forEach(function (it) {
        var y = Math.round(it.transform[5] / 3) * 3;
        (rows[y] = rows[y] || []).push({ x: it.transform[4], s: it.str });
      });
      Object.keys(rows).map(Number).sort(function (a, b) { return b - a; }).forEach(function (y) {
        lines.push(rows[y].sort(function (a, b) { return a.x - b.x; }).map(function (r) { return r.s; }).join(' '));
      });
    }
    var text = lines.join('\n');
    if (text.replace(/\s/g, '').length < 20) {
      throw new Error('El PDF parece escaneado (no tiene texto). Conviértalo a imagen o use la lectura con IA.');
    }
    return { items: parseText(text), rawText: text };
  }

  async function fromImage(file, onProgress) {
    var worker = await Tesseract.createWorker('spa', 1, {
      logger: function (m) { if (onProgress && m.status === 'recognizing text') onProgress(m.progress); }
    });
    try {
      var r = await worker.recognize(file);
      return { items: parseText(r.data.text), rawText: r.data.text };
    } finally {
      await worker.terminate();
    }
  }

  async function fromFile(file, onProgress) {
    var name = file.name.toLowerCase();
    if (/\.(xlsx|xlsm|xls|csv|ods)$/.test(name)) return fromExcel(file);
    if (/\.docx$/.test(name)) return fromWord(file);
    if (/\.pdf$/.test(name)) return fromPdf(file);
    if (/\.(png|jpe?g|webp|bmp|gif)$/.test(name) || /^image\//.test(file.type)) return fromImage(file, onProgress);
    if (/\.(txt|text)$/.test(name) || file.type === 'text/plain') {
      var t = await file.text();
      return { items: parseText(t), rawText: t };
    }
    if (/\.doc$/.test(name)) throw new Error('Formato .doc antiguo: guárdelo como .docx o PDF desde Word.');
    throw new Error('Formato no soportado: ' + file.name);
  }

  var api = {
    parseLine: parseLine, parseText: parseText, parseTable: parseTable, toNumber: toNumber,
    fromFile: fromFile, readAsDataURL: readAsDataURL, readAsArrayBuffer: readAsArrayBuffer
  };
  root.Parsers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
