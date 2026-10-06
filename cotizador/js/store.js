/* Persistencia local (en el navegador) de catálogo, clientes, configuración y cotizaciones. */
(function (root) {
  'use strict';
  var PREFIX = 'cotizador.v1.';

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      alert('No se pudo guardar en el navegador (¿espacio lleno?). Exporte una copia de seguridad.\n' + e.message);
      return false;
    }
  }

  var DEFAULT_SETTINGS = {
    empresa: { nombre: 'Mi Empresa S.A.S.', nit: '900.000.000-0', direccion: '', ciudad: '', telefono: '', email: '', web: '', logo: '' },
    consecutivo: 1,
    prefijo: 'COT-',
    validezDias: 15,
    condicionesPago: 'Crédito 30 días',
    tiempoEntrega: '3 a 5 días hábiles',
    notas: 'Precios sujetos a disponibilidad de inventario.',
    factorDefault: 0.75,
    ivaDefault: 19,
    redondeo: 100,
    firmaNombre: '',
    firmaCargo: 'Asesor comercial',
    apiKey: '',
    aiModel: 'claude-opus-5-5'
  };

  var Store = {
    settings: function () {
      var s = load('settings', {});
      var merged = Object.assign({}, DEFAULT_SETTINGS, s);
      merged.empresa = Object.assign({}, DEFAULT_SETTINGS.empresa, s.empresa || {});
      return merged;
    },
    saveSettings: function (s) { return save('settings', s); },

    products: function () { return load('products', []); },
    saveProducts: function (p) { return save('products', p); },

    clients: function () { return load('clients', []); },
    saveClients: function (c) { return save('clients', c); },

    quotes: function () { return load('quotes', []); },
    saveQuotes: function (q) { return save('quotes', q); },

    aliases: function () { return load('aliases', {}); },
    saveAliases: function (a) { return save('aliases', a); },

    draft: function () { return load('draft', null); },
    saveDraft: function (d) { return save('draft', d); },

    exportAll: function () {
      var settings = Object.assign({}, load('settings', {}));
      delete settings.apiKey; // la clave de IA nunca sale del equipo
      return {
        app: 'cotizador', version: 1, exportado: new Date().toISOString(),
        settings: settings, products: this.products(), clients: this.clients(),
        quotes: this.quotes(), aliases: this.aliases()
      };
    },
    importAll: function (data) {
      if (!data || data.app !== 'cotizador') throw new Error('El archivo no es una copia de seguridad del cotizador.');
      if (data.settings) data.settings.apiKey = this.settings().apiKey;
      ['settings', 'products', 'clients', 'quotes', 'aliases'].forEach(function (k) {
        if (data[k] !== undefined) save(k, data[k]);
      });
    }
  };

  root.Store = Store;
})(window);
