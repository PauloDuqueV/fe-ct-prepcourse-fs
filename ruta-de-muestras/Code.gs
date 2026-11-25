/**
 * Ruta de Muestras — servidor (Google Apps Script)
 * Guarda la operación en las hojas de este Google Sheets.
 * Instalación: ver INSTALACION.md
 */

const HOJAS = {
  Config: ['clave', 'valor', 'nota'],
  Zonas: ['id', 'nombre', 'mensajero', 'medio', 'punto', 'embarque', 'activa', 'orden'],
  Clientes: ['id', 'nombre', 'municipio', 'zonaId', 'modalidad', 'activo'],
  Puntos: ['id', 'nombre', 'tipo', 'mensajero', 'orden'],
  Recolecciones: ['fecha', 'zonaId', 'clienteId', 'cliente', 'municipio', 'hora', 'muestras', 'valor', 'pago',
    'temperatura', 'novedad', 'sinMuestras', 'anulada', 'actualizado'],
  Envios: ['fecha', 'zonaId', 'zona', 'mensajero', 'medio', 'empresa', 'guia', 'horaSalida', 'horaLlegada', 'punto',
    'embarque', 'neveras', 'temperatura', 'costo', 'obs', 'despachoHora', 'recepHora', 'recepPor', 'recepNeveras',
    'recepTemperatura', 'recepCosto', 'recepNovedad', 'entregaHora', 'entregaPor', 'entregaMuestras',
    'entregaConforme', 'entregaNovedad', 'cuadreCerrado', 'actualizado']
};
// Columnas que deben guardarse como texto (si no, Sheets las convierte en fechas u horas).
const TEXTO = ['id', 'fecha', 'zonaId', 'clienteId', 'hora', 'horaSalida', 'horaLlegada', 'guia', 'punto',
  'despachoHora', 'recepHora', 'entregaHora', 'cuadreCerrado', 'valor_pin'];
const FECHA_COLS = ['fecha'];
const HORA_COLS = ['hora', 'horaSalida', 'horaLlegada', 'despachoHora', 'recepHora', 'entregaHora', 'cuadreCerrado'];

/* ------------------------------------------------------------------ */
/* Página web                                                          */
/* ------------------------------------------------------------------ */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Ruta de Muestras')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ------------------------------------------------------------------ */
/* Instalación: ejecutar UNA vez desde el editor                       */
/* ------------------------------------------------------------------ */
function instalar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HOJAS).forEach(function (nombre) {
    let sh = ss.getSheetByName(nombre);
    if (!sh) sh = ss.insertSheet(nombre);
    const cols = HOJAS[nombre];
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#0A6B86').setFontColor('#FFFFFF');
      sh.setFrozenRows(1);
    }
  });
  const hoja1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hoja1 && hoja1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(hoja1);

  if (leer_('Config').length === 0) {
    agregar_('Config', { clave: 'PIN_MENSAJEROS', valor: '246810', nota: 'Cámbialo. Lo usan los mensajeros (zona y Medellín).' });
    agregar_('Config', { clave: 'PIN_ADMIN', valor: '135790', nota: 'Cámbialo. Da acceso a Administración.' });
    agregar_('Config', { clave: 'EMPRESA', valor: 'Homelab', nota: 'Nombre que aparece en la plataforma.' });
    agregar_('Config', { clave: 'LOGO_URL', valor: '', nota: 'Enlace del logo en Google Drive (compartido: cualquier persona con el enlace).' });
  }
  if (leer_('Puntos').length === 0) {
    [['olaya', 'Aeropuerto Olaya Herrera', 'aeropuerto', 1], ['jmc', 'Aeropuerto José María Córdova', 'aeropuerto', 2],
     ['tnorte', 'Terminal del Norte', 'terminal', 3], ['tsur', 'Terminal del Sur', 'terminal', 4]]
      .forEach(function (p) { agregar_('Puntos', { id: p[0], nombre: p[1], tipo: p[2], mensajero: '', orden: p[3] }); });
  }
  if (leer_('Zonas').length === 0) {
    agregar_('Zonas', { id: 'san-juan', nombre: 'San Juan (Chocó)', mensajero: 'Daniel', medio: 'avion', punto: 'olaya',
      embarque: 'Aeropuerto El Caraño, Quibdó', activa: true, orden: 0 });
  }
  if (leer_('Clientes').length === 0) {
    [['istmina-materno-infantil', 'Materno Infantil', 'Istmina'], ['istmina-cel-salud', 'Cel Salud', 'Istmina'],
     ['istmina-rosa-mistica', 'Rosa Mística', 'Istmina'], ['istmina-cubis', 'Centro Médico Cubis', 'Istmina'],
     ['istmina-bihomedica', 'Bihomedica', 'Istmina'], ['istmina-provital', 'Provital', 'Istmina'],
     ['tado-mafe', 'Laboratorio Clínico Mafe', 'Tadó'], ['tado-ser-salud', 'Ser Salud', 'Tadó'],
     ['tado-hospital', 'Hospital de Tadó', 'Tadó'], ['condoto-mi-salud', 'Unidad Médica Mi Salud', 'Condoto']]
      .forEach(function (c) { agregar_('Clientes', { id: c[0], nombre: c[1], municipio: c[2], zonaId: 'san-juan', modalidad: 'efectivo', activo: true }); });
  }
  SpreadsheetApp.getUi && SpreadsheetApp.flush();
  return 'Instalación completa';
}

