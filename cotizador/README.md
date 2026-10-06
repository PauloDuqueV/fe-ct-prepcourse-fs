# Cotizador: homologación de solicitudes y cotizaciones

Herramienta web para el área de cotizaciones. Funciona en el navegador, no necesita servidor y guarda los datos en el mismo equipo.

## Qué hace

1. **Lee la solicitud del cliente en cualquier formato.** Acepta texto pegado de WhatsApp o del correo, Excel/CSV, Word (.docx), PDF y fotos o capturas, que se leen con OCR en español. Las capturas se pueden pegar con Ctrl+V.
2. **Homologa cada línea con el catálogo.** Busca coincidencias por palabras, abreviaturas (cj, und, fco, pba…), tallas, medidas y colores de tapa, y también por el código si el cliente lo escribió. Cada línea sale con un semáforo de confianza y con otras opciones para cambiar el producto con un clic.
3. **Aprende.** Al guardar una cotización recuerda qué producto corresponde a cada texto del cliente y qué factor se usó con ese cliente.
4. **Calcula el precio** con la fórmula `precio = costo ÷ factor`, donde el factor va de 0,01 a 1,00 en pasos de 0,01 (0,10 · 0,20 · 0,35 · 0,50 · 0,56 …). El factor 1,00 da el precio igual al costo; el 0 no se permite porque no se puede dividir por cero. El factor se puede poner a todos, a los marcados o línea por línea, y se puede redondear hacia arriba a $1, $10, $50, $100 o $1.000.
5. **Maneja precios por cliente.** El factor de cada producto se elige en este orden:
   1. el factor recordado para ese producto con ese cliente;
   2. el factor del cliente para esa categoría (por ejemplo, Guantes 0,80 o Reactivos 0,65);
   3. el factor general del cliente;
   4. el factor global.
6. **Aplica las reglas comerciales de la empresa**:
   - **Marca distinta** (fila **naranja claro**): si el cliente pide una marca (ABBOTT, BD, ALBOR…, en el texto o en la columna de requisito) y el producto del catálogo es de otra, se cotiza la marca disponible y la fila queda marcada.
   - **Presentación distinta** (fila **azul claro**): entre productos parecidos se elige la presentación más cercana a la pedida y se ajusta la cantidad (pide 1 L y hay frascos de 500 ml → 2 frascos; pide caja x 50 y hay x 25 → el doble). En tubos y jeringas el volumen es una característica: se avisa pero no se cambia la cantidad.
   - **Unidades del cliente**: 1 gradilla = 100 tubos, 1 ciento = 100, 1 docena = 12.
   - **Equivalencias propias** (Configuración): "guardian grande = guardian 2.9", etc. Se pueden agregar más.
   - **Productos que no están en el catálogo**: botón **+ Registrar producto** en la línea; se cotiza y, si quiere, queda guardado en el catálogo con código `MAN-0001`…
   Las observaciones de marca y presentación salen en la hoja *Cálculo interno* del Excel.
7. **Exporta**:
   - **Excel modificable**, con dos hojas. La hoja *Cotización* es la que ve el cliente. La hoja *Cálculo interno* trae el costo, el factor, el margen y la utilidad. Si cambia un factor en esa hoja, el precio, el IVA y el total se recalculan solos.
   - **PDF**, con la marca de agua "BORRADOR" hasta que alguien aprueba la cotización. Al aprobarla se pide el nombre y el cargo de quien aprueba, y el PDF final sale con el sello **APROBADA** y la fecha. Si se edita una cotización ya aprobada, vuelve a borrador.
8. **Historial** con consecutivo automático (COT-0001…), para abrir, duplicar o volver a descargar cualquier cotización.

El nombre del cliente es obligatorio y aparece en el Excel y en el PDF.

## Cómo usarla

1. Abra `index.html` en Chrome o Edge. Necesita internet la primera vez para cargar las librerías.
   Para que la usen varias personas se puede publicar gratis en GitHub Pages (Settings → Pages) o en cualquier hosting estático.
