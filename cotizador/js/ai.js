/*
 * Lectura opcional con IA (Claude). Se usa para fotos difíciles, PDFs escaneados o
 * para decidir entre candidatos cuando la homologación automática tiene poca confianza.
 * Requiere una API key de Anthropic guardada en Configuración (queda solo en este equipo).
 */
(function (root) {
  'use strict';

  var SDK_LOCAL = '../vendor/anthropic-sdk.mjs';
  var SDK_CDN = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';
  var sdkPromise = null;

  function loadSdk() {
    if (!sdkPromise) {
      sdkPromise = import(SDK_LOCAL).catch(function () { return import(SDK_CDN); })
        .then(function (m) { return m.default; });
    }
    return sdkPromise;
  }

  async function client() {
    var s = Store.settings();
    if (!s.apiKey) throw new Error('Configure su API key de Anthropic en la pestaña Configuración para usar la IA.');
    var Anthropic = await loadSdk();
    return { c: new Anthropic({ apiKey: s.apiKey, dangerouslyAllowBrowser: true }), model: s.aiModel || 'claude-opus-5-5' };
  }

  async function askJson(content, schema, system) {
    var ctx = await client();
    var res = await ctx.c.beta.messages.create({
      model: ctx.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: system,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: schema } },
      messages: [{ role: 'user', content: content }]
    });
    if (res.stop_reason === 'refusal') throw new Error('La IA no pudo procesar esta solicitud.');
    if (res.stop_reason === 'max_tokens') throw new Error('La lista es demasiado larga para una sola lectura; divídala en partes.');
    var text = res.content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
    return JSON.parse(text);
  }

  var ITEMS_SCHEMA = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            cantidad: { type: 'number' },
            unidad: { type: 'string' },
            texto: { type: 'string' }
          },
          required: ['cantidad', 'unidad', 'texto'],
          additionalProperties: false
        }
      }
    },
    required: ['items'],
    additionalProperties: false
  };

  var EXTRACT_SYSTEM =
    'Eres asistente del área de cotizaciones de un distribuidor de insumos de laboratorio clínico y hospitalario ' +
    '(reactivos, pruebas rápidas, tubería de toma de muestra, guantes, citoquímicos, coprológicos, consumibles). ' +
    'Recibes la solicitud de un cliente (foto, documento o mensaje) y extraes SOLO los productos pedidos. ' +
    'Por cada producto devuelve: cantidad (número; 1 si no se indica), unidad (caja, unidad, frasco, paquete... o vacío) ' +
    'y texto (la descripción del producto tal como la pidió el cliente, corrigiendo solo errores evidentes de lectura; ' +
    'conserva tallas, medidas, colores de tapa, marcas y referencias). Ignora saludos, firmas, datos de contacto y totales. ' +
    'Si un ítem es ilegible, inclúyelo con tu mejor lectura entre corchetes, por ejemplo "[ilegible] tubo tapa ...".';

  /** source: { text } | { dataUrl } (imagen o PDF en base64) */
  async function extractItems(source) {
    var content = [];
    if (source.dataUrl) {
      var m = /^data:([^;]+);base64,(.*)$/.exec(source.dataUrl);
      if (!m) throw new Error('Archivo no válido para la IA.');
      if (m[1] === 'application/pdf') {
        content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: m[2] } });
      } else {
        content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
      }
      content.push({ type: 'text', text: 'Extrae los productos solicitados en este archivo.' });
    } else {
      content.push({ type: 'text', text: 'Extrae los productos solicitados en este mensaje:\n\n' + source.text });
    }
    var out = await askJson(content, ITEMS_SCHEMA, EXTRACT_SYSTEM);
    return out.items.map(function (it) {
      return { cantidad: it.cantidad || 1, cantidadDetectada: true, unidad: it.unidad || '', texto: it.texto };
    });
  }

  var PICK_SCHEMA = {
    type: 'object',
    properties: {
      elecciones: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            linea: { type: 'integer' },
            codigo: { type: 'string', description: 'Código elegido, o cadena vacía si ninguno corresponde' }
          },
          required: ['linea', 'codigo'],
          additionalProperties: false
        }
      }
    },
    required: ['elecciones'],
    additionalProperties: false
  };

  /** lines: [{ linea, texto, candidatos: [{codigo, descripcion, unidad}] }] -> { linea: codigo } */
  async function pickCandidates(lines) {
    var text = 'Para cada línea solicitada por el cliente, elige el código de NUESTRO catálogo que corresponde ' +
      'exactamente (mismo producto, talla, medida, color de tapa y presentación). Si ninguno corresponde, devuelve codigo vacío.\n\n' +
      lines.map(function (l) {
        return 'Línea ' + l.linea + ': "' + l.texto + '"\n' + l.candidatos.map(function (c) {
          return '  - ' + c.codigo + ' | ' + c.descripcion + (c.unidad ? ' | ' + c.unidad : '');
        }).join('\n');
      }).join('\n\n');
    var out = await askJson([{ type: 'text', text: text }], PICK_SCHEMA, EXTRACT_SYSTEM);
    var map = {};
    out.elecciones.forEach(function (e) { if (e.codigo) map[e.linea] = e.codigo; });
    return map;
  }

  root.AI = { extractItems: extractItems, pickCandidates: pickCandidates };
})(window);
