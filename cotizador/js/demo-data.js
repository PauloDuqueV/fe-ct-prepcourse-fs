/* Catálogo de ejemplo para probar la herramienta. Reemplácelo importando sus listas reales. */
(function (root) {
  'use strict';
  var P = function (codigo, descripcion, categoria, proveedor, unidad, marca, costo, iva, sinonimos) {
    return { codigo: codigo, descripcion: descripcion, categoria: categoria, proveedor: proveedor, unidad: unidad,
      marca: marca, costo: costo, iva: iva, sinonimos: sinonimos || '' };
  };
  var demo = [
    P('GUA-NIT-S', 'Guantes de nitrilo talla S sin polvo caja x 100', 'Guantes', 'Proveedor A', 'Caja x 100', 'Sempermed', 18500, 19),
    P('GUA-NIT-M', 'Guantes de nitrilo talla M sin polvo caja x 100', 'Guantes', 'Proveedor A', 'Caja x 100', 'Sempermed', 18500, 19),
    P('GUA-NIT-L', 'Guantes de nitrilo talla L sin polvo caja x 100', 'Guantes', 'Proveedor A', 'Caja x 100', 'Sempermed', 18500, 19),
    P('GUA-LAT-M', 'Guantes de latex talla M con polvo caja x 100', 'Guantes', 'Proveedor A', 'Caja x 100', 'Top Glove', 14200, 19),
    P('GUA-EST-75', 'Guantes quirurgicos esteriles latex 7.5 par', 'Guantes', 'Proveedor B', 'Par', 'Medigloves', 1350, 19),
    P('TUB-EDTA-4', 'Tubo tapa lila EDTA K2 4 ml 13x75 caja x 100', 'Tuberia', 'Proveedor C', 'Caja x 100', 'BD Vacutainer', 72000, 0, 'hemograma'),
    P('TUB-SEC-5', 'Tubo tapa roja seco 5 ml 13x100 caja x 100', 'Tuberia', 'Proveedor C', 'Caja x 100', 'BD Vacutainer', 68000, 0, 'tubo suero'),
    P('TUB-GEL-5', 'Tubo tapa amarilla con gel separador 5 ml caja x 100', 'Tuberia', 'Proveedor C', 'Caja x 100', 'BD Vacutainer', 95000, 0, 'sst'),
    P('TUB-CIT-27', 'Tubo tapa azul citrato de sodio 3.2% 2.7 ml caja x 100', 'Tuberia', 'Proveedor C', 'Caja x 100', 'BD Vacutainer', 98000, 0, 'coagulacion'),
    P('AGU-VAC-21', 'Aguja vacutainer 21G x 1.5 caja x 100', 'Tuberia', 'Proveedor C', 'Caja x 100', 'BD', 52000, 0, 'aguja multimuestra'),
    P('PR-COVID-AG', 'Prueba rapida antigeno COVID-19 caja x 25', 'Pruebas rapidas', 'Proveedor D', 'Caja x 25', 'SD Biosensor', 112000, 0),
    P('PR-HCG-CAS', 'Prueba rapida embarazo HCG cassette caja x 50', 'Pruebas rapidas', 'Proveedor D', 'Caja x 50', 'Abon', 48000, 0, 'embarazo orina suero'),
    P('PR-VIH-12', 'Prueba rapida VIH 1/2 caja x 25', 'Pruebas rapidas', 'Proveedor D', 'Caja x 25', 'Alere Determine', 165000, 0, 'hiv'),
    P('PR-SIF', 'Prueba rapida sifilis caja x 25', 'Pruebas rapidas', 'Proveedor D', 'Caja x 25', 'SD Bioline', 98000, 0, 'treponema'),
    P('PR-SANG-OC', 'Prueba rapida sangre oculta en heces caja x 25', 'Coprologicos', 'Proveedor D', 'Caja x 25', 'Abon', 76000, 0, 'fob'),
    P('COP-FRASCO', 'Frasco coprologico con cucharilla 60 ml paquete x 100', 'Coprologicos', 'Proveedor E', 'Paquete x 100', 'Generico', 42000, 19, 'recolector heces'),
    P('CIT-TIRA-10', 'Tiras de orina 10 parametros frasco x 100', 'Citoquimicos', 'Proveedor E', 'Frasco x 100', 'Combur', 98000, 0, 'uroanalisis parcial de orina'),
    P('CIT-FRASCO', 'Frasco recolector de orina esteril 120 ml paquete x 100', 'Citoquimicos', 'Proveedor E', 'Paquete x 100', 'Generico', 38000, 19, 'parcial de orina'),
    P('REA-GLU-500', 'Reactivo glucosa enzimatica 500 ml', 'Reactivos', 'Proveedor F', 'Frasco 500 ml', 'Spinreact', 86000, 0),
    P('REA-COL-200', 'Reactivo colesterol total 200 ml', 'Reactivos', 'Proveedor F', 'Frasco 200 ml', 'Spinreact', 74000, 0),
    P('REA-TRI-200', 'Reactivo trigliceridos 200 ml', 'Reactivos', 'Proveedor F', 'Frasco 200 ml', 'Spinreact', 91000, 0),
    P('REA-CRE-200', 'Reactivo creatinina 200 ml', 'Reactivos', 'Proveedor F', 'Frasco 200 ml', 'Spinreact', 63000, 0),
    P('JER-5ML', 'Jeringa desechable 5 ml con aguja 21G caja x 100', 'Consumibles', 'Proveedor B', 'Caja x 100', 'Nipro', 31000, 19),
    P('ALC-ANT-1L', 'Alcohol antiseptico 70% litro', 'Consumibles', 'Proveedor B', 'Litro', 'JGB', 9800, 19)
  ];
  root.DEMO_PRODUCTS = demo;
  if (typeof module !== 'undefined' && module.exports) module.exports = demo;
})(typeof window !== 'undefined' ? window : globalThis);
