# Homelab · Ruta de Muestras — Instalación

Plataforma web para la recolección, despacho, recepción y cuadre de caja de muestras.
Se abre desde el celular con un link, sin cuentas: se entra con un PIN.
Los datos quedan en una hoja de Google Sheets de la empresa.

**Archivos:**
- `Code.gs`: el servidor.
- `Index.html`: la página.

Tiempo estimado: 10 minutos.

---

## 1. Crear la hoja de cálculo

1. Con la cuenta de Google de la empresa, abre <https://sheets.new>.
2. Ponle de nombre: **Homelab – Ruta de Muestras**.

## 2. Pegar el código

1. En la hoja, ve al menú **Extensiones → Apps Script**.
2. Verás un archivo `Código.gs`. Borra todo su contenido y pega **todo** el contenido de `Code.gs`.
3. Al lado de **Archivos**, haz clic en **+** → **HTML** y ponle de nombre exactamente `Index`, sin “.html”.
4. Borra lo que trae y pega **todo** el contenido de `Index.html`.
5. Guarda con el ícono 💾 o con Ctrl+S.

## 3. Instalar las hojas (una sola vez)

1. Arriba, en el selector de funciones, elige **instalar** y pulsa **Ejecutar**.
2. Google pide permisos:
   1. Pulsa **Revisar permisos** y elige tu cuenta.
   2. Pulsa **Configuración avanzada** → **Ir a … (no seguro)** → **Permitir**.

   Es normal: el código es tuyo y solo accede a esta hoja.
3. Vuelve a la hoja de cálculo. Ya están creadas las pestañas Config, Zonas, Clientes, Puntos, Recolecciones y Envios, con:
   - la zona **San Juan (Chocó)** y su mensajero **Daniel**;
   - los **10 clientes** de Istmina, Tadó y Condoto;
   - los 4 puntos de recogida en Medellín.

## 4. Cambiar los PIN y poner el logo

En la pestaña **Config**:

| clave | qué es |
|---|---|
| `PIN_MENSAJEROS` | PIN de Daniel y de los mensajeros de Medellín. **Cámbialo** (mínimo 6 dígitos). |
| `PIN_ADMIN` | PIN de administración: tablero, cuadres y configuración. **Cámbialo.** |
| `LOGO_URL` | Opcional. Sube el logo a Google Drive y compártelo como *Cualquier persona con el enlace*. Luego pega aquí ese enlace. Si lo dejas vacío, se muestra “Homelab · Cerca de ti” con los colores de la marca. |

## 5. Publicar el link

1. En Apps Script, pulsa **Implementar → Nueva implementación**.
2. En el engranaje ⚙️, elige **Aplicación web**.
3. Configúrala así:
   - **Ejecutar como:** *Yo*.
   - **Quién tiene acceso:** *Cualquier usuario*.
4. Pulsa **Implementar** y copia la **URL de la aplicación web**, la que termina en `/exec`.
5. Ese es el link. Envíalo por WhatsApp a Daniel y a los mensajeros de Medellín.

> **En el celular:** abre el link en Chrome (Android) o Safari (iPhone) y usa **Agregar a pantalla de inicio**.
> Queda como un ícono de app.
>
> Google muestra arriba una franja gris que dice “Esta aplicación la creó un usuario de Google Apps Script”.
> Es normal en este tipo de páginas.

## 6. Uso diario

- **Daniel (Mensajero zona):**
  1. Registra cada recogida: muestras, valor, efectivo o crédito y temperatura.
  2. Confirma el despacho: bus o avión, empresa, guía, horas, neveras y costo.
  3. Envía el aviso y el cuadre de caja por WhatsApp con un botón.
  4. Cierra el cuadre del día.
- **Mensajeros de Medellín:** marcan “Recogí el envío” en el aeropuerto o la terminal y luego “Entregado en laboratorio”.
- **Administración:**
  - Sigue la operación en tiempo real; la pantalla se actualiza cada 20 segundos.
  - Revisa las alertas: retrasos, diferencias de neveras o muestras, temperatura fuera de 2–8 °C y novedades.
  - Consulta el cuadre consolidado y el crédito por cobrar.
  - Crea zonas y clientes.
- Todo queda también en las pestañas **Recolecciones** y **Envios** de la hoja, para filtrar o descargar en Excel.

## Actualizar a una versión nueva

1. Pega el código nuevo.
2. Ve a **Implementar → Gestionar implementaciones** y pulsa el lápiz ✏️.
3. En **Versión**, elige **Nueva versión** y pulsa **Implementar**.

El link sigue siendo el mismo.
