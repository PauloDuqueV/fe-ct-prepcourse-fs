/* Pruebas de lectura de solicitudes, importación de catálogo y homologación.
 * Ejecutar desde la raíz del repositorio: npx jest cotizador/tests */
global.Matcher = require('../js/matcher.js');
const Parsers = require('../js/parsers.js');
const Catalog = require('../js/catalog.js');
const demo = require('../js/demo-data.js');

const index = Matcher.buildIndex(demo);
const best = q => (Matcher.match(q, index)[0] || {}).product?.codigo;

describe('lectura de líneas', () => {
  test.each([
    ['[6/10/26, 9:15 a. m.] Laura: 10 cajas guantes nitrilo M', 10, 'guantes nitrilo M'],
    ['Guantes nitrilo talla L x 5', 5, 'Guantes nitrilo talla L'],
    ['- tubos tapa lila 4ml x 3 cajas', 3, 'tubos tapa lila 4ml'],
    ['Glucosa 500ml cant: 2', 2, 'Glucosa 500ml'],
    ['Tiras orina 10 parametros, 2 frascos', 2, 'Tiras orina 10 parametros'],
  ])('%s', (line, qty, text) => {
    const r = Parsers.parseLine(line);
    expect(r.cantidad).toBe(qty);
    expect(r.texto).toBe(text);
  });

  test.each([
    ['Tirillas de orina mission 3', 3, 'Tirillas de orina mission'],
    ['Guardianes grande. 15.', 15, 'Guardianes grande'],
    ['Agujas vacutainer para niños, 22-23G. Seria 3 cajitas', 3, 'Agujas vacutainer para niños, 22-23G'],
    ['Alcohol gram 1 tarro', 1, 'Alcohol gram'],
    ['4 gradillas de tubos lila', 4, 'tubos lila'],
    ['Guantes nitrilo talla 7', 1, 'Guantes nitrilo talla 7'],
    ['IPR-0018', 1, 'IPR-0018'],
  ])('cantidad al final: %s', (line, qty, text) => {
    const r = Parsers.parseLine(line);
    expect(r.cantidad).toBe(qty);
    expect(r.texto).toBe(text);
  });

  test('detecta el cliente en la solicitud', () => {
    expect(Parsers.detectClient('COTIZAR A CELSALUD ISTMINA\n\nTimer\'s 3')).toBe('CELSALUD ISTMINA');
    expect(Parsers.detectClient('Cliente: Hospital San Rafael')).toBe('Hospital San Rafael');
    expect(Parsers.detectClient('10 cajas guantes')).toBe('');
  });

  test('tabla con columna de requisito: conserva la presentación y la marca pedida', () => {
    const items = Parsers.parseTable([
      ['FORMATO PARA PEDIDO DE INSUMOS'], ['RESPONSABLE: X'],
      ['INSUMO ', 'CANTIDAD', 'REQUISITO DEL INSUMO'],
      ['TUBOS TAPA AMARILLA GEL DE 5ML  X100 TUBOS', '8', 'BD - INPROVE'],
    ]);
    expect(items).toEqual([expect.objectContaining({ texto: 'TUBOS TAPA AMARILLA GEL DE 5ML X100 TUBOS', cantidad: 8, nota: 'BD - INPROVE' })]);
  });

  test('ignora saludos y separa varias cantidades en una línea', () => {
    const items = Parsers.parseText('Buenos días\nfavor cotizar\n1 TGO y 1 TGP\nGracias');
    expect(items.map(i => i.texto)).toEqual(['TGO', 'TGP']);
  });

  test('tabla con encabezados (Excel / Word)', () => {
    const items = Parsers.parseTable([['Item', 'Descripción', 'Cant.'], ['1', 'Guantes latex M', '4']]);
    expect(items).toEqual([expect.objectContaining({ texto: 'Guantes latex M', cantidad: 4 })]);
  });
});

describe('homologación', () => {
  test.each([
    ['guantes nitrilo M', 'GUA-NIT-M'],
    ['tubos tapa lila 4ml', 'TUB-EDTA-4'],
    ['prueba embarazo', 'PR-HCG-CAS'],
    ['prueba HIV', 'PR-VIH-12'],
    ['jeringas 5cc', 'JER-5ML'],
    ['TUB-SEC-5', 'TUB-SEC-5'],
  ])('%s -> %s', (q, code) => expect(best(q)).toBe(code));

  test('usa la homologación aprendida', () => {
    const m = Matcher.match('el de siempre', index, { aliases: { [Matcher.normalize('el de siempre')]: 'ALC-ANT-1L' } });
    expect(m[0].product.codigo).toBe('ALC-ANT-1L');
  });
});

