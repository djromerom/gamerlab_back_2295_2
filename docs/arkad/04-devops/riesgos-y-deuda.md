# Riesgos y deuda técnica DevOps

> **Audiencia:** DevOps, Scrum Master · **Actualizado:** 2026-11-05 · **Estado:** completo según Santiago (hallazgos del 23-oct; el estado actual de cada uno se marca) · **Fuente:** `contexto-devops-arkad.md` §7, §9; `ark-43-seguimiento.md`

## P0 (abiertos)
1. **`main.yml` legado en los dos repos receptores.** Puede detener producción si se dispara. En el back detiene `arkad-api`; en `openlabun/Arkad-Front` detiene `arkadn` (puerto 5035, no documentado; > A CONFIRMAR si sigue vivo en el servidor). Acción: *Actions → Disable workflow* en ambos y eliminarlos por PR.
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
10. Documentación vieja (README del repo openlab, descripción `[sha-**-api]`).
11. Decidir si el repo openlab seguirá siendo copia completa del back o solo workflows + README.
12. La imagen de front se reconstruye por ambiente (variables `VITE_*` horneadas): test aprobado no garantiza el build de prod.
13. Imágenes de producción en un repo de Docker Hub llamado `-test`.

## Backlog DevOps sugerido
- [ ] Deshabilitar y eliminar `main.yml` en ambos receptores; confirmar si `arkadn` sigue vivo.
- [ ] Corregir `test-deploy.yml`/`prod-deploy.yml` (puntos 3–8).
- [ ] CI en PR con checks obligatorios en ramas; reglas de protección y `CODEOWNERS`; rulesets de tipo de merge.
- [ ] Verificar/cargar históricos en test y producción (197 equipos / 723 integrantes / 197 juegos) con respaldo previo. **Estado en prod no confirmado.**
- [ ] Backup automático de BD antes de migraciones en producción.
- [ ] Reemplazar el PAT classic por uno fine-grained o una GitHub App.
- [ ] Limpieza de repos (`cookies.txt`, `output.sql`, `big-seed.py`, `init-db.sql` en el back).
- [ ] Tests unitarios (hoy 6 de 119 fallan y hay `continue-on-error`) e integración (TA-10, TA-11).
- [ ] Actualizar el diagrama de despliegue.

## Ticket de limpieza propuesto (TA-08)
- Variables que el código ya no lee: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_JWT_SECRET`, `DIRECT_URL`, `EMAIL_SERVICE_ID`, `PUPPETEER_EXECUTABLE_PATH`, `AZURE_BLOB_SAS_URL`.
- GitHub Secrets sin uso en back y front (lista en `ark-43-seguimiento.md`).
- Decisiones pendientes: Supabase en el front (`src/supabase/client.ts` no se usa pero falla sin sus variables) y `VITE_MAINTENANCE_*` (no las inyecta el pipeline).
- Módulos candidatos a retirar: back (`nestjs-supabase-auth`, `nest`, `multer`, `ts-loader`, …) y front (`@radix-ui/themes`, `dotenv`, `react-error-boundary`, `@types/js-cookie`). Detalle en `TA-02-docker-compose-build.md`.

## Preguntas abiertas
1. ¿Quién administra `openlabun/Arkad-Front`, la organización `openlabun` y el proxy/red del servidor?
2. ¿Por qué hay llaves distintas (con y sin passphrase) en test y prod del back, y la misma en el front?
3. ¿El seed es idempotente en cada ambiente? (En prod se salta con `NODE_ENV=production`.)
