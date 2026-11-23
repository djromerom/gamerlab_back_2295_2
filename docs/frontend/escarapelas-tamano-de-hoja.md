# Contrato de API · Escarapelas: tamaño de hoja del PDF

**Para:** Frontend (por definir) · **De:** Samuel Tilano (Backend)
**Ticket:** sin ticket en Jira (pedido directo, 2026-11-23) · **Rama backend:** `feat/badges-tabloid-pdf` · **Estado:** implementado y probado en local (pruebas unitarias, Gotenberg local y Swagger con Playwright); pendiente de PR a `dev`
Swagger local: `http://localhost:3000/api` (sección *Juror badges*)

## Qué cambia
- El PDF de escarapelas ahora se imprime en **tabloide** (11 × 17 in) o en **carta**, a elección del Administrador.
- La escarapela es más pequeña y lleva **solo el nombre y el QR de 5 cm**. Ya no lleva la edición ni «Jurado». Mide 5,4 × 6 cm en los dos tamaños, así que el corte es el mismo.
- Las escarapelas van pegadas, con un borde gris fino de corte, y los cortes coinciden.

| `paper` | Hoja | Escarapelas por hoja |
|---|---|---|
| `TABLOID` (por defecto) | Tabloide vertical, 11 × 17 in | 35 (5 columnas × 7 filas) |
| `LETTER` | Carta **horizontal**, 11 × 8,5 in | 15 (5 columnas × 3 filas) |

## Ruta
`GET /juror-badges/pdf?paper=TABLOID|LETTER&jurorIds=id1,id2`

- `paper`: **nuevo** y opcional. Si no se envía, sale en tabloide.
- `jurorIds`: sin cambios (ids separados por coma; sin el parámetro van todas las escarapelas de la edición activa).
- Respuesta `200`: archivo `application/pdf`. El nombre cambia según el tamaño: `escarapelas-tabloide.pdf` o `escarapelas-carta.pdf` (antes `escarapelas.pdf`). El nombre viene en `Content-Disposition` (expuesto por CORS).

## Errores
- **400** si `paper` trae otro valor: `message` es una lista con `"paper debe ser TABLOID o LETTER."`.
- **401** sin sesión · **403** si no es Administrador (servicio `ManageJurorBadges`, sin cambios).
- **404** «No hay escarapelas para generar. Genera las escarapelas primero.» (sin cambios).

## Qué hace el front
1. En la pantalla de escarapelas, junto a **Descargar PDF**, un selector **«Tamaño de hoja»** con dos opciones: «Tabloide (35 por hoja)», que va seleccionada por defecto, y «Carta (15 por hoja)».
2. Enviar el valor en `paper` tanto al descargar todas como al descargar las seleccionadas.
3. Sugerencia: en el texto de ayuda, avisar que se imprime al **100 % (tamaño real, sin «ajustar a la página»)** para que el QR mida 5 cm.
4. Si el front pone su propio nombre al archivo, usar el de `Content-Disposition` o agregar el tamaño al nombre.

## Compatibilidad
Un front que no envíe `paper` sigue funcionando y recibe tabloide. No hay migración ni permisos nuevos.
