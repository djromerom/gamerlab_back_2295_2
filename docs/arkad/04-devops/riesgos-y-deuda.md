# Riesgos y deuda técnica DevOps

> **Audiencia:** DevOps, Scrum Master · **Actualizado:** 2026-11-10 · **Estado:** completo según Santiago (hallazgos del 23-oct; el estado actual de cada uno se marca) · **Fuente:** `contexto-devops-arkad.md` §7, §9; `ark-43-seguimiento.md`

## P0 (abiertos)
1. **`main.yml` legado en los dos repos receptores (deshabilitados el 2026-11-10; falta eliminarlos).** Podían detener producción con un push a `main`: en el back detiene `arkad-api`; en `openlabun/Arkad-Front` detiene `arkadn` (puerto 5035, no documentado; > A CONFIRMAR si sigue vivo en el servidor). Quedaron deshabilitados (`Deploy_back` en `openlabun/Arkad-Api`, `Deploy` en `openlabun/Arkad-Front`; reversible con *Enable workflow*). Acción pendiente: eliminarlos por PR en cada receptor.
2. **Credenciales expuestas.** Existen en un `credenciales.txt` y la llave privada circuló por chats. Decisión consciente del 2026-11-05: **no rotar** en V4 (llave SSH del CI, admin prod, Gmail). La exposición sigue vigente; la V5 debe decidir. Ver [variables-y-accesos §5.E](variables-y-accesos.md).

## P1
3. Los receptores interpolan el tag directo en el script SSH (inyección de comandos): pasarlo por `envs:` y validar con regex (`^sha-[0-9a-f]{7}-api_dev$`, etc.).
4. `appleboy/ssh-action@master` sin fijar: fijar a versión o SHA.
5. `docker stop/rm` **antes** de `docker pull`: si el tag falla, el ambiente queda caído. Invertir el orden.
6. Mismo nombre de evento para back y front: filtrar por sufijo de tag (`-api_dev`, `-frontend_dev`, `-api_prod`, `-frontend_prod`).
7. Sin aprobación en producción (usar `environment: production` con *Required reviewers*); sin respaldo automático de BD antes del deploy.
8. Sin `concurrency` en workflows; doble `--network` en `docker run`.
9. `Deploy-front`: en `workflow_dispatch` el checkout usa la rama desde la que se lanza, no `target_branch`; `no-cache: true`; sin lint/build/tests antes de publicar; secretos `_TEMP` en producción.

## P2
10. Documentación vieja (README de `openlabun/Arkad-Api`, descripción `[sha-**-api]`).
11. Decidir si `openlabun/Arkad-Api` seguirá siendo copia completa del back o solo workflows + README.
12. La imagen de front se reconstruye por ambiente (variables `VITE_*` horneadas): test aprobado no garantiza el build de prod.
13. Imágenes de producción en un repo de Docker Hub llamado `-test`.

## Backlog DevOps sugerido
- [x] Deshabilitar `main.yml` en ambos receptores (2026-11-10).
- [ ] Eliminar `main.yml` de ambos receptores por PR; confirmar si `arkadn` sigue vivo.
- [ ] Corregir `test-deploy.yml`/`prod-deploy.yml` (puntos 3–8).
- [ ] CI en PR con checks obligatorios en ramas; reglas de protección y `CODEOWNERS`; rulesets de tipo de merge.
- [ ] Verificar/cargar históricos en test y producción (197 equipos / 723 integrantes / 197 juegos) con respaldo previo. **Estado en prod no confirmado.**
- [ ] Backup automático de BD antes de migraciones en producción.
- [ ] Reemplazar el PAT classic por uno fine-grained o una GitHub App.
- [ ] Limpieza de repos (`cookies.txt`, `output.sql`, `big-seed.py`, `init-db.sql` en el back).
- [ ] Tests unitarios (hoy 6 de 119 fallan y hay `continue-on-error`) e integración (TA-10, TA-11).
- [ ] Actualizar el diagrama de despliegue.

## Limpieza de variables y secretos (TA-18 / ARK-175, 10-nov)
- Variables retiradas (el código ya no las lee): `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_JWT_SECRET`, `DIRECT_URL`, `EMAIL_SERVICE_ID`, `PUPPETEER_EXECUTABLE_PATH`, `AZURE_BLOB_SAS_URL`.
- GitHub Secrets sin uso borrados en back, front y en los dos receptores: `Arkad-Front` quedó con 8 secretos y `Arkad-Api` pasó de 74 a 11. En `Arkad-Api` se dejan a propósito `DATABASE_URL_PROD_TEMP`, `DATABASE_URL_TEST` y `ENV_FILE_TEST` (ningún workflow activo los usa).
- `AZURE_BLOB_SAS_URL` era la única variable sobrante en el `.env` de test y prod; se quitó el 2026-11-10 y se revocó su SAS. Las demás candidatas ya no estaban en el servidor.
- Resuelto en el front: se retiró Supabase (módulo, dependencia y `VITE_SUPABASE_*`) y `MaintenancePage` con `VITE_MAINTENANCE_*`.
- Dependencias retiradas en ARK-175: front `dotenv`, `react-error-boundary`, `@radix-ui/themes`, `@types/js-cookie` y los paquetes de Radix que solo usaban archivos sin uso; back `nest`, `nestjs-supabase-auth`, `swagger-ui-express`, `ts-loader`, `source-map-support`, `@eslint/eslintrc` y `@types/image-size`. También se borraron 26 archivos del front y 14 del back sin referencias. Quedan por verificar los demás candidatos de `TA-02-docker-compose-build.md` (por ejemplo `multer`).
- El back importa `@azure/core-rest-pipeline` sin declararla en `package.json` (funciona como dependencia transitiva).

## Preguntas abiertas
1. ¿Quién administra `openlabun/Arkad-Front`, la organización `openlabun` y el proxy/red del servidor?
2. ¿Por qué hay llaves distintas (con y sin passphrase) en test y prod del back, y la misma en el front?
3. ¿El seed es idempotente en cada ambiente? (En prod se salta con `NODE_ENV=production`.)
