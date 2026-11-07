# Runbook: promoción `dev` → `main` (producción)

> **Audiencia:** DevOps · **Actualizado:** 2026-11-05 · **Estado:** completo como plantilla (derivada de las promociones del 4 y 5-nov) · **Fuente:** `05-referencia-promociones-y-pruebas/promocion-main-2026-11-04.md` y `-05.md`

## Reglas fijas
- Promoción de `dev` (back) y `dev-deploy` (front) a `main` con **merge commit, nunca squash**.
- No usar «Update branch» ni hacer hotfix directo a `main`.
- Tras promocionar, `main` tiene commits de merge que `dev` no tiene: hacer PR `main → dev` y `main → dev-deploy` **antes de la siguiente promoción** (igualación).
- Producción solo se toca con respaldo previo y plan de vuelta atrás.

## 1. Precheck (solo lectura)
1. Anotar imágenes actuales de prod y **etiquetarlas** para rollback: `arkad-rollback/api:pre-<fecha>` y `arkad-rollback/front:pre-<fecha>`.
2. Anotar migraciones aplicadas (`_prisma_migrations`: total y última; ninguna sin terminar).
3. Anotar estado de datos relevante (ediciones, equipos, integrantes, evaluaciones) para comparar después.
4. **Respaldo:** `pg_dump -Fc --no-owner --no-acl` de la BD de prod a `~/Arkad-api-prod/backups/pre-promocion-<fecha>.dump`; registrar tamaño y sha256. Si hay notas/ranking, guardar foto en CSV.

## 2. Ensayo de migraciones
Base desechable (`ensayo_prod`) en el Postgres de **test**: restaurar el dump con `pg_restore --no-owner --no-acl`, correr `prisma migrate deploy` con la imagen candidata en la red de test (con `DATABASE_URL` apuntando a la base de ensayo) y verificar conteos, índices únicos y permisos nuevos. Borrar la base después. Copia local de dumps: `scp` y `shred` en el servidor (ver [base de datos](base-de-datos-operacion.md)).

## 3. Ejecución
1. Abrir PR `dev → main` (back) y `dev-deploy → main` (front); checks en verde (back: test-build, integration, docker-image; front: test-build, docker-image).
2. **Back primero**, luego front. Merge con **merge commit**.
3. Esperar el deploy (~2 min de build + segundos en el servidor): verificar con `gh run list --branch main` antes de concluir que no desplegó.
4. Recrear/verificar el contenedor: `arkad-api` con el nuevo tag `sha-<7>-api_prod`; `arkad` con `sha-<7>-frontend_prod`.

## 4. Verificación posterior
- `_prisma_migrations`: total esperado, 0 sin terminar, última esperada. **Revisar el log**: `entrypoint.sh` corre sin `set -e` y la app arranca aunque una migración falle.
- Conteos de datos iguales a los del ensayo; notas iguales a la foto previa.
- API pública responde 200 (`GET /editions`, `GET /teams`).
- Prueba de humo con sesión de administrador (> PENDIENTE en las promociones previas: faltaban credenciales de prod).
- Tip: `docker ps | grep 'arkad$'` no sirve (la línea termina en el estado); usar `grep -E '^(NAMES|arkad )'`.

## 5. Vuelta atrás
- **Sin migraciones de por medio:** recrear con la imagen anterior (`sha-<anterior>-api_prod` o la etiqueta `arkad-rollback/*`).
- **Con migraciones destructivas:** imagen anterior **y** restaurar el dump (se pierde lo registrado después). Ejemplo: volver atrás tras ARK-128 exige restaurar el dump porque `integrante.id_edicion` es obligatoria.

## Historial de promociones

| Fecha | PR back / front | Resultado |
|---|---|---|
| 2026-11-02 | back #213, front #225 | Primera promoción |
| 2026-11-04 | back #228 (`0d5d992`), front #238 (`1818a1a`); luego back #232 (`b2a7135`, sin migraciones) | Prod pasa a 59 migraciones |
| 2026-11-05 | back #246 (`bcfe237`), front #252 (`5b70d2e`) | Prod pasa a 61 migraciones |

## Pendientes de producción conocidos (a 2026-11-05)
- Prueba de humo con admin.
- Cargar NRC y ponderados de la edición 5 (sin NRC nadie completa la inscripción).
- `~/Arkad-api-prod/.env` con permisos 644: recomendado `chmod 600`.
- `GET /teams` sin parámetro devuelve solo la edición activa: revisar galería pública y tablero de puntajes.
- Igualación `main → dev` / `main → dev-deploy`.
- Duda para el PO: ¿los equipos externos compiten por el podio?

Detalle completo: promoción 2026-11-04 y 2026-11-05.