describe('importación de catálogo', () => {
  const rows = [
    ['Lista de precios 2026'],
    [null, 'INSUMO', 'VALOR UNITARIO ', 'IVA ', 'VALOR TOTAL'],
    [1, 'GUANTE NITRILO TALLA S-M-L', 17500, 0.19, 20825],
    [],
    ['SEROLOGIA'],
    ['CODIGO', 'DESCRIPCION ', 'PRESENTACIÒN', 'RENDIMIENTO', 'PRECIO DISTRIBUIDOR'],
    ['003448', 'RPR CARBON X 125 TEST', 'TEST', 125, '79.035,20'],
  ];
  const ps = Catalog.parseSheet(rows, { hoja: 'INSUMOS', ivaDefault: 0 });

  test('lee varias tablas, secciones, IVA y costos', () => {
    expect(ps).toHaveLength(2);
    expect(ps[0]).toMatchObject({ descripcion: 'GUANTE NITRILO TALLA S-M-L', costo: 17500, iva: 19, categoria: 'INSUMOS' });
    expect(ps[1]).toMatchObject({ codigo: '003448', costo: 79035.2, iva: 0, categoria: 'SEROLOGIA', unidad: 'TEST · 125 pruebas' });
  });

  test('genera códigos estables y actualiza por descripción', () => {
    const first = Catalog.merge([], ps, 'merge');
    expect(first.products[0].codigo).toBe('INS-0001');
    const again = Catalog.merge(first.products, Catalog.parseSheet(rows, { hoja: 'INSUMOS' }), 'merge');
    expect(again).toMatchObject({ added: 0, updated: 2 });
  });
});

describe('reglas comerciales', () => {
  const Rules = require('../js/rules.js');
  const brands = Rules.brandSet([{ marca: 'CTK' }]);

  test('equivalencias de la empresa (con plural)', () => {
    const eq = Rules.parseEquivalences(Rules.DEFAULT_EQUIVALENCES);
    expect(Rules.applyEquivalences('Guardianes grande', eq)).toBe('guardian 2.9');
  });

  test('marca distinta a la pedida', () => {
    const p = { descripcion: 'SYPHILIS CAJA X 30 PBS CTK' };
    expect(Rules.brandMismatch({ texto: 'Sifilis ac abbot' }, p, brands)).toBe('ABBOTT');
    expect(Rules.brandMismatch({ texto: 'Sifilis CTK' }, p, brands)).toBeNull();
    expect(Rules.brandMismatch({ texto: 'Sifilis' }, p, brands)).toBeNull();
  });

  test('presentación distinta: ajusta la cantidad', () => {
    expect(Rules.adjustQuantity({ texto: 'LUGOL DE GRAM X 1000ML', cantidad: 1 }, { descripcion: 'LUGOL GRAM 500ML' }).cantidad).toBe(2);
    expect(Rules.adjustQuantity({ texto: 'prueba embarazo x 50', cantidad: 2, unidad: 'cajas' }, { descripcion: 'HCG CASSETE CJX 25' }).cantidad).toBe(4);
    expect(Rules.adjustQuantity({ texto: 'tubos lila', cantidad: 4, unidad: 'gradillas' }, { descripcion: 'TUBO LILA CAJAX 50' }).cantidad).toBe(8);
    // en tubos el volumen es una característica: no cambia la cantidad, solo avisa
    const t = Rules.adjustQuantity({ texto: 'tubo lila 4ml', cantidad: 3, unidad: 'cajas' }, { descripcion: 'TUBO LILA 2ML CAJAX 100' });
    expect(t).toEqual({ cantidad: 3, presentacion: 'Pide 4 ml, se ofrece 2 ml' });
    expect(Rules.adjustQuantity({ texto: 'tubo lila', cantidad: 3 }, { descripcion: 'TUBO LILA CAJAX 100' }).presentacion).toBeNull();
  });

  test('elige la presentación más cercana entre candidatos parecidos', () => {
    const cands = [
      { score: 0.8, product: { descripcion: 'GLUCOSA LS 2 X 125 ML' } },
      { score: 0.78, product: { descripcion: 'GLUCOSA LS 4 X 250 ML' } },
    ];
    expect(Rules.nearestPresentation('glucosa 1000 ml', cands)).toBe(1);
    expect(Rules.nearestPresentation('glucosa', cands)).toBe(0);
  });
});
