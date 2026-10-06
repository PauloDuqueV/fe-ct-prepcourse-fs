/* Interfaz del cotizador. */
(function () {
  'use strict';

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.from((el || document).querySelectorAll(s)); };
  var E = Exporters;

  var settings = Store.settings();
  var products = Store.products();
  var clients = Store.clients();
  var aliases = Store.aliases();
  var index = Matcher.buildIndex(products);
  var productByCode = new Map();
  var brands = new Set(), eqRules = [], packRules = [];
  var quote = null;

  var CONF_HIGH = 0.7, CONF_MIN = 0.4;

  // ---------- utilidades ----------
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function clampFactor(v) {
    var n = parseFloat(String(v).replace(',', '.'));
    if (isNaN(n)) return null;
    return Math.min(1, Math.max(0.01, Math.round(n * 100) / 100));
  }
  function pct(n) { return (Math.round(n * 1000) / 10).toLocaleString('es-CO') + '%'; }
  function toast(msg, isError) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.className = 'toast'; }, isError ? 6000 : 3000);
  }
  function debounce(fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); }; }
  function sameName(a, b) { return Matcher.normalize(a) === Matcher.normalize(b); }

  // ---------- catálogo e índices ----------
  function reindex() {
    index = Matcher.buildIndex(products);
    productByCode = new Map(products.map(function (p) { return [String(p.codigo).trim().toUpperCase(), p]; }));
    brands = Rules.brandSet(products);
    eqRules = Rules.parseEquivalences(settings.equivalencias);
    packRules = Rules.parsePacks(settings.presentaciones);
    $$('.catalog-empty').forEach(function (el) { el.classList.toggle('hidden', products.length > 0); });
    $('#cat-status').textContent = products.length ? products.length + ' productos en el catálogo' : '';
    var dl = $('#dl-productos');
    dl.innerHTML = products.map(function (p) { return '<option value="' + esc(p.codigo + ' — ' + p.descripcion) + '">'; }).join('');
  }
  function findProduct(code) { return productByCode.get(String(code || '').trim().toUpperCase()); }

  function findClient(name) {
    if (!name) return null;
    return clients.find(function (c) { return sameName(c.nombre, name); }) || null;
  }

  function refreshClientList() {
    $('#dl-clientes').innerHTML = clients.map(function (c) { return '<option value="' + esc(c.nombre) + '">'; }).join('');
  }

  function globalFactor() { return clampFactor($('#g-factor').value) || settings.factorDefault; }

  /** Prioridad: precio recordado del producto → categoría → general del cliente → factor global. */
  function resolveFactor(p) {
    var c = findClient(quote.cliente.nombre);
    if (c && p) {
      if (c.precios && c.precios[p.codigo] != null) return { f: c.precios[p.codigo], src: 'recordado para este cliente' };
      if (c.factoresCategoria && p.categoria && c.factoresCategoria[p.categoria] != null) return { f: c.factoresCategoria[p.categoria], src: 'categoría ' + p.categoria };
      if (c.factorDefault) return { f: c.factorDefault, src: 'general del cliente' };
    }
    return { f: globalFactor(), src: 'global' };
  }

  // ---------- cotización ----------
  function newQuote() {
    return {
      id: uid(), numero: null, fecha: new Date().toISOString(),
      cliente: { nombre: '', nit: '', ciudad: '', contacto: '', telefono: '', email: '' },
      items: [],
      redondeo: settings.redondeo,
      condicionesPago: settings.condicionesPago, tiempoEntrega: settings.tiempoEntrega,
      validezDias: settings.validezDias, observaciones: settings.notas,
      estado: 'borrador', aprobadoPor: '', aprobadoCargo: '', fechaAprobacion: null,
      elaboradoPor: settings.firmaNombre
    };
  }

  function newItem(req) {
    return {
      id: uid(), solicitado: req ? req.texto : '', cantidad: req ? req.cantidad : 1, unidadSolicitada: req ? req.unidad : '',
      nota: req && req.nota ? String(req.nota) : '', cantidadOriginal: req ? req.cantidad : 1, qtyManual: false,
      marcaPedida: '', presentacion: '',
      codigo: '', descripcion: '', unidad: '', marca: '', categoria: '', costo: 0, iva: 0,
      factor: globalFactor(), factorSrc: 'global', factorManual: false,
      confianza: 0, alternativas: [], incluir: false
    };
  }

  function assignProduct(it, p, conf) {
    if (!p) {
      it.codigo = ''; it.descripcion = ''; it.unidad = ''; it.marca = ''; it.categoria = ''; it.costo = 0; it.incluir = false;
      return;
    }
    it.codigo = p.codigo; it.descripcion = p.descripcion; it.unidad = p.unidad || ''; it.marca = p.marca || '';
    it.categoria = p.categoria || ''; it.costo = Number(p.costo) || 0;
    it.iva = p.iva != null && p.iva !== '' ? Number(p.iva) : 0; // producto sin IVA registrado = 0 %
    if (conf != null) it.confianza = conf;
    if (!it.factorManual) { var r = resolveFactor(p); it.factor = r.f; it.factorSrc = r.src; }
    it.incluir = true;
    // Reglas comerciales: marca distinta (naranja claro) y presentación ajustada (azul claro)
    it.marcaPedida = ''; it.presentacion = '';
    if (it.solicitado) {
      var req = { texto: it.solicitado, cantidad: it.cantidadOriginal != null ? it.cantidadOriginal : it.cantidad, unidad: it.unidadSolicitada, nota: it.nota };
      var adj = Rules.adjustQuantity(req, p, packRules);
      it.presentacion = adj.presentacion || '';
      if (!it.qtyManual) it.cantidad = adj.cantidad;
      it.marcaPedida = Rules.brandMismatch(req, p, brands) || '';
    }
  }

  /** Busca el producto para una línea. Devuelve false si la línea parece un título o saludo. */
  function matchItem(it, r) {
      var m = Matcher.match(Rules.applyEquivalences(r.texto, eqRules), index, { aliases: aliases, limit: 5 });
      // Entre candidatos casi empatados, la presentación más cercana a la pedida va primero
      var k = m[0] && m[0].reason !== 'alias' ? Rules.nearestPresentation(r.texto, m) : 0;
      if (k > 0) { var pick = m.splice(k, 1)[0]; pick.score = Math.max(pick.score, m[0].score); m.unshift(pick); }
      // Sin producto parecido y sin cantidad: casi siempre es un título o saludo ("Pedido laboratorio")
      if (products.length && (!m[0] || m[0].score < CONF_MIN) && !r.cantidadDetectada) return false;
      it.alternativas = m.map(function (x) { return { codigo: x.product.codigo, score: x.score }; });
      if (m[0] && m[0].score >= CONF_MIN) {
        var conf = m[0].score;
        // Dos candidatos casi empatados: pedir revisión
        if (m[0].reason !== 'alias' && m[1] && m[0].score - m[1].score < 0.05) conf = Math.min(conf, 0.6);
        assignProduct(it, m[0].product, conf);
      } else { assignProduct(it, null); it.confianza = m[0] ? m[0].score : 0; }
      return true;
  }

  function matchRequests(reqs, origen) {
    if (!products.length) {
      toast('Su catálogo está vacío: no hay con qué homologar. Vaya a la pestaña Catálogo e importe su lista de precios.', true);
    }
    // Si se procesa otra vez la misma solicitud, se reemplazan sus líneas en vez de duplicarlas
    if (origen && quote.items.some(function (i) { return i.origen === origen; })) {
      quote.items = quote.items.filter(function (i) { return i.origen !== origen; });
      toast('Esta solicitud ya estaba cargada: se reemplazaron sus líneas.');
    }
    var added = 0, skipped = 0;
    reqs.forEach(function (r) {
      var it = newItem(r);
      it.origen = origen || '';
      if (!matchItem(it, r)) { skipped++; return; }
      quote.items.push(it);
      added++;
    });
    touched();
    renderItems();
    var ok = reqs.length ? quote.items.slice(-added).filter(function (i) { return i.confianza >= CONF_HIGH && i.codigo; }).length : 0;
    toast(added + ' productos leídos · ' + ok + ' con coincidencia alta' + (skipped ? ' · ' + skipped + ' líneas ignoradas (títulos/saludos)' : '') + '. Revise las marcadas en naranja o rojo.');
  }

  // ---------- render de ítems ----------
  function confClass(it) {
    if (!it.codigo) return 'low';
    return it.confianza >= CONF_HIGH ? 'high' : it.confianza >= CONF_MIN ? 'mid' : 'low';
  }

  function renderItems() {
    var body = $('#items-body');
    body.innerHTML = '';
    quote.items.forEach(function (it, i) {
      var tr = document.createElement('tr');
      tr.dataset.id = it.id;
      if (it.codigo && it.marcaPedida) tr.classList.add('warn-brand');
      if (it.codigo && it.presentacion) tr.classList.add('warn-pres');
      var flags = it.codigo ? [
        it.marcaPedida ? '<div class="flag brand">Marca pedida: ' + esc(it.marcaPedida) + ' · se ofrece la disponible' + (it.marca ? ' (' + esc(it.marca) + ')' : '') + '</div>' : '',
        it.presentacion ? '<div class="flag pres">Presentación: ' + esc(it.presentacion) + '</div>' : ''
      ].join('') : '';
      var alts = (it.alternativas || []).filter(function (a) { return a.codigo !== it.codigo; }).slice(0, 3)
        .map(function (a) {
          var p = findProduct(a.codigo);
          return p ? '<button class="alt" data-code="' + esc(a.codigo) + '" title="' + esc(p.descripcion) + '">' + esc(a.codigo) + ' · ' + Math.round(a.score * 100) + '%</button>' : '';
        }).join('');
      tr.innerHTML =
        '<td><input type="checkbox" class="inc"' + (it.incluir ? ' checked' : '') + '></td>' +
        '<td>' + (i + 1) + ' <span class="conf ' + confClass(it) + '" title="Confianza ' + Math.round((it.confianza || 0) * 100) + '%">●</span></td>' +
        '<td class="req-text">' + (it.solicitado ? '<span class="req-qty">' + esc(it.cantidadOriginal != null ? it.cantidadOriginal : it.cantidad) + ' ' + esc(it.unidadSolicitada || '') + '</span> ' + esc(it.solicitado) : '<span class="muted">(agregado manualmente)</span>') +
          (it.nota ? '<div class="req-note" title="Requisito / marca indicada por el cliente">Pide: ' + esc(it.nota) + '</div>' : '') + '</td>' +
        '<td><input class="prod" list="dl-productos" placeholder="Buscar producto por código o nombre…" value="' + esc(it.codigo ? it.codigo + ' — ' + it.descripcion : '') + '">' +
          '<div class="prod-meta">' + esc([it.unidad, it.marca, it.categoria].filter(Boolean).join(' · ')) + '</div>' + flags +
          (!it.codigo && it.solicitado ? '<button class="small reg-btn" title="Crear este producto en el catálogo y cotizarlo">+ Registrar producto</button>' : '') +
          (alts ? '<div class="alts"><span class="muted" style="font-size:11px">¿Otro?</span>' + alts + '</div>' : '') + '</td>' +
        '<td><input class="qty" type="number" min="0" step="any" value="' + esc(it.cantidad) + '"></td>' +
        '<td><input class="cost" type="number" min="0" step="any" value="' + esc(it.costo) + '"></td>' +
        '<td><input class="factor" type="number" min="0.01" max="1" step="0.01" list="dl-factores" value="' + esc(it.factor) + '"><div class="margin-note"></div></td>' +
        '<td class="num c-precio"></td>' +
        '<td><input class="iva" type="number" min="0" max="100" value="' + esc(it.iva) + '"></td>' +
        '<td class="num c-total"></td>' +
        '<td>' + (it.codigo && it.confianza < CONF_HIGH ? '<button class="small ok-btn" title="Confirmar que este producto es el correcto">✓</button> ' : '') +
        '<button class="icon del" title="Quitar línea">✕</button></td>';
      body.appendChild(tr);
      updateRow(tr, it);
    });
    $('#empty-items').classList.toggle('hidden', quote.items.length > 0);
    renderTotals();
  }

  function updateRow(tr, it) {
    var c = E.lineCalc(it, quote.redondeo);
    $('.c-precio', tr).textContent = it.codigo ? E.money(c.precio) : '—';
    $('.c-total', tr).textContent = it.codigo ? E.money(c.total) : '—';
    $('.margin-note', tr).textContent = 'margen ' + pct(1 - it.factor) + (it.factorManual ? ' (manual)' : it.factorSrc && it.factorSrc !== 'global' ? ' (' + it.factorSrc + ')' : '');
    $('.margin-note', tr).title = it.factorSrc || '';
    tr.classList.toggle('off', !(it.incluir && it.codigo));
  }

  function renderTotals() {
    var t = E.totals(quote);
    $('#t-costo').textContent = E.money(t.costo);
    $('#t-util').textContent = E.money(t.utilidad);
    $('#t-margen').textContent = pct(t.margen);
    $('#t-subtotal').textContent = E.money(t.subtotal);
    $('#t-iva').textContent = E.money(t.iva);
    $('#t-total').textContent = E.money(t.total);
  }

  function itemFromEvent(e) {
    var tr = e.target.closest('tr');
    if (!tr) return {};
    return { tr: tr, it: quote.items.find(function (x) { return x.id === tr.dataset.id; }) };
  }

  function bindItems() {
    var body = $('#items-body');
    body.addEventListener('input', function (e) {
      var r = itemFromEvent(e), it = r.it;
      if (!it) return;
      var t = e.target;
      if (t.classList.contains('qty')) { it.cantidad = parseFloat(t.value) || 0; it.qtyManual = true; }
      else if (t.classList.contains('cost')) it.costo = parseFloat(t.value) || 0;
      else if (t.classList.contains('iva')) it.iva = parseFloat(t.value) || 0;
      else if (t.classList.contains('factor')) {
        var f = clampFactor(t.value);
        if (f == null) return;
        it.factor = f; it.factorManual = true; it.factorSrc = 'manual';
      } else return;
      updateRow(r.tr, it); renderTotals(); touched();
    });
    body.addEventListener('change', function (e) {
      var r = itemFromEvent(e), it = r.it;
      if (!it) return;
      var t = e.target;
      if (t.classList.contains('factor')) { var f = clampFactor(t.value); t.value = f || it.factor; }
      if (t.classList.contains('inc')) { it.incluir = t.checked; updateRow(r.tr, it); renderTotals(); touched(); }
      if (t.classList.contains('prod')) {
        var v = t.value.trim();
        if (!v) { assignProduct(it, null); it.confianza = 0; renderItems(); touched(); return; }
        var p = findProduct(v.split(' — ')[0]);
        if (!p) {
          var m = Matcher.match(v, index, { limit: 1 });
          p = m[0] && m[0].product;
        }
        if (!p) { toast('No se encontró ese producto en el catálogo.', true); return; }
        assignProduct(it, p, 1);
        renderItems(); touched();
      }
    });
    body.addEventListener('click', function (e) {
      var r = itemFromEvent(e), it = r.it;
      if (!it) return;
      if (e.target.classList.contains('reg-btn')) {
        openProductDialog(it);
      } else if (e.target.classList.contains('ok-btn')) {
        it.confianza = 1; renderItems(); touched();
      } else if (e.target.classList.contains('del')) {
        quote.items = quote.items.filter(function (x) { return x !== it; });
        renderItems(); touched();
      } else if (e.target.classList.contains('alt')) {
        assignProduct(it, findProduct(e.target.dataset.code), 1);
        renderItems(); touched();
      }
    });
    $('#chk-all').addEventListener('change', function (e) {
      quote.items.forEach(function (it) { if (it.codigo) it.incluir = e.target.checked; });
      renderItems(); touched();
    });
  }

  // ---------- cliente ----------
  var CLIENT_FIELDS = ['nombre', 'nit', 'ciudad', 'contacto', 'telefono', 'email'];
  function clientToForm() { CLIENT_FIELDS.forEach(function (f) { $('#c-' + f).value = quote.cliente[f] || ''; }); clientHint(); }

  function clientHint() {
    var c = findClient(quote.cliente.nombre);
    var h = $('#client-hint');
    if (!quote.cliente.nombre) h.textContent = 'El nombre del cliente es obligatorio y aparece en el Excel y el PDF.';
    else if (c) {
      var n = Object.keys(c.precios || {}).length;
      h.textContent = 'Cliente registrado · factor general: ' + (c.factorDefault || 'global') +
        ' · ' + Object.keys(c.factoresCategoria || {}).length + ' factores por categoría · ' + n + ' precios recordados.';
    } else h.textContent = 'Cliente nuevo: se registrará al guardar la cotización.';
  }

  function bindClient() {
    CLIENT_FIELDS.forEach(function (f) {
      $('#c-' + f).addEventListener('input', function (e) { quote.cliente[f] = e.target.value; touched(); if (f === 'nombre') clientHint(); });
    });
    $('#c-nombre').addEventListener('change', function () {
      var c = findClient(quote.cliente.nombre);
      if (c) {
        CLIENT_FIELDS.forEach(function (f) { if (c[f] && !quote.cliente[f] || f === 'nombre') quote.cliente[f] = c[f] || quote.cliente[f]; });
        clientToForm();
        if (c.factorDefault) setGlobalFactor(c.factorDefault, true);
      }
      // recalcula factores no manuales según el cliente
      quote.items.forEach(function (it) {
        if (it.codigo && !it.factorManual) { var r = resolveFactor(findProduct(it.codigo) || it); it.factor = r.f; it.factorSrc = r.src; }
      });
      renderItems(); touched();
    });
  }

  // ---------- factor global ----------
  function setGlobalFactor(v, silent) {
    var f = clampFactor(v);
    if (f == null) return;
    $('#g-factor').value = f.toFixed(2);
    $('#g-factor-range').value = f;
    $('#g-margin').textContent = 'margen ' + pct(1 - f) + ' · ej.: costo $100.000 → ' + E.money(E.precioVenta(100000, f, quote ? quote.redondeo : 0));
    if (!silent) touched();
  }

  function applyFactor(onlyChecked) {
    var f = globalFactor();
    var n = 0;
    $$('#items-body tr').forEach(function (tr) {
      var it = quote.items.find(function (x) { return x.id === tr.dataset.id; });
      if (!it || (onlyChecked && !$('.inc', tr).checked)) return;
      it.factor = f; it.factorManual = true; it.factorSrc = 'manual'; n++;
    });
    renderItems(); touched();
    toast('Factor ' + f.toFixed(2) + ' aplicado a ' + n + ' líneas.');
  }

  // ---------- entrada de solicitudes ----------
  function progress(p, label) {
    var box = $('#progress');
    if (p == null) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    $('.bar', box).style.width = Math.round(p * 100) + '%';
    $('.label', box).textContent = label || '';
  }

  function useAI() { return $('#use-ai').checked && !!settings.apiKey; }

  async function downscaleImage(file, max) {
    var url = await Parsers.readAsDataURL(file);
    var img = await new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = url; });
    var scale = Math.min(1, max / Math.max(img.width, img.height));
    if (scale === 1 && file.size < 3.5e6 && /image\/(png|jpeg|webp|gif)/.test(file.type)) return url;
    var cv = document.createElement('canvas');
    cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.88);
  }

  async function processFiles(files) {
    for (var k = 0; k < files.length; k++) {
      var file = files[k];
      var isImg = /^image\//.test(file.type) || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name);
      var isPdf = /\.pdf$/i.test(file.name);
      try {
        progress(0.05, 'Leyendo ' + file.name + '…');
        var res;
        if (useAI() && (isImg || isPdf)) {
          progress(0.3, 'La IA está leyendo ' + file.name + '…');
          var dataUrl = isImg ? await downscaleImage(file, 2000) : await Parsers.readAsDataURL(file);
          res = { items: await AI.extractItems({ dataUrl: dataUrl }), rawText: '' };
        } else {
          res = await Parsers.fromFile(file, function (p) { progress(p, 'Reconociendo texto (OCR) de ' + file.name + '… ' + Math.round(p * 100) + '%'); });
        }
        autoClient(res.rawText);
        if (res.rawText) { $('#raw-text').value = res.rawText; $('#raw-box').classList.remove('hidden'); if (isImg) $('#raw-box').open = true; }
        if (res.ocrDudoso) {
          toast('La imagen ' + file.name + ' no se pudo leer bien (foto borrosa, muy pequeña o letra a mano). ' +
            'Corrija el texto leído y pulse "Volver a procesar", o active "Leer con IA".', true);
          $('#raw-box').open = true;
        }
        if (!res.items.length && !res.ocrDudoso) toast('No se encontraron productos en ' + file.name + '. Revise el texto leído.', true);
        else matchRequests(res.items, 'file:' + file.name + ':' + file.size);
      } catch (err) {
        console.error(err);
        toast(file.name + ': ' + (err.message || err), true);
      }
    }
    progress(null);
  }

  /** Si el mensaje dice "COTIZAR A CELSALUD ISTMINA" y aún no hay cliente, lo llena. */
  function autoClient(text) {
    if (quote.cliente.nombre || !text) return;
    var name = Parsers.detectClient(text);
    if (!name) return;
    var known = findClient(name);
    quote.cliente.nombre = known ? known.nombre : name;
    $('#c-nombre').value = quote.cliente.nombre;
    $('#c-nombre').dispatchEvent(new Event('change'));
    toast('Cliente detectado en la solicitud: ' + quote.cliente.nombre + '. Verifique el nombre.');
  }

  function textKey(text) {
    var t = Matcher.normalize(text), h = 0;
    for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
    return 'txt' + h;
  }

  /** Vuelve a homologar las líneas que nadie ha confirmado (útil después de importar el catálogo). */
  function rematchAll() {
    if (!products.length) { toast('Primero importe su catálogo en la pestaña Catálogo.', true); return; }
    var n = 0;
    quote.items.forEach(function (it) {
      if (!it.solicitado || (it.codigo && it.confianza >= 1)) return;
      matchItem(it, { texto: it.solicitado, cantidad: it.cantidadOriginal, unidad: it.unidadSolicitada, nota: it.nota, cantidadDetectada: true });
      n++;
    });
    renderItems(); touched();
    toast(n + ' líneas homologadas de nuevo con el catálogo actual.');
  }

  async function processText(text) {
    if (!text.trim()) { toast('Pegue primero el texto de la solicitud.', true); return; }
    autoClient(text);
    try {
      if (useAI()) {
        progress(0.4, 'La IA está interpretando el mensaje…');
        matchRequests(await AI.extractItems({ text: text }));
      } else {
        var items = Parsers.parseText(text);
        if (!items.length) toast('No se reconocieron productos en el texto.', true);
        else matchRequests(items, textKey(text));
      }
    } catch (err) {
      console.error(err);
      toast('IA: ' + (err.message || err) + ' — se usará la lectura local.', true);
      matchRequests(Parsers.parseText(text));
    }
    progress(null);
  }

  async function aiPick() {
    if (!settings.apiKey) { toast('Configure la API key de Anthropic en Configuración.', true); return; }
    var lines = [];
    quote.items.forEach(function (it, i) {
      if (!it.solicitado || (it.codigo && it.confianza >= CONF_HIGH)) return;
      var m = Matcher.match(it.solicitado, index, { aliases: aliases, limit: 8 });
      if (m.length) lines.push({ linea: i + 1, item: it, texto: it.cantidad + ' ' + (it.unidadSolicitada || '') + ' ' + it.solicitado,
        candidatos: m.map(function (x) { return { codigo: x.product.codigo, descripcion: x.product.descripcion, unidad: x.product.unidad }; }) });
    });
    if (!lines.length) { toast('No hay líneas dudosas para revisar.'); return; }
    try {
      progress(0.5, 'La IA está revisando ' + lines.length + ' líneas dudosas…');
      var picks = await AI.pickCandidates(lines.map(function (l) { return { linea: l.linea, texto: l.texto, candidatos: l.candidatos }; }));
      var n = 0;
      lines.forEach(function (l) {
        var code = picks[l.linea];
        if (code && findProduct(code)) { assignProduct(l.item, findProduct(code), 0.9); n++; }
      });
      renderItems(); touched();
      toast('La IA homologó ' + n + ' de ' + lines.length + ' líneas dudosas. Verifique antes de enviar.');
    } catch (err) {
      console.error(err);
      toast('IA: ' + (err.message || err), true);
    }
    progress(null);
  }

  function bindInput() {
    var dz = $('#dropzone'), fi = $('#file-input');
    dz.addEventListener('click', function () { fi.click(); });
    dz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') fi.click(); });
    fi.addEventListener('change', function () { processFiles(Array.from(fi.files)); fi.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); }); });
    dz.addEventListener('drop', function (e) { processFiles(Array.from(e.dataTransfer.files)); });
    document.addEventListener('paste', function (e) {
      if (!$('#tab-cotizar').classList.contains('active')) return;
      var files = Array.from(e.clipboardData.files || []).filter(function (f) { return /^image\//.test(f.type); });
      if (files.length) {
        e.preventDefault();
        processFiles(files.map(function (f, i) { return new File([f], 'captura-' + (i + 1) + '.png', { type: f.type }); }));
      }
    });
    $('#btn-process-text').addEventListener('click', function () { processText($('#req-text').value); });
    $('#btn-clear-req').addEventListener('click', function () { $('#req-text').value = ''; $('#raw-text').value = ''; $('#raw-box').classList.add('hidden'); });
    $('#btn-reprocess').addEventListener('click', function () { processText($('#raw-text').value); });
    $('#btn-ai-pick').addEventListener('click', aiPick);
    $('#btn-rematch').addEventListener('click', rematchAll);
    $$('.go-catalog').forEach(function (b) { b.addEventListener('click', function () { showTab('catalogo'); }); });
    $('#btn-add-row').addEventListener('click', function () {
      var it = newItem(null);
      quote.items.push(it); renderItems(); touched();
      var tr = $('#items-body tr:last-child'); if (tr) $('.prod', tr).focus();
    });
  }

  // ---------- guardar / exportar / aprobar ----------
  function formToQuote() {
    quote.condicionesPago = $('#q-pago').value;
    quote.tiempoEntrega = $('#q-entrega').value;
    quote.validezDias = parseInt($('#q-validez').value, 10) || settings.validezDias;
    quote.observaciones = $('#q-obs').value;
    quote.redondeo = Number($('#redondeo').value);
  }
  function quoteToForm() {
    $('#q-pago').value = quote.condicionesPago || '';
    $('#q-entrega').value = quote.tiempoEntrega || '';
    $('#q-validez').value = quote.validezDias || '';
    $('#q-obs').value = quote.observaciones || '';
    $('#redondeo').value = String(quote.redondeo != null ? quote.redondeo : settings.redondeo);
    clientToForm();
    renderEstado();
    renderItems();
    setGlobalFactor($('#g-factor').value, true);
  }

  function renderEstado() {
    var b = $('#q-estado');
    var ok = quote.estado === 'aprobada';
    b.className = 'badge' + (ok ? ' ok' : '');
    b.textContent = ok ? 'Aprobada por ' + quote.aprobadoPor + ' · ' + E.fecha(quote.fechaAprobacion) : 'Borrador';
    $('#quote-number').textContent = quote.numero ? '· ' + quote.numero : '· (sin número aún)';
  }

  var saveDraft = debounce(function () { Store.saveDraft(quote); }, 400);
  function touched() {
    if (quote.estado === 'aprobada') {
      quote.estado = 'borrador'; quote.aprobadoPor = ''; quote.fechaAprobacion = null;
      renderEstado();
      toast('Se modificó una cotización aprobada: vuelve a estado borrador.');
    }
    saveDraft();
  }

  function validate() {
    formToQuote();
    if (!quote.cliente.nombre.trim()) { toast('Escriba el nombre del cliente.', true); $('#c-nombre').focus(); return false; }
    var inc = quote.items.filter(function (i) { return i.incluir && i.codigo; });
    if (!inc.length) { toast('No hay productos marcados para cotizar.', true); return false; }
    var bad = inc.filter(function (i) { return !(i.factor > 0 && i.factor <= 1); });
    if (bad.length) { toast('Hay factores fuera del rango 0,01 – 1,00.', true); return false; }
    var pend = inc.filter(function (i) { return i.confianza < CONF_HIGH; });
    if (pend.length && !confirm('Hay ' + pend.length + ' líneas en naranja sin confirmar (por ejemplo: "' + (pend[0].solicitado || pend[0].descripcion) +
        '").\n\nRevíselas y pulse ✓ en cada una, o acepte para continuar de todas formas.')) return false;
    var zero = inc.filter(function (i) { return !(i.costo > 0); });
    if (zero.length) toast('Atención: ' + zero.length + ' productos tienen costo 0.', true);
    return true;
  }

  function saveQuote(silent) {
    if (!validate()) return false;
    if (!quote.numero) {
      quote.numero = (settings.prefijo || '') + String(settings.consecutivo).padStart(4, '0');
      settings.consecutivo = Number(settings.consecutivo) + 1;
      Store.saveSettings(settings);
    }
    // Registrar / actualizar cliente y recordar sus factores por producto
    var c = findClient(quote.cliente.nombre);
    if (!c) { c = { id: uid(), nombre: quote.cliente.nombre.trim(), factorDefault: null, factoresCategoria: {}, precios: {} }; clients.push(c); }
    CLIENT_FIELDS.forEach(function (f) { if (quote.cliente[f]) c[f] = quote.cliente[f]; });
    c.precios = c.precios || {};
    quote.items.forEach(function (it) {
      if (it.incluir && it.codigo) {
        c.precios[it.codigo] = it.factor;
        // aprende la homologación solo si fue confirmada (verde o ✓), para no memorizar errores
        if (it.solicitado && it.confianza >= CONF_HIGH) aliases[Matcher.normalize(it.solicitado)] = it.codigo;
      }
    });
    Store.saveClients(clients); Store.saveAliases(aliases); refreshClientList();

    var quotes = Store.quotes();
    var i = quotes.findIndex(function (q) { return q.id === quote.id; });
    var copy = clone(quote);
    if (i >= 0) quotes[i] = copy; else quotes.unshift(copy);
    Store.saveQuotes(quotes);
    Store.saveDraft(quote);
    renderEstado(); clientHint();
    if (!silent) toast('Cotización ' + quote.numero + ' guardada.');
    return true;
  }

  function bindActions() {
    ['#q-pago', '#q-entrega', '#q-validez', '#q-obs'].forEach(function (s) { $(s).addEventListener('input', function () { formToQuote(); touched(); }); });
    $('#redondeo').addEventListener('change', function () { formToQuote(); renderItems(); setGlobalFactor($('#g-factor').value, true); touched(); });
    $('#g-factor-range').addEventListener('input', function (e) { setGlobalFactor(e.target.value, true); });
    $('#g-factor').addEventListener('change', function (e) { setGlobalFactor(e.target.value, true); });
    $('#btn-apply-all').addEventListener('click', function () { applyFactor(false); });
    $('#btn-apply-sel').addEventListener('click', function () { applyFactor(true); });

    $('#btn-save').addEventListener('click', function () { saveQuote(); });
    $('#btn-excel').addEventListener('click', async function () {
      if (!saveQuote(true)) return;
      try { await E.toExcel(quote, settings); toast('Excel generado (' + quote.numero + ').'); } catch (e) { console.error(e); toast('Error al generar Excel: ' + e.message, true); }
    });
    $('#btn-pdf').addEventListener('click', function () {
      if (!saveQuote(true)) return;
      try { E.toPdf(quote, settings); toast(quote.estado === 'aprobada' ? 'PDF aprobado generado.' : 'PDF borrador generado. Apruebe la cotización para el PDF final.'); } catch (e) { console.error(e); toast('Error al generar PDF: ' + e.message, true); }
    });
    $('#btn-approve').addEventListener('click', function () {
      if (!validate()) return;
      $('#ap-nombre').value = quote.aprobadoPor || '';
      $('#ap-cargo').value = quote.aprobadoCargo || '';
      $('#dlg-approve').showModal();
    });
    $('#dlg-approve').addEventListener('close', function () {
      if ($('#dlg-approve').returnValue !== 'ok') return;
      var name = $('#ap-nombre').value.trim();
      if (!name) return;
      saveQuote(true);
      quote.estado = 'aprobada'; quote.aprobadoPor = name; quote.aprobadoCargo = $('#ap-cargo').value.trim();
      quote.fechaAprobacion = new Date().toISOString();
      saveQuote(true);
      renderEstado();
      E.toPdf(quote, settings);
      toast('Cotización ' + quote.numero + ' aprobada.');
    });
    $('#btn-new').addEventListener('click', function () {
      if (quote.items.length && !confirm('¿Empezar una cotización nueva? Lo no guardado de la actual se perderá.')) return;
      quote = newQuote(); setGlobalFactor(settings.factorDefault, true); quoteToForm(); Store.saveDraft(quote);
      $('#req-text').value = ''; $('#raw-box').classList.add('hidden');
    });
  }

  // ---------- historial ----------
  function renderHistory() {
    var q = Matcher.normalize($('#h-search').value);
    var rows = Store.quotes().filter(function (x) { return !q || Matcher.normalize(x.numero + ' ' + x.cliente.nombre).indexOf(q) >= 0; });
    $('#h-body').innerHTML = rows.map(function (x) {
      var t = E.totals(x);
      return '<tr data-id="' + esc(x.id) + '"><td><b>' + esc(x.numero) + '</b></td><td>' + esc(E.fecha(x.fecha)) + '</td><td>' + esc(x.cliente.nombre) +
        '</td><td>' + x.items.filter(function (i) { return i.incluir && i.codigo; }).length + '</td><td class="num">' + E.money(t.total) + '</td><td>' +
        (x.estado === 'aprobada' ? '<span class="badge ok">Aprobada</span>' : '<span class="badge">Borrador</span>') + '</td><td>' +
        '<button class="small ghost" data-act="open">Abrir</button> <button class="small ghost" data-act="dup">Duplicar</button> ' +
        '<button class="small ghost" data-act="xlsx">Excel</button> <button class="small ghost" data-act="pdf">PDF</button> ' +
        '<button class="icon" data-act="del" title="Eliminar">✕</button></td></tr>';
    }).join('') || '<tr><td colspan="7" class="empty">No hay cotizaciones guardadas.</td></tr>';
  }
  function bindHistory() {
    $('#h-search').addEventListener('input', renderHistory);
    $('#h-body').addEventListener('click', function (e) {
      var act = e.target.dataset.act; if (!act) return;
      var id = e.target.closest('tr').dataset.id;
      var quotes = Store.quotes();
      var q = quotes.find(function (x) { return x.id === id; });
      if (!q) return;
      if (act === 'open' || act === 'dup') {
        quote = clone(q);
        if (act === 'dup') {
          quote.id = uid(); quote.numero = null; quote.fecha = new Date().toISOString();
          quote.estado = 'borrador'; quote.aprobadoPor = ''; quote.fechaAprobacion = null;
        }
        quoteToForm(); Store.saveDraft(quote); showTab('cotizar');
      } else if (act === 'xlsx') E.toExcel(q, settings);
      else if (act === 'pdf') E.toPdf(q, settings);
      else if (act === 'del' && confirm('¿Eliminar la cotización ' + q.numero + '?')) {
        Store.saveQuotes(quotes.filter(function (x) { return x.id !== id; })); renderHistory();
      }
    });
  }

  // ---------- catálogo ----------
  async function importCatalog() {
    var f = $('#cat-file').files[0];
    if (!f) { toast('Seleccione un archivo de Excel o CSV.', true); return; }
    var wb = XLSX.read(await Parsers.readAsArrayBuffer(f), { type: 'array' });
    var ivaTxt = $('#cat-iva').value.trim();
    var opts = { proveedor: $('#cat-prov').value.trim(), categoria: $('#cat-cat').value.trim(),
      ivaDefault: ivaTxt === '' ? 0 : Number(ivaTxt) }; // si el archivo no trae IVA, el producto no tiene IVA
    var incoming = [], resumen = [];
    wb.SheetNames.forEach(function (sn) {
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' });
      var ps = Catalog.parseSheet(rows, Object.assign({ hoja: sn }, opts));
      if (ps.length) resumen.push(sn + ': ' + ps.length);
      incoming = incoming.concat(ps);
    });
    if (!incoming.length) {
      $('#cat-msg').textContent = 'No se encontraron columnas reconocibles. La fila de encabezados debe incluir al menos "Descripción" (o "Insumo") y "Código" o "Costo". Use la plantilla.';
      return;
    }
    var r = Catalog.merge(products, incoming, $('#cat-mode').value);
    products = r.products;
    saveProducts();
    var sinCosto = incoming.filter(function (p) { return !(p.costo > 0); }).length;
    $('#cat-msg').textContent = 'Importación lista (' + resumen.join(' · ') + '): ' + r.added + ' nuevos, ' + r.updated +
      ' actualizados. Total en catálogo: ' + products.length + '.' + (sinCosto ? ' Atención: ' + sinCosto + ' productos sin costo.' : '');
    $('#cat-file').value = '';
    // Si la cotización en curso tenía líneas sin producto, se homologan de nuevo con el catálogo nuevo
    if (quote.items.some(function (i) { return i.solicitado && !i.codigo; })) rematchAll();
  }

  function saveProducts() { Store.saveProducts(products); reindex(); renderCatalog(); }
  var saveProductsSoon = debounce(function () { Store.saveProducts(products); reindex(); }, 600);

  var catPage = 0, PAGE = 50, catRows = [];
  function renderCatalog() {
    var q = Matcher.normalize($('#cat-search').value);
    var cat = $('#cat-filter-cat').value;
    var cats = Array.from(new Set(products.map(function (p) { return p.categoria; }).filter(Boolean))).sort();
    $('#cat-filter-cat').innerHTML = '<option value="">Todas las categorías</option>' + cats.map(function (c) { return '<option' + (c === cat ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    catRows = products.map(function (p, i) { return i; }).filter(function (i) {
      var p = products[i];
      if (cat && p.categoria !== cat) return false;
      return !q || Matcher.normalize([p.codigo, p.descripcion, p.proveedor, p.marca, p.sinonimos].join(' ')).indexOf(q) >= 0;
    });
    var pages = Math.max(1, Math.ceil(catRows.length / PAGE));
    catPage = Math.min(catPage, pages - 1);
    $('#cat-count').textContent = '· ' + products.length + ' en total' + (catRows.length !== products.length ? ', ' + catRows.length + ' filtrados' : '');
    $('#cat-page').textContent = 'Página ' + (catPage + 1) + ' de ' + pages;
    var fields = ['codigo', 'descripcion', 'categoria', 'proveedor', 'unidad', 'marca', 'costo', 'iva', 'sinonimos'];
    $('#cat-body').innerHTML = catRows.slice(catPage * PAGE, catPage * PAGE + PAGE).map(function (i) {
      var p = products[i];
      return '<tr data-i="' + i + '">' + fields.map(function (f) {
        var num = f === 'costo' || f === 'iva';
        return '<td><input data-f="' + f + '"' + (num ? ' type="number" step="any" style="width:' + (f === 'iva' ? 60 : 100) + 'px"' : '') +
          (f === 'descripcion' ? ' style="min-width:280px"' : '') + ' value="' + esc(p[f]) + '"></td>';
      }).join('') + '<td><button class="icon" data-del="1" title="Eliminar">✕</button></td></tr>';
    }).join('') || '<tr><td colspan="10" class="empty">Catálogo vacío. Importe sus listas o cargue el ejemplo.</td></tr>';
  }

  async function catalogTemplate() {
    await E.catalogToExcel([
      { codigo: 'GUA-NIT-M', descripcion: 'Guantes de nitrilo talla M sin polvo caja x 100', categoria: 'Guantes', proveedor: 'Proveedor A', unidad: 'Caja x 100', marca: 'Marca', costo: 18500, iva: 19, sinonimos: 'guante nitrilo mediano' }
    ], 'plantilla_catalogo.xlsx');
  }

  function bindCatalog() {
    $('#btn-cat-import').addEventListener('click', function () { importCatalog().catch(function (e) { console.error(e); toast('Error al importar: ' + e.message, true); }); });
    $('#btn-cat-template').addEventListener('click', catalogTemplate);
    $('#btn-cat-export').addEventListener('click', function () { E.catalogToExcel(products, 'catalogo_' + new Date().toISOString().slice(0, 10) + '.xlsx'); });
    if (Array.isArray(window.SEED_CATALOG) && window.SEED_CATALOG.length) {
      $('#btn-cat-seed').classList.remove('hidden');
      $('#btn-cat-seed').addEventListener('click', function () {
        loadSeedCatalog(true); reindex(); renderCatalog();
        if (quote.items.some(function (i) { return i.solicitado && !i.codigo; })) rematchAll();
      });
    }
    $('#btn-cat-demo').addEventListener('click', function () {
      if (products.length && !confirm('Se agregarán los productos de ejemplo a su catálogo. ¿Continuar?')) return;
      var have = new Set(products.map(function (p) { return p.codigo; }));
      DEMO_PRODUCTS.forEach(function (p) { if (!have.has(p.codigo)) products.push(clone(p)); });
      saveProducts(); toast('Catálogo de ejemplo cargado.');
    });
    $('#btn-cat-clear').addEventListener('click', function () {
      if (!confirm('¿Vaciar TODO el catálogo? Esta acción no se puede deshacer (exporte una copia antes).')) return;
      products = []; saveProducts();
    });
    $('#cat-search').addEventListener('input', debounce(function () { catPage = 0; renderCatalog(); }, 200));
    $('#cat-filter-cat').addEventListener('change', function () { catPage = 0; renderCatalog(); });
    $('#cat-prev').addEventListener('click', function () { if (catPage > 0) { catPage--; renderCatalog(); } });
    $('#cat-next').addEventListener('click', function () { if ((catPage + 1) * PAGE < catRows.length) { catPage++; renderCatalog(); } });
    $('#btn-cat-add').addEventListener('click', function () {
      products.unshift({ codigo: 'NUEVO-' + String(products.length + 1).padStart(4, '0'), descripcion: '', categoria: '', proveedor: '', unidad: '', marca: '', costo: 0, iva: 0, sinonimos: '' });
      $('#cat-search').value = ''; catPage = 0; saveProducts();
      var inp = $('#cat-body tr:first-child input[data-f="descripcion"]'); if (inp) inp.focus();
    });
    $('#cat-body').addEventListener('change', function (e) {
      var tr = e.target.closest('tr'); if (!tr || !e.target.dataset.f) return;
      var p = products[Number(tr.dataset.i)], f = e.target.dataset.f;
      p[f] = (f === 'costo' || f === 'iva') ? (parseFloat(e.target.value) || 0) : e.target.value.trim();
      saveProductsSoon();
    });
    $('#cat-body').addEventListener('click', function (e) {
      if (!e.target.dataset.del) return;
      var i = Number(e.target.closest('tr').dataset.i);
      if (!confirm('¿Eliminar ' + products[i].codigo + '?')) return;
      products.splice(i, 1); saveProducts();
    });
  }

  // ---------- registro manual de productos que no están en el catálogo ----------
  var registering = null;
  function nextManualCode() {
    var n = 1, code;
    do { code = 'MAN-' + String(n++).padStart(4, '0'); } while (findProduct(code));
    return code;
  }
  function openProductDialog(it) {
    registering = it;
    var cats = Array.from(new Set(products.map(function (p) { return p.categoria; }).filter(Boolean))).sort();
    $('#dl-categorias').innerHTML = cats.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('');
    $('#dp-codigo').value = nextManualCode();
    $('#dp-descripcion').value = it.solicitado ? it.solicitado.toUpperCase() : '';
    $('#dp-categoria').value = ''; $('#dp-proveedor').value = ''; $('#dp-unidad').value = '';
    $('#dp-marca').value = it.nota || ''; $('#dp-costo').value = ''; $('#dp-iva').value = '';
    $('#dp-sinonimos').value = it.solicitado || '';
    $('#dp-guardar').checked = true;
    $('#dlg-product').showModal();
    $('#dp-costo').focus();
  }
  function bindProductDialog() {
    $('#dlg-product').addEventListener('close', function () {
      if ($('#dlg-product').returnValue !== 'ok' || !registering) return;
      var p = {
        codigo: $('#dp-codigo').value.trim() || nextManualCode(), descripcion: $('#dp-descripcion').value.trim(),
        categoria: $('#dp-categoria').value.trim(), proveedor: $('#dp-proveedor').value.trim(), unidad: $('#dp-unidad').value.trim(),
        marca: $('#dp-marca').value.trim(), costo: parseFloat($('#dp-costo').value) || 0,
        iva: $('#dp-iva').value === '' ? 0 : Number($('#dp-iva').value), sinonimos: $('#dp-sinonimos').value.trim()
      };
      if (!p.descripcion) return;
      if ($('#dp-guardar').checked) {
        if (findProduct(p.codigo)) { toast('Ya existe un producto con el código ' + p.codigo + '.', true); return; }
        products.push(p); saveProducts();
        toast('Producto ' + p.codigo + ' registrado en el catálogo.');
      }
      assignProduct(registering, p, 1);
      registering = null;
      renderItems(); touched();
    });
  }

  // ---------- clientes ----------
  var editingClient = null;
  function renderClients() {
    var q = Matcher.normalize($('#cl-search').value);
    $('#cl-body').innerHTML = clients.filter(function (c) { return !q || Matcher.normalize(c.nombre + ' ' + (c.nit || '')).indexOf(q) >= 0; })
      .map(function (c) {
        var cats = Object.keys(c.factoresCategoria || {}).map(function (k) { return esc(k) + ': ' + c.factoresCategoria[k]; }).join(', ');
        return '<tr data-id="' + esc(c.id) + '"><td><b>' + esc(c.nombre) + '</b></td><td>' + esc(c.nit || '') + '</td><td>' + esc(c.ciudad || '') + '</td><td>' +
          (c.factorDefault || '<span class="muted">global</span>') + '</td><td>' + (cats || '<span class="muted">—</span>') + '</td><td>' +
          Object.keys(c.precios || {}).length + '</td><td><button class="small ghost" data-act="edit">Editar</button> <button class="small ghost" data-act="quote">Cotizar</button> <button class="icon" data-act="del">✕</button></td></tr>';
      }).join('') || '<tr><td colspan="7" class="empty">Sin clientes. Se crean solos al guardar cotizaciones, o con "+ Nuevo cliente".</td></tr>';
  }

  function openClient(c) {
    editingClient = c;
    var d = c || {};
    ['nombre', 'nit', 'ciudad', 'contacto', 'telefono', 'email'].forEach(function (f) { $('#dc-' + f).value = d[f] || ''; });
    $('#dc-factor').value = d.factorDefault || '';
    var cats = Array.from(new Set(products.map(function (p) { return p.categoria; }).filter(Boolean))).sort();
    $('#dc-cats').innerHTML = cats.map(function (k) {
      var v = d.factoresCategoria && d.factoresCategoria[k] != null ? d.factoresCategoria[k] : '';
      return '<label>' + esc(k) + ' <input type="number" min="0.01" max="1" step="0.01" list="dl-factores" data-cat="' + esc(k) + '" value="' + v + '" placeholder="—"></label>';
    }).join('') || '<p class="muted">Cargue el catálogo para definir factores por categoría.</p>';
    $('#dlg-client').showModal();
  }

  function bindClients() {
    $('#cl-search').addEventListener('input', renderClients);
    $('#btn-cl-add').addEventListener('click', function () { openClient(null); });
    $('#dc-clear-prices').addEventListener('click', function () {
      if (editingClient && confirm('¿Olvidar los factores recordados por producto de este cliente?')) { editingClient.precios = {}; Store.saveClients(clients); toast('Precios recordados borrados.'); renderClients(); }
    });
    $('#cl-body').addEventListener('click', function (e) {
      var act = e.target.dataset.act; if (!act) return;
      var c = clients.find(function (x) { return x.id === e.target.closest('tr').dataset.id; });
      if (act === 'edit') openClient(c);
      else if (act === 'del' && confirm('¿Eliminar el cliente ' + c.nombre + '?')) { clients = clients.filter(function (x) { return x !== c; }); Store.saveClients(clients); refreshClientList(); renderClients(); }
      else if (act === 'quote') {
        quote = newQuote();
        CLIENT_FIELDS.forEach(function (f) { quote.cliente[f] = c[f] || ''; });
        if (c.factorDefault) setGlobalFactor(c.factorDefault, true);
        quoteToForm(); showTab('cotizar');
      }
    });
    $('#dlg-client').addEventListener('close', function () {
      if ($('#dlg-client').returnValue !== 'ok') return;
      var nombre = $('#dc-nombre').value.trim(); if (!nombre) return;
      var c = editingClient;
      if (!c) {
        c = findClient(nombre);
        if (!c) { c = { id: uid(), precios: {} }; clients.push(c); }
      }
      ['nombre', 'nit', 'ciudad', 'contacto', 'telefono', 'email'].forEach(function (f) { c[f] = $('#dc-' + f).value.trim(); });
      c.factorDefault = clampFactor($('#dc-factor').value);
      c.factoresCategoria = {};
      $$('#dc-cats input').forEach(function (i) { var f = clampFactor(i.value); if (f != null && i.value !== '') c.factoresCategoria[i.dataset.cat] = f; });
      Store.saveClients(clients); refreshClientList(); renderClients(); clientHint();
      toast('Cliente guardado.');
    });
  }

  // ---------- configuración ----------
  var S_MAP = { nombre: 'empresa.nombre', nit: 'empresa.nit', telefono: 'empresa.telefono', direccion: 'empresa.direccion', ciudad: 'empresa.ciudad',
    email: 'empresa.email', web: 'empresa.web', firma: 'firmaNombre', cargo: 'firmaCargo', prefijo: 'prefijo', consecutivo: 'consecutivo',
    factor: 'factorDefault', validez: 'validezDias', redondeo: 'redondeo', pago: 'condicionesPago', entrega: 'tiempoEntrega',
    notas: 'notas', apikey: 'apiKey', model: 'aiModel', equiv: 'equivalencias', packs: 'presentaciones' };
  function getPath(o, p) { return p.split('.').reduce(function (a, k) { return a && a[k]; }, o); }
  function setPath(o, p, v) { var ks = p.split('.'), last = ks.pop(); ks.reduce(function (a, k) { return a[k]; }, o)[last] = v; }

  function settingsToForm() {
    Object.keys(S_MAP).forEach(function (k) { var v = getPath(settings, S_MAP[k]); $('#s-' + k).value = v == null ? '' : v; });
    $('#s-logo-prev').src = settings.empresa.logo || '';
    $('#alias-count').textContent = Object.keys(aliases).length;
    $('#brand-name').textContent = 'Cotizador de ' + settings.empresa.nombre;
    $('#ai-status').textContent = settings.apiKey ? '' : '(configure la API key en Configuración)';
    $('#use-ai').disabled = !settings.apiKey;
  }

  function bindSettings() {
    $('#btn-settings-save').addEventListener('click', function () {
      Object.keys(S_MAP).forEach(function (k) {
        var v = $('#s-' + k).value;
        if (['consecutivo', 'validez', 'redondeo'].indexOf(k) >= 0) v = Number(v) || 0;
        if (k === 'factor') v = clampFactor(v) || 0.75;
        if (k === 'apikey') v = v.trim();
        setPath(settings, S_MAP[k], v);
      });
      if (settings.consecutivo < 1) settings.consecutivo = 1;
      Store.saveSettings(settings); settingsToForm(); reindex(); toast('Configuración guardada.');
    });
    $('#s-logo').addEventListener('change', async function (e) {
      var f = e.target.files[0]; if (!f) return;
      var url = await Parsers.readAsDataURL(f);
      var img = await new Promise(function (res) { var i = new Image(); i.onload = function () { res(i); }; i.src = url; });
      var s = Math.min(1, 500 / Math.max(img.width, img.height));
      var cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      settings.empresa.logo = cv.toDataURL('image/png');
      $('#s-logo-prev').src = settings.empresa.logo;
      Store.saveSettings(settings);
    });
    $('#s-logo-del').addEventListener('click', function () { settings.empresa.logo = ''; $('#s-logo-prev').src = ''; $('#s-logo').value = ''; Store.saveSettings(settings); });
    $('#btn-backup').addEventListener('click', function () {
      E.download(new Blob([JSON.stringify(Store.exportAll(), null, 1)], { type: 'application/json' }), 'cotizador_copia_' + new Date().toISOString().slice(0, 10) + '.json');
    });
    $('#backup-file').addEventListener('change', async function (e) {
      var f = e.target.files[0]; if (!f) return;
      try {
        Store.importAll(JSON.parse(await f.text()));
        alert('Copia restaurada. La página se recargará.');
        location.reload();
      } catch (err) { toast(err.message, true); }
    });
    $('#btn-alias-clear').addEventListener('click', function () {
      if (!confirm('¿Olvidar todas las homologaciones aprendidas?')) return;
      aliases = {}; Store.saveAliases(aliases); settingsToForm();
    });
  }

  // ---------- pestañas ----------
  function showTab(name) {
    $$('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === name); });
    $$('.panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + name); });
    if (name === 'historial') renderHistory();
    if (name === 'catalogo') renderCatalog();
    if (name === 'clientes') renderClients();
    if (name === 'config') settingsToForm();
  }

  /**
   * Versión entregada con el catálogo de la empresa (window.SEED_CATALOG): agrega los productos que falten,
   * sin borrar ni cambiar los que el usuario ya tenga (registrados a mano o importados).
   * Se ejecuta una vez por versión del catálogo incluido, o cuando el usuario lo pide.
   */
  var seedIvaFixed = false;
  function loadSeedCatalog(force) {
    var seed = window.SEED_CATALOG;
    if (!Array.isArray(seed) || !seed.length) return false;
    var version = String(window.SEED_VERSION || seed.length);
    if (!force && Store.seedVersion() === version) return false;
    var byCode = new Map(products.map(function (p) { return [String(p.codigo).toUpperCase(), p]; }));
    var added = 0, ivaFixed = 0;
    seed.forEach(function (p) {
      var cur = byCode.get(String(p.codigo).toUpperCase());
      if (!cur) { products.push(clone(p)); added++; }
      else if (Number(cur.iva) !== Number(p.iva)) { cur.iva = p.iva; ivaFixed++; } // la versión nueva corrige el IVA
    });
    Store.saveProducts(products);
    Store.saveSeedVersion(version);
    if (added || force) {
      setTimeout(function () { toast('Catálogo MEDITIENDA: ' + added + ' productos agregados (total ' + products.length + ').'); }, 400);
    }
    if (ivaFixed) setTimeout(function () { toast('Catálogo MEDITIENDA actualizado: IVA corregido en ' + ivaFixed + ' productos.'); }, 3600);
    seedIvaFixed = ivaFixed > 0;
    return added > 0;
  }

  // ---------- inicio ----------
  function init() {
    var opts = '';
    for (var i = 1; i <= 100; i++) opts += '<option value="' + (i / 100).toFixed(2) + '">';
    $('#dl-factores').innerHTML = opts;

    if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

    // Versión entregada con el catálogo de la empresa: se carga sola la primera vez
    var seeded = loadSeedCatalog(false);
    reindex(); refreshClientList(); settingsToForm();
    quote = Store.draft() || newQuote();
    setGlobalFactor(settings.factorDefault, true);
    quoteToForm();
    if (seeded && quote.items.some(function (i) { return i.solicitado && !i.codigo; })) rematchAll();
    if (seedIvaFixed) {
      // la cotización en curso toma el IVA corregido del catálogo
      quote.items.forEach(function (it) { var p = findProduct(it.codigo); if (p) it.iva = Number(p.iva) || 0; });
      renderItems(); Store.saveDraft(quote);
    }

    $$('.tab').forEach(function (t) { t.addEventListener('click', function () { showTab(t.dataset.tab); }); });
    bindItems(); bindClient(); bindInput(); bindActions(); bindHistory(); bindCatalog(); bindClients(); bindSettings(); bindProductDialog();

    var missing = ['XLSX', 'ExcelJS', 'jspdf', 'mammoth', 'Tesseract', 'pdfjsLib'].filter(function (g) { return !window[g]; });
    if (missing.length) toast('No se pudieron cargar algunas librerías (' + missing.join(', ') + '). Verifique la conexión a internet.', true);
    if (!products.length) toast('Bienvenido. Empiece cargando su catálogo en la pestaña Catálogo (o el catálogo de ejemplo).');
  }

  init();
})();
