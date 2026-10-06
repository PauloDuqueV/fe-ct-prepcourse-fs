/* Cálculo de precios y generación de Excel (modificable) y PDF (borrador / aprobado). */
(function (root) {
  'use strict';

  // ---------- Cálculo ----------

  /** Precio de venta = costo / factor, redondeado hacia arriba al múltiplo indicado. */
  function precioVenta(costo, factor, redondeo) {
    costo = Number(costo) || 0;
    factor = Number(factor);
    if (!(factor > 0) || factor > 1) return 0;
    var p = costo / factor;
    var step = Number(redondeo) || 0;
    if (step > 0) p = Math.ceil(Math.round(p * 1e6) / 1e6 / step) * step;
    else p = Math.round(p * 100) / 100;
    return p;
  }

  function lineCalc(it, redondeo) {
    var precio = precioVenta(it.costo, it.factor, redondeo);
    var cant = Number(it.cantidad) || 0;
    var subtotal = precio * cant;
    var iva = subtotal * (Number(it.iva) || 0) / 100;
    return { precio: precio, subtotal: subtotal, iva: iva, total: subtotal + iva, costoTotal: (Number(it.costo) || 0) * cant };
  }

  function totals(q) {
    var t = { subtotal: 0, iva: 0, total: 0, costo: 0 };
    included(q).forEach(function (it) {
      var c = lineCalc(it, q.redondeo);
      t.subtotal += c.subtotal; t.iva += c.iva; t.total += c.total; t.costo += c.costoTotal;
    });
    t.utilidad = t.subtotal - t.costo;
    t.margen = t.subtotal ? t.utilidad / t.subtotal : 0;
    return t;
  }

  function included(q) { return q.items.filter(function (it) { return it.incluir && it.codigo; }); }
  function excluded(q) { return q.items.filter(function (it) { return !(it.incluir && it.codigo); }); }

  var fmtMoney = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  function money(n) { return fmtMoney.format(Number(n) || 0); }
  function fecha(iso) {
    var d = iso ? new Date(iso) : new Date();
    return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  function addDays(iso, days) { var d = new Date(iso); d.setDate(d.getDate() + (Number(days) || 0)); return d.toISOString(); }
  function safeName(s) { return Matcher.stripAccents(s || '').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').slice(0, 40); }
  function fileBase(q) { return (q.numero || 'COT') + '_' + safeName(q.cliente.nombre); }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- Excel ----------

  async function toExcel(q, settings) {
    var emp = settings.empresa;
    var wb = new ExcelJS.Workbook();
    wb.creator = emp.nombre;
    wb.created = new Date();
    var ws = wb.addWorksheet('Cotización', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    var calc = wb.addWorksheet('Cálculo interno');
    var items = included(q);
    var blue = 'FF0D3A5C', light = 'FFDDF0F4';
    var border = { top: { style: 'thin', color: { argb: 'FFB0B0B0' } }, bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      left: { style: 'thin', color: { argb: 'FFB0B0B0' } }, right: { style: 'thin', color: { argb: 'FFB0B0B0' } } };
    var moneyFmt = '"$"#,##0';

    ws.columns = [{ width: 6 }, { width: 14 }, { width: 46 }, { width: 16 }, { width: 10 }, { width: 15 }, { width: 8 }, { width: 16 }, { width: 14 }, { width: 16 }];

    if (emp.logo) {
      try {
        var ext = /^data:image\/(png|jpe?g)/.exec(emp.logo);
        if (ext) {
          var imgId = wb.addImage({ base64: emp.logo, extension: ext[1] === 'png' ? 'png' : 'jpeg' });
          ws.addImage(imgId, { tl: { col: 8, row: 0 }, ext: { width: 150, height: 70 } });
        }
      } catch (e) { /* logo opcional */ }
    }
    ws.mergeCells('A1:G1'); ws.getCell('A1').value = emp.nombre; ws.getCell('A1').font = { bold: true, size: 16, color: { argb: blue } };
    ws.mergeCells('A2:G2'); ws.getCell('A2').value = emp.nit ? 'NIT: ' + emp.nit : (emp.lema || '');
    ws.mergeCells('A3:G3'); ws.getCell('A3').value = [emp.direccion, emp.ciudad].filter(Boolean).join(' - ');
    ws.mergeCells('A4:G4'); ws.getCell('A4').value = [emp.telefono && 'Tel: ' + emp.telefono, emp.email, emp.web].filter(Boolean).join('  |  ');

    ws.mergeCells('A6:J6');
    ws.getCell('A6').value = 'COTIZACIÓN N° ' + q.numero + (q.estado === 'aprobada' ? '' : '  (BORRADOR)');
    ws.getCell('A6').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    ws.getCell('A6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } };
    ws.getCell('A6').alignment = { horizontal: 'center' };

    var info = [
      ['Cliente:', q.cliente.nombre, 'Fecha:', fecha(q.fecha)],
      ['NIT / CC:', q.cliente.nit || '', 'Válida hasta:', fecha(addDays(q.fecha, q.validezDias))],
      ['Contacto:', [q.cliente.contacto, q.cliente.telefono, q.cliente.email].filter(Boolean).join(' - '), 'Ciudad:', q.cliente.ciudad || '']
    ];
    info.forEach(function (r, i) {
      var row = 7 + i;
      ws.getCell('A' + row).value = r[0]; ws.getCell('A' + row).font = { bold: true };
      ws.mergeCells('B' + row + ':E' + row); ws.getCell('B' + row).value = r[1];
      ws.mergeCells('F' + row + ':G' + row); ws.getCell('F' + row).value = r[2]; ws.getCell('F' + row).font = { bold: true };
      ws.mergeCells('H' + row + ':J' + row); ws.getCell('H' + row).value = r[3];
    });
    ws.getCell('B7').font = { bold: true, size: 12 };

    var head = 11;
    var headers = ['Ítem', 'Código', 'Descripción', 'Presentación', 'Cantidad', 'Precio unitario', 'IVA %', 'Subtotal', 'Valor IVA', 'Total'];
    ws.getRow(head).values = headers;
    ws.getRow(head).eachCell(function (c) {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = border;
    });

    // Hoja de cálculo interno: costo y factor editables -> precio
    calc.columns = [{ width: 6 }, { width: 14 }, { width: 46 }, { width: 14 }, { width: 10 }, { width: 15 }, { width: 11 }, { width: 15 }, { width: 50 }, { width: 22 }, { width: 10 }];
    calc.getRow(1).values = ['Ítem', 'Código', 'Descripción', 'Costo unitario', 'Factor', 'Precio venta', 'Margen %', 'Utilidad unit.', 'Observación', 'Redondear al múltiplo de', Number(q.redondeo) || 0.01];
    calc.getRow(1).eachCell(function (c, col) {
      if (col <= 9) { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } }; c.border = border; }
    });
    calc.getCell('J1').font = { bold: true };
    calc.getCell('K1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    calc.getCell('J3').value = 'Precio = REDONDEAR.MAS(Costo / Factor). Factor entre 0,01 y 1,00 (1 = precio igual al costo).';
    calc.getCell('J3').font = { italic: true, color: { argb: 'FF666666' } };

    items.forEach(function (it, i) {
      var r = head + 1 + i, cr = 2 + i;
      var c = lineCalc(it, q.redondeo);
      calc.getRow(cr).values = [i + 1, it.codigo, it.descripcion, Number(it.costo) || 0, Number(it.factor)];
      calc.getCell('F' + cr).value = { formula: 'IF(AND(E' + cr + '>0,E' + cr + '<=1),CEILING(D' + cr + '/E' + cr + ',$K$1),0)', result: c.precio };
      calc.getCell('G' + cr).value = { formula: '1-E' + cr, result: 1 - it.factor };
      calc.getCell('H' + cr).value = { formula: 'F' + cr + '-D' + cr, result: c.precio - it.costo };
      calc.getCell('D' + cr).numFmt = moneyFmt; calc.getCell('F' + cr).numFmt = moneyFmt; calc.getCell('H' + cr).numFmt = moneyFmt;
      calc.getCell('E' + cr).numFmt = '0.00'; calc.getCell('G' + cr).numFmt = '0%';
      calc.getCell('E' + cr).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
      calc.getCell('E' + cr).dataValidation = { type: 'decimal', operator: 'between', allowBlank: false, formulae: [0.01, 1],
        showErrorMessage: true, errorTitle: 'Factor inválido', error: 'El factor debe estar entre 0,01 y 1,00' };
      var obs = [it.marcaPedida && 'Marca pedida: ' + it.marcaPedida + ' (se ofrece la disponible)', it.presentacion].filter(Boolean).join(' · ');
      if (obs) {
        calc.getCell('I' + cr).value = obs;
        calc.getCell('I' + cr).alignment = { wrapText: true, vertical: 'top' };
        calc.getCell('I' + cr).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: it.marcaPedida ? 'FFFFE5CC' : 'FFDDEEFF' } };
      }
      for (var k = 1; k <= 9; k++) calc.getRow(cr).getCell(k).border = border;

      var row = ws.getRow(r);
      row.values = [i + 1, it.codigo, it.descripcion + (it.marca ? ' - ' + it.marca : ''), it.unidad || '', Number(it.cantidad) || 0];
      ws.getCell('F' + r).value = { formula: "'Cálculo interno'!F" + cr, result: c.precio };
      ws.getCell('G' + r).value = Number(it.iva) || 0;
      ws.getCell('H' + r).value = { formula: 'E' + r + '*F' + r, result: c.subtotal };
      ws.getCell('I' + r).value = { formula: 'H' + r + '*G' + r + '/100', result: c.iva };
      ws.getCell('J' + r).value = { formula: 'H' + r + '+I' + r, result: c.total };
      ['F', 'H', 'I', 'J'].forEach(function (col) { ws.getCell(col + r).numFmt = moneyFmt; });
      ws.getCell('C' + r).alignment = { wrapText: true, vertical: 'top' };
      row.eachCell({ includeEmpty: true }, function (cell, col) {
        if (col <= 10) {
          cell.border = border;
          if (i % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F8FA' } };
        }
      });
    });

    var last = head + items.length;
    var tRow = last + 2;
    var t = totals(q);
    [['Subtotal', 'H', t.subtotal], ['IVA', 'I', t.iva], ['TOTAL', 'J', t.total]].forEach(function (x, k) {
      var r = tRow + k;
      ws.mergeCells('H' + r + ':I' + r);
      ws.getCell('H' + r).value = x[0];
      ws.getCell('H' + r).font = { bold: true };
      ws.getCell('H' + r).alignment = { horizontal: 'right' };
      ws.getCell('J' + r).value = items.length
        ? { formula: 'SUM(' + x[1] + (head + 1) + ':' + x[1] + last + ')', result: x[2] }
        : 0;
      ws.getCell('J' + r).numFmt = moneyFmt;
      ws.getCell('J' + r).font = { bold: true, size: k === 2 ? 12 : 11 };
      ws.getCell('J' + r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: light } };
      ws.getCell('J' + r).border = border;
    });

    var r0 = tRow;
    var cond = [
      ['Condiciones de pago:', q.condicionesPago],
      ['Tiempo de entrega:', q.tiempoEntrega],
      ['Validez de la oferta:', (q.validezDias || 0) + ' días'],
      ['Observaciones:', q.observaciones]
    ].filter(function (x) { return x[1]; });
    cond.forEach(function (x, k) {
      var r = r0 + k;
      ws.getCell('A' + r).value = x[0]; ws.getCell('A' + r).font = { bold: true };
      ws.mergeCells('C' + r + ':F' + r); ws.getCell('C' + r).value = x[1];
      ws.getCell('C' + r).alignment = { wrapText: true, vertical: 'top' };
    });
    var nr = Math.max(r0 + cond.length, tRow + 3) + 1;
    var noCot = excluded(q).filter(function (it) { return it.solicitado; });
    if (noCot.length) {
      ws.getCell('A' + nr).value = 'Ítems solicitados no cotizados:'; ws.getCell('A' + nr).font = { bold: true };
      noCot.forEach(function (it, k) { ws.mergeCells('B' + (nr + 1 + k) + ':F' + (nr + 1 + k)); ws.getCell('B' + (nr + 1 + k)).value = '• ' + it.cantidad + ' ' + it.solicitado; });
      nr += noCot.length + 2;
    }
    nr += 1;
    ws.getCell('A' + nr).value = 'Elaboró: ' + (q.elaboradoPor || settings.firmaNombre || '') + (settings.firmaCargo ? ' - ' + settings.firmaCargo : '');
    if (q.estado === 'aprobada') {
      ws.getCell('F' + nr).value = 'APROBADA por ' + q.aprobadoPor + (q.aprobadoCargo ? ' (' + q.aprobadoCargo + ')' : '') + ' el ' + fecha(q.fechaAprobacion);
      ws.getCell('F' + nr).font = { bold: true, color: { argb: 'FF2E7D32' } };
    }

    var buf = await wb.xlsx.writeBuffer();
    download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileBase(q) + '.xlsx');
  }

  // ---------- PDF ----------

  function toPdf(q, settings) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'mm', format: 'letter' });
    var emp = settings.empresa;
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    var M = 14;
    var blue = [13, 58, 92], teal = [15, 127, 168], green = [31, 154, 122];
    var aprobada = q.estado === 'aprobada';

    function header() {
      var x = M;
      if (emp.logo) {
        try {
          var props = doc.getImageProperties(emp.logo);
          var h = 20, w = Math.min(45, props.width * h / props.height);
          doc.addImage(emp.logo, M, 10, w, h);
          x = M + w + 5;
        } catch (e) { /* logo opcional */ }
      }
      doc.setTextColor(blue[0], blue[1], blue[2]); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
      doc.text(emp.nombre || '', x, 15);
      doc.setTextColor(60); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      doc.text([emp.nit ? 'NIT: ' + emp.nit : emp.lema || '', [emp.direccion, emp.ciudad].filter(Boolean).join(' - '),
        [emp.telefono && 'Tel: ' + emp.telefono, emp.email, emp.web].filter(Boolean).join('  |  ')].filter(Boolean), x, 20);

      doc.setFillColor(teal[0], teal[1], teal[2]);
      doc.roundedRect(W - M - 62, 9, 62, 20, 2, 2, 'F');
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      doc.text('COTIZACIÓN', W - M - 31, 16, { align: 'center' });
      doc.setFontSize(11); doc.text('N° ' + q.numero, W - M - 31, 23, { align: 'center' });
      doc.setTextColor(0);
    }

    header();
    // franja de marca: azul -> verde
    doc.setFillColor(teal[0], teal[1], teal[2]); doc.rect(M, 31.5, (W - 2 * M) / 2, 1, 'F');
    doc.setFillColor(green[0], green[1], green[2]); doc.rect(M + (W - 2 * M) / 2, 31.5, (W - 2 * M) / 2, 1, 'F');
    var y = 36;
    doc.setDrawColor(200); doc.setFillColor(245, 248, 252);
    doc.roundedRect(M, y, W - 2 * M, 22, 2, 2, 'FD');
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Cliente:', M + 3, y + 6); doc.text('NIT / CC:', M + 3, y + 12); doc.text('Contacto:', M + 3, y + 18);
    doc.text('Fecha:', W / 2 + 18, y + 6); doc.text('Válida hasta:', W / 2 + 18, y + 12); doc.text('Ciudad:', W / 2 + 18, y + 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(doc.splitTextToSize(q.cliente.nombre || '', W / 2 - 10)[0], M + 22, y + 6);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(q.cliente.nit || '', M + 22, y + 12);
    doc.text(doc.splitTextToSize([q.cliente.contacto, q.cliente.telefono, q.cliente.email].filter(Boolean).join(' - '), W / 2 - 10)[0] || '', M + 22, y + 18);
    doc.text(fecha(q.fecha), W / 2 + 41, y + 6);
    doc.text(fecha(addDays(q.fecha, q.validezDias)), W / 2 + 41, y + 12);
    doc.text(q.cliente.ciudad || '', W / 2 + 41, y + 18);

    var items = included(q);
    var body = items.map(function (it, i) {
      var c = lineCalc(it, q.redondeo);
      return [i + 1, it.codigo, it.descripcion + (it.marca ? '\n' + it.marca : ''), it.unidad || '', fmtQty(it.cantidad),
        money(c.precio), (Number(it.iva) || 0) + '%', money(c.total)];
    });
    doc.autoTable({
      startY: y + 27,
      head: [['#', 'Código', 'Descripción', 'Presentación', 'Cant.', 'Precio unit.', 'IVA', 'Total']],
      body: body,
      theme: 'grid',
      rowPageBreak: 'avoid',
      margin: { left: M, right: M, top: 36 },
      styles: { fontSize: 8, cellPadding: 1.6, valign: 'middle' },
      headStyles: { fillColor: teal, textColor: 255, halign: 'center' },
      alternateRowStyles: { fillColor: [242, 248, 250] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 }, 1: { cellWidth: 22 }, 3: { cellWidth: 24 }, 4: { halign: 'right', cellWidth: 12 },
        5: { halign: 'right', cellWidth: 24 }, 6: { halign: 'center', cellWidth: 11 }, 7: { halign: 'right', cellWidth: 26 }
      },
      didDrawPage: function (data) { if (data.pageNumber > 1) header(); }
    });

    var t = totals(q);
    y = doc.lastAutoTable.finalY + 4;
    if (y > H - 80) { doc.addPage(); header(); y = 40; }
    doc.autoTable({
      startY: y,
      body: [['Subtotal', money(t.subtotal)], ['IVA', money(t.iva)], ['TOTAL', money(t.total)]],
      theme: 'plain',
      margin: { left: W - M - 70, right: M },
      styles: { fontSize: 9.5, cellPadding: 1.4 },
      columnStyles: { 0: { fontStyle: 'bold', halign: 'right' }, 1: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: function (d) { if (d.row.index === 2) { d.cell.styles.fillColor = [221, 240, 244]; d.cell.styles.fontSize = 11; } }
    });

    var cond = [
      ['Condiciones de pago', q.condicionesPago], ['Tiempo de entrega', q.tiempoEntrega],
      ['Validez de la oferta', (q.validezDias || 0) + ' días'], ['Observaciones', q.observaciones]
    ].filter(function (x) { return x[1]; });
    var noCot = excluded(q).filter(function (it) { return it.solicitado; });
    if (noCot.length) cond.push(['No cotizados', noCot.map(function (it) { return it.cantidad + ' ' + it.solicitado; }).join('; ')]);
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 4,
      body: cond,
      theme: 'plain',
      margin: { left: M, right: M },
      styles: { fontSize: 8.5, cellPadding: 1.2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } }
    });

    y = doc.lastAutoTable.finalY + 16;
    if (y > H - 40) { doc.addPage(); header(); y = 50; }
    doc.setDrawColor(120);
    doc.line(M, y, M + 70, y);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text(q.elaboradoPor || settings.firmaNombre || 'Elaboró', M, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(settings.firmaCargo || '', M, y + 9.5);

    if (aprobada) {
      var bx = W - M - 75;
      doc.setDrawColor(46, 125, 50); doc.setLineWidth(0.8);
      doc.roundedRect(bx, y - 14, 75, 26, 2, 2);
      doc.setTextColor(46, 125, 50); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      doc.text('APROBADA', bx + 37.5, y - 6, { align: 'center' });
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
      doc.text(['Por: ' + q.aprobadoPor + (q.aprobadoCargo ? ' - ' + q.aprobadoCargo : ''), 'Fecha: ' + fecha(q.fechaAprobacion)],
        bx + 37.5, y + 1, { align: 'center' });
      doc.setTextColor(0); doc.setLineWidth(0.2);
    }

    // Pie y marca de agua en todas las páginas
    var pages = doc.getNumberOfPages();
    for (var p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFontSize(7.5); doc.setTextColor(130);
      doc.text(emp.nombre + ' - Cotización ' + q.numero + ' - Página ' + p + ' de ' + pages, W / 2, H - 8, { align: 'center' });
      if (!aprobada) {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.12 }));
        doc.setFontSize(80); doc.setTextColor(200, 0, 0); doc.setFont('helvetica', 'bold');
        doc.text('BORRADOR', W / 2, H / 2 + 20, { align: 'center', angle: 35 });
        doc.restoreGraphicsState();
      }
      doc.setTextColor(0);
    }
    doc.save(fileBase(q) + (aprobada ? '' : '_BORRADOR') + '.pdf');
  }

  function fmtQty(n) { return (Number(n) || 0).toLocaleString('es-CO'); }

  // ---------- Catálogo ----------

  async function catalogToExcel(products, filename) {
    var wb = new ExcelJS.Workbook();
    var ws = wb.addWorksheet('Catálogo');
    ws.columns = [
      { header: 'Codigo', key: 'codigo', width: 16 }, { header: 'Descripcion', key: 'descripcion', width: 50 },
      { header: 'Categoria', key: 'categoria', width: 18 }, { header: 'Proveedor', key: 'proveedor', width: 18 },
      { header: 'Unidad', key: 'unidad', width: 16 }, { header: 'Marca', key: 'marca', width: 16 },
      { header: 'Costo', key: 'costo', width: 14 }, { header: 'IVA', key: 'iva', width: 8 },
      { header: 'Sinonimos', key: 'sinonimos', width: 30 }
    ];
    products.forEach(function (p) { ws.addRow(p); });
    ws.getRow(1).font = { bold: true };
    ws.getColumn('costo').numFmt = '#,##0';
    var buf = await wb.xlsx.writeBuffer();
    download(new Blob([buf]), filename || 'catalogo.xlsx');
  }

  root.Exporters = {
    precioVenta: precioVenta, lineCalc: lineCalc, totals: totals, money: money, fecha: fecha,
    toExcel: toExcel, toPdf: toPdf, catalogToExcel: catalogToExcel, download: download
  };
})(window);