/* ------------------------------------------------------------------ */
/* API llamada desde la página (google.script.run)                     */
/* ------------------------------------------------------------------ */
function login(pin) {
  const rol = rol_(pin);
  if (!rol) { Utilities.sleep(1500); throw new Error('PIN incorrecto.'); }
  return { rol: rol };
}

/** Marca: se puede pedir sin PIN para mostrar el logo en la pantalla de ingreso. */
function marca() {
  const c = config_();
  return { empresa: c.EMPRESA || 'Homelab', logo: logoUrl_(c.LOGO_URL) };
}
function logoUrl_(u) {
  u = String(u || '').trim();
  if (!u) return '';
  const m = u.match(/(?:\/d\/|id=)([A-Za-z0-9_-]{20,})/);
  if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w800';
  return /^https:\/\//.test(u) ? u : '';
}

function getDatos(pin, fecha) {
  requiere_(pin);
  return datos_(fecha);
}

function guardar(pin, fecha, zonaId, patch) {
  requiere_(pin);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) throw new Error('Fecha inválida.');
  const rol = rol_(pin);
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'cuadreCerrado') && !patch.cuadreCerrado && rol !== 'admin') {
    throw new Error('Solo administración puede reabrir un cuadre.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const zona = leer_('Zonas').filter(function (z) { return z.id === zonaId; })[0];
    if (!zona) throw new Error('Zona no encontrada.');
    const ahora = new Date().toISOString();

    if (patch.recolecciones) {
      const clientes = leer_('Clientes');
      Object.keys(patch.recolecciones).forEach(function (cid) {
        const r = patch.recolecciones[cid];
        const cli = clientes.filter(function (c) { return c.id === cid; })[0] || {};
        const fila = buscar_('Recolecciones', function (x) { return x.fecha === fecha && x.zonaId === zonaId && x.clienteId === cid; });
        const base = fila ? fila.obj : { fecha: fecha, zonaId: zonaId, clienteId: cid };
        const nuevo = Object.assign({}, base, { cliente: cli.nombre || r.nombre || base.cliente || '', municipio: cli.municipio || base.municipio || '' });
        ['hora', 'muestras', 'valor', 'pago', 'temperatura', 'novedad', 'sinMuestras', 'anulada'].forEach(function (k) {
          if (Object.prototype.hasOwnProperty.call(r, k)) nuevo[k] = r[k] === null ? '' : r[k];
        });
        nuevo.actualizado = ahora;
        if (fila) escribir_('Recolecciones', fila.row, nuevo); else agregar_('Recolecciones', nuevo);
      });
    }

    const tieneEnvio = patch.despacho || patch.recepcion || patch.entrega ||
      Object.prototype.hasOwnProperty.call(patch, 'cuadreCerrado') || patch.recolecciones;
    if (tieneEnvio) {
      const fila = buscar_('Envios', function (x) { return x.fecha === fecha && x.zonaId === zonaId; });
      const e = fila ? fila.obj : { fecha: fecha, zonaId: zonaId };
      e.zona = zona.nombre; e.mensajero = patch.mensajero || e.mensajero || zona.mensajero || '';
      const d = patch.despacho;
      if (d) {
        e.medio = d.medio; e.empresa = d.empresa; e.guia = d.guia; e.horaSalida = d.horaSalida; e.horaLlegada = d.horaLlegada;
        e.punto = d.punto; e.embarque = d.embarque; e.neveras = d.neveras; e.temperatura = nul_(d.temperatura);
        e.costo = d.costo; e.obs = d.obs; e.despachoHora = d.registrado;
      }
      const r = patch.recepcion;
      if (r) {
        e.recepHora = r.hora; e.recepPor = r.por; e.recepNeveras = r.neveras; e.recepTemperatura = nul_(r.temperatura);
        e.recepCosto = r.costo; e.recepNovedad = r.novedad;
      }
      const en = patch.entrega;
      if (en) {
        e.entregaHora = en.hora; e.entregaPor = en.por; e.entregaMuestras = en.muestras; e.entregaConforme = en.conforme;
        e.entregaNovedad = en.novedad;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'cuadreCerrado')) e.cuadreCerrado = patch.cuadreCerrado || '';
      e.actualizado = ahora;
      if (fila) escribir_('Envios', fila.row, e); else agregar_('Envios', e);
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return datos_(fecha);
}

function guardarCat(pin, hoja, id, data) {
  if (rol_(pin) !== 'admin') throw new Error('Solo administración puede cambiar la configuración.');
  if (['Zonas', 'Clientes', 'Puntos'].indexOf(hoja) < 0) throw new Error('Hoja no permitida.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const obj = Object.assign({}, data);
    obj.id = id || slug_(data.nombre) + '-' + Utilities.getUuid().slice(0, 4);
    const fila = buscar_(hoja, function (x) { return x.id === obj.id; });
    if (fila) escribir_(hoja, fila.row, Object.assign({}, fila.obj, obj)); else agregar_(hoja, obj);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return catalogo_();
}

/* ------------------------------------------------------------------ */
/* Internos                                                            */
/* ------------------------------------------------------------------ */
function config_() {
  const o = {};
  leer_('Config').forEach(function (r) { o[r.clave] = String(r.valor).trim(); });
  return o;
}
function rol_(pin) {
  const p = String(pin || '').trim();
  if (!p) return null;
  const c = config_();
  if (c.PIN_ADMIN && p === c.PIN_ADMIN) return 'admin';
  if (c.PIN_MENSAJEROS && p === c.PIN_MENSAJEROS) return 'mensajero';
  return null;
}
function requiere_(pin) {
  if (!rol_(pin)) { Utilities.sleep(1500); throw new Error('PIN incorrecto o cambiado. Vuelve a ingresar.'); }
}
function catalogo_() {
  const ord = function (a, b) { return (num_(a.orden) ?? 99) - (num_(b.orden) ?? 99) || String(a.nombre).localeCompare(String(b.nombre), 'es'); };
  return {
    zonas: leer_('Zonas').map(function (z) { return { id: z.id, nombre: z.nombre, mensajero: z.mensajero, medio: z.medio || 'avion', punto: z.punto, embarque: z.embarque, activa: bool_(z.activa, true), orden: num_(z.orden) }; }).sort(ord),
    clientes: leer_('Clientes').map(function (c) { return { id: c.id, nombre: c.nombre, municipio: c.municipio, zonaId: c.zonaId, modalidad: /cr/i.test(c.modalidad) ? 'credito' : 'efectivo', activo: bool_(c.activo, true) }; }).sort(ord),
    puntos: leer_('Puntos').map(function (p) { return { id: p.id, nombre: p.nombre, tipo: p.tipo, mensajero: p.mensajero, orden: num_(p.orden) }; }).sort(ord)
  };
}
function datos_(fecha) {
  const cat = catalogo_();
  const envios = {};
  leer_('Envios').filter(function (e) { return e.fecha === fecha; }).forEach(function (e) {
    const id = fecha + '_' + e.zonaId;
    envios[id] = {
      id: id, fecha: fecha, zonaId: e.zonaId, zonaNombre: e.zona, mensajero: e.mensajero, recolecciones: {},
      despacho: (e.despachoHora || e.medio) ? { medio: e.medio, empresa: e.empresa, guia: String(e.guia), horaSalida: e.horaSalida,
        horaLlegada: e.horaLlegada, punto: e.punto, embarque: e.embarque, neveras: num_(e.neveras) || 0, temperatura: num_(e.temperatura),
        costo: num_(e.costo) || 0, obs: e.obs, registrado: e.despachoHora } : null,
      recepcion: e.recepHora ? { hora: e.recepHora, por: e.recepPor, neveras: num_(e.recepNeveras) || 0, temperatura: num_(e.recepTemperatura),
        costo: num_(e.recepCosto) || 0, novedad: e.recepNovedad } : null,
      entrega: e.entregaHora ? { hora: e.entregaHora, por: e.entregaPor, muestras: num_(e.entregaMuestras) || 0,
        conforme: bool_(e.entregaConforme, true), novedad: e.entregaNovedad } : null,
      cuadreCerrado: e.cuadreCerrado || null
    };
  });
  leer_('Recolecciones').filter(function (r) { return r.fecha === fecha; }).forEach(function (r) {
    const id = fecha + '_' + r.zonaId;
    if (!envios[id]) envios[id] = { id: id, fecha: fecha, zonaId: r.zonaId, zonaNombre: '', mensajero: '', recolecciones: {}, despacho: null, recepcion: null, entrega: null, cuadreCerrado: null };
    envios[id].recolecciones[r.clienteId] = {
      nombre: r.cliente, hora: r.hora, muestras: num_(r.muestras) || 0, valor: num_(r.valor) || 0,
      pago: r.pago || null, temperatura: num_(r.temperatura), novedad: r.novedad || '',
      sinMuestras: bool_(r.sinMuestras, false), anulada: bool_(r.anulada, false)
    };
  });
  return { zonas: cat.zonas, clientes: cat.clientes, puntos: cat.puntos, envios: envios, servidor: new Date().toISOString() };
}

function hoja_(nombre) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!sh) throw new Error('Falta la hoja "' + nombre + '". Ejecuta instalar() en el editor de Apps Script.');
  return sh;
}
function encabezados_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
}
function leer_(nombre) {
  const sh = hoja_(nombre);
  const n = sh.getLastRow();
  if (n < 2) return [];
  const head = encabezados_(sh);
  const tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, n - 1, head.length).getValues().map(function (fila) {
    const o = {};
    head.forEach(function (k, i) {
      let v = fila[i];
      if (v instanceof Date) {
        v = FECHA_COLS.indexOf(k) >= 0 ? Utilities.formatDate(v, tz, 'yyyy-MM-dd')
          : HORA_COLS.indexOf(k) >= 0 ? Utilities.formatDate(v, tz, 'HH:mm') : v.toISOString();
      }
      o[k] = v;
    });
    return o;
  }).filter(function (o) { return Object.keys(o).some(function (k) { return o[k] !== ''; }); });
}
function buscar_(nombre, fn) {
  const sh = hoja_(nombre);
  const n = sh.getLastRow();
  if (n < 2) return null;
  const head = encabezados_(sh);
  const tz = Session.getScriptTimeZone();
  const vals = sh.getRange(2, 1, n - 1, head.length).getValues();
  for (let i = 0; i < vals.length; i++) {
    const o = {};
    head.forEach(function (k, j) {
      let v = vals[i][j];
      if (v instanceof Date) v = FECHA_COLS.indexOf(k) >= 0 ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : Utilities.formatDate(v, tz, 'HH:mm');
      o[k] = v;
    });
    if (fn(o)) return { row: i + 2, obj: o };
  }
  return null;
}
function fila_(sh, obj) {
  const head = encabezados_(sh);
  return {
    valores: head.map(function (k) { const v = obj[k]; return v === undefined || v === null ? '' : v; }),
    formatos: head.map(function (k) { return TEXTO.indexOf(k) >= 0 ? '@' : 'General'; })
  };
}
function escribir_(nombre, row, obj) {
  const sh = hoja_(nombre);
  const f = fila_(sh, obj);
  sh.getRange(row, 1, 1, f.valores.length).setNumberFormats([f.formatos]).setValues([f.valores]);
}
function agregar_(nombre, obj) {
  const sh = hoja_(nombre);
  escribir_(nombre, sh.getLastRow() + 1, obj);
}
function num_(v) { if (v === '' || v === null || v === undefined) return null; const n = Number(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
function nul_(v) { return v === null || v === undefined ? '' : v; }
function bool_(v, def) { if (v === '' || v === null || v === undefined) return def; if (v === true || v === false) return v; return /^(true|si|sí|1|verdadero|x)$/i.test(String(v).trim()); }
function slug_(s) { return String(s || 'item').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item'; }