2. **Configuración:** escriba los datos de la empresa, suba el logo, el nombre de quien elabora y los valores por defecto (factor, IVA, validez, condiciones de pago, consecutivo).
3. **Catálogo:** importe las listas de proveedores en Excel o CSV. Las columnas se reconocen aunque cambie el nombre:

   | Columna | También se reconoce como |
   |---|---|
   | Código | Ref, Referencia, SKU |
   | Descripción | Producto, Nombre, Artículo |
   | Categoría | Área, Línea, Grupo, Familia |
   | Proveedor | Fabricante, Laboratorio |
   | Unidad | Presentación, Empaque |
   | Marca | |
   | Costo | Precio costo, Valor unitario |
   | IVA | % IVA |
   | Sinónimos | Palabras clave |

   Se leen todas las hojas del archivo. Si una hoja tiene varias tablas con títulos de sección (por ejemplo "SEROLOGÍA" o "LÁTEX"), cada título se usa como categoría. Si el producto no tiene código, se genera uno estable (por ejemplo `IPR-0017`) y, al volver a importar la lista, el producto se reconoce por su descripción. El IVA puede venir como 0,19 o como 19 %; si el archivo no lo trae, se usa el que indique al importar.

   Los modos de importación son: actualizar o agregar por código, reemplazar solo los productos de un proveedor, o reemplazar todo. El botón *Descargar plantilla* entrega el formato. En **Sinónimos** puede escribir cómo suelen pedir el producto los clientes (por ejemplo "tubo morado hemograma"), y eso mejora mucho la homologación.
4. **Clientes:** defina el factor general y los factores por categoría de cada cliente. Los clientes nuevos se crean solos al guardar una cotización.
5. **Cotizar:**
   1. Escriba el cliente.
   2. Cargue o pegue la solicitud.
   3. Revise las líneas en naranja o rojo.
   4. Ajuste los factores.
   5. Guarde y descargue el Excel o el PDF.
   6. Apruebe la cotización.

La carpeta `ejemplos/` trae solicitudes de prueba en todos los formatos y una lista de proveedor. Con **Catálogo → Cargar catálogo de ejemplo** se puede probar todo sin datos reales.

## Lectura con IA (opcional)

El OCR local funciona bien con fotos nítidas de texto impreso. Para fotos torcidas, letra a mano, PDF escaneados o mensajes muy desordenados, se puede activar la lectura con Claude:

- En **Configuración**, pegue una API key de Anthropic (console.anthropic.com). La clave queda solo en ese navegador y no se incluye en las copias de seguridad.
- Marque **Leer con IA** antes de procesar una solicitud.
- El botón **✨ Revisar dudosos con IA** hace que la IA elija, entre los candidatos del catálogo, el producto correcto para las líneas con poca confianza.

Cada uso de la IA tiene un costo según el consumo de la API.

## Datos y copias de seguridad

Todo se guarda en el almacenamiento local del navegador: catálogo, clientes, cotizaciones y homologaciones aprendidas. Use **Configuración → Exportar copia** con frecuencia, y también para pasar los datos a otro equipo con *Restaurar copia*. Si se borran los datos del navegador, se pierde la información que no tenga copia.

## Estructura

```
index.html          interfaz
css/styles.css      estilos
js/matcher.js       homologación (normalización, vocabulario de laboratorio, puntaje)
js/catalog.js       importación de listas de proveedores
js/rules.js         reglas comerciales (marca, presentación, equivalencias)
js/parsers.js       lectura de texto/WhatsApp, Excel, Word, PDF y OCR de imágenes
js/exporters.js     cálculo de precios, Excel con fórmulas y PDF
js/ai.js            lectura opcional con Claude
js/store.js         almacenamiento local
js/app.js           lógica de la interfaz
vendor/             SDK de Anthropic empaquetado para el navegador
ejemplos/           archivos de prueba
tests/              pruebas automáticas (npx jest cotizador/tests)
```
