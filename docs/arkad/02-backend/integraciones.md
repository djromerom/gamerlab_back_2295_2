# Integraciones externas

> **Audiencia:** Backend, DevOps · **Actualizado:** 2026-11-05 · **Estado:** parcial (basado en dependencias, variables de entorno y documentos de DevOps; **no se leyó el código de cada integración**) · **Fuente:** `package.json`, `.env.example`, `prueba-entrega-correos-acs.md`, `TA-02`

| Integración | Para qué | Variables (solo nombres) | Notas |
|---|---|---|---|
| **Azure Communication Services (correo)** | Confirmación de cuenta, reset de contraseña, correos de equipo y certificados | `ACS_CONNECTION_STRING`, `ACS_SENDER_ADDRESS` | Llegan a bandeja en Uninorte, Gmail y Outlook (TA-05/ARK-22). `withRetry` (3 intentos). **Modo simulación solo en `NODE_ENV=development`.** Riesgo: el reenvío distingue mayúsculas en el correo. Pendiente: verificar SPF/DKIM en el portal de Azure. EmailJS ya no existe en ningún repo |
| **Azure Blob Storage / Azurite** | Archivos subidos (logos, imágenes, videos, juegos, `.zip`) | `AZURE_ACCOUNT_NAME`, `AZURE_ACCOUNT_KEY`, `AZURE_CONTAINER`, `AZURE_STORAGE_CONNECTION_STRING` (`AZURE_BLOB_SAS_URL` obsoleta, ver TA-08) | En local: Azurite (puertos 10000-10002). Los archivos se guardan como **no públicos** por defecto (`Upload.isPublic = false`; ver BG-24 y `POST /upload/:id/public`). URLs firmadas (SAS) de lectura: `GET /upload/:id/url?ttl=` (mín. 60 s; **por defecto y máximo 3 años**, porque la URL se guarda en BD). Sin sesión solo se firma un archivo si es público (`isPublic`) o se subió hace poco (`FRESH_UPLOAD_WINDOW_MS`); si no, 403 «Este archivo no es público»; `.zip` máx. 100 MB, 3 por 10 min |
| **Gotenberg** | PDF de certificados y escarapelas (`GET /juror-badges/pdf`, `POST /certificates/...`). Las escarapelas (5,4 × 6 cm, solo nombre y QR de 5 cm) salen en tabloide, 35 por hoja, o en carta horizontal, 15 por hoja, según `paper` (`src/jurors/juror-badges/badge-template.ts`) | `GOTENBERG_URL` | Contenedor `arkad_gotenberg` en el servidor; en local lo levanta el compose |
| **Microsoft Entra ID** | Login con Microsoft (`/auth/outlook-login`, `/auth/callback`) | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `REDIRECT_URI` | **El secreto de cliente caduca**: anotar la fecha ([variables-y-accesos](../04-devops/variables-y-accesos.md)) |
| **reCAPTCHA** | Registro público | `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_URL`, `RECAPTCHA_SCORE` | El front usa `VITE_SITE_KEY` (par de claves) |
| **Socket.IO** | Likes y seguimiento en tiempo real | `SOCKET_KEY_SECRET` | `IoAdapter` en `main.ts` |
| **Excel / QR / ZIP** | `exceljs` (reportes), `qrcode` (escarapelas), `jszip` | — | Sin servicio externo |
| **Fecha del evento** | Texto de certificados | `EVENT_DATE_TEXT`, `EVENT_TIME_TEXT`, `EVENT_PLACE_TEXT` | El año del certificado es el de la edición activa |

## Variables obsoletas (ya no las lee el código; TA-18 / ARK-175)
`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_JWT_SECRET`, `DIRECT_URL`, `EMAIL_SERVICE_ID`, `PUPPETEER_EXECUTABLE_PATH`, `AZURE_BLOB_SAS_URL`.

El 2026-11-10 se quitó `AZURE_BLOB_SAS_URL` del `.env` de test y prod (la única de la lista que seguía ahí) y se revocó su SAS.

## Comportamiento ante fallos (leído de `origin/main`)
| Si falla… | Qué pasa |
|---|---|
| Azure ACS (correo) | `sendEmail` reintenta con `withRetry`; si sigue fallando lanza `ServiceUnavailableException` (503). Sin configurar y fuera de `development` también 503 («El servicio de correo no está configurado»): **no simula** el envío. Afecta confirmación de cuenta, reset de contraseña y certificados |
| Gotenberg | `convertHtmlToPdf` lanza 500 si falta `GOTENBERG_URL` o si el servicio responde error. Afecta escarapelas en PDF y certificados; el check-in por QR **no depende** de Gotenberg |
| Azure Blob | Las subidas y la lectura de archivos fallan; el resto de la API sigue. Ver [pipeline](../04-devops/pipeline-y-despliegue.md) para el contenedor |
| Entra ID | Falla solo el login con Microsoft; el login con correo y contraseña sigue |

Plantillas Handlebars: `src/email/templates/` (correos y certificados) y certificados armados en `certificates.service.ts` (`generateCertificateHtml`, `generateJurorCertificateHtml`).

> PENDIENTE (operativo): plan de contingencia del día de la feria si Azure o Gotenberg caen (por ejemplo, tener las escarapelas ya generadas con anticipación). Ver [calendario-feria](../05-scrum-y-proceso/calendario-feria.md).
