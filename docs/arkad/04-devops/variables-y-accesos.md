# Variables de entorno y accesos

> **Audiencia:** DevOps, Scrum Master · **Actualizado:** 2026-11-05 · **Estado:** completo · **Fuente:** `02-servidor-y-accesos/variables-y-accesos.md` (ARK-43 / TA-07)
>
> **Este documento no contiene secretos y nunca debe contenerlos.** Dice *dónde* vive cada cosa, *quién* la custodia y *cómo* se rota. Si ves un valor real aquí, bórralo y rota ese valor.

## 1. Fuente de verdad por dato

| Pregunta | Dónde mirar |
|---|---|
| ¿Qué variables existen, si son obligatorias, de dónde sale su valor y cómo se rotan? | `.env.example` de cada repo (4 líneas por variable: `Que`, `Obligatoria`, `Obtener`, `Rotar`) |
| ¿Está al día el ejemplo? | `npm run check:env` (corre también en CI, hoy con `continue-on-error`: solo avisa) |
| ¿Qué GitHub Secrets existen? | §3 de este documento |
| ¿Quién custodia las credenciales de administración? | §4 |
| ¿Cómo se rota cada cosa? | §5 |

Referencias de la entrega: `repo-back/env.example` y `repo-front/env.example` (más recientes que los de `repos/`; ante duda, **la entrega manda**).

## 2. Dónde vive cada tipo de dato

| Tipo | Ejemplos (solo nombres) | Dónde vive | Recuperación |
|---|---|---|---|
| Variables de la API | `JWT_SECRET`, `DATABASE_URL`, `ACS_*`, `AZURE_*`, `RECAPTCHA_*` | `.env` en el servidor (carpetas `Arkad-api-test` / `Arkad-api-prod`), fuera de repos | Se regeneran en su origen y se vuelven a poner |
| Variables del front (`VITE_*`) | `VITE_ENDPOINT_BACKEND`, `VITE_SITE_KEY` | GitHub Secrets del front, inyectadas al construir. **No son secretos**: quedan en el JS público | Se reescriben |
| Credenciales del pipeline | `DEPLOY_PAT`, `DOCKERHUB_TOKEN`, llave SSH del CI | GitHub Secrets de cada repo | Se **regeneran**; GitHub no las muestra |
| Acceso SSH humano | llave heredada (sin cambio por ahora) | La máquina de quien la usa | Opcional a futuro: llave personal por persona |
| Credenciales de administración | contraseña admin prod/test, Gmail del proyecto, Azure, contraseña de BD | **Scrum Master** (§4) | Se restablecen en cada servicio y se avisa a la Scrum Master |

## 3. GitHub Secrets (solo nombres)

| Repo | Secretos |
|---|---|
| Back (`djromerom/gamerlab_back_2295_2`) | `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `DOCKERHUB_REPOSITORY`, `BRANCH_IMAGE_TAGS`, `DEPLOY_PAT`, `REPO_DISPATCH_TARGET` |
| Front (`djromerom/gamerlab_front_2295_2`) | los mismos + `VITE_ENDPOINT_BACKEND_TEST_TEMP`, `VITE_ENDPOINT_BACKEND_PROD_V3`, `VITE_SITE_KEY_TEMP` |
| Receptor back (openlab) | `HOST`, `KEYS`, `PASSPHRASE` (test); `USERNAME`, `SSH_PRIVATE_KEY` (prod); `DOCKERHUB_*` |
| Receptor front (`openlabun/Arkad-Front`) | `HOST_TEST`, `HOST_PROD`, `USERNAME`, `SSH_PRIVATE_KEY`, `PASSPHRASE`, `DOCKERHUB_*` |

Mapeo de secretos del front a variables de build (paso «Resolve VITE_secrets» de `deploy-front.yml`):

| Secret | Variable | Ambiente |
|---|---|---|
| `VITE_ENDPOINT_BACKEND_TEST_TEMP` | `VITE_ENDPOINT_BACKEND` | test (`dev-deploy`) |
| `VITE_ENDPOINT_BACKEND_PROD_V3` | `VITE_ENDPOINT_BACKEND` | prod (`main`) |
| `VITE_SITE_KEY_TEMP` | `VITE_SITE_KEY` | test **y** prod (> A CONFIRMAR si prod debe tener la suya) |

## 4. Custodia de credenciales de administración
**Decidido el 2026-11-05:** la **Scrum Master** documenta y guarda las credenciales de administración y las entrega al equipo V5. (El equipo no usa gestor de contraseñas; se evaluaron archivo cifrado, custodia en el profesor, Azure Key Vault y solo punteros.)

Recomendaciones: guardarlas fuera de repos y de carpetas compartidas; entregarlas a la V5 de forma directa y con constancia (no por chat grupal); anotar vencimiento y quién rota; actualizar la copia cada vez que se rote algo.

| Credencial | Para qué | Custodia | Vence |
|---|---|---|---|
| Contraseña admin de producción | Entrar como administrador en prod | Scrum Master | — |
| Contraseña admin de test | Igual, en test | Scrum Master | — |
| Gmail del proyecto | Cuenta dueña de servicios (> A CONFIRMAR cuáles) | Scrum Master | — |
| Acceso a Azure (ACS, Storage, Entra ID) | Obtener `ACS_*`, `AZURE_*` | Scrum Master (> A CONFIRMAR dueño de la suscripción) | Secreto de cliente de Entra ID **caduca**: anotar fecha |
| Contraseña de las bases | Conexión PostgreSQL | `.env` del servidor | — |
| Cuenta Docker Hub (`openlabarkad`) | Publicar imágenes | GitHub Secrets (`DOCKERHUB_TOKEN`) | — |
| `DEPLOY_PAT` | Disparar el deploy entre repos | GitHub Secrets (back y front); lo crea DevOps con su cuenta | **2026-12-19** (recordatorio 2026-12-05) |

Vencimientos a vigilar:

| Qué | Vence | Recordatorio |
|---|---|---|
| `DEPLOY_PAT` | 2026-12-19 | 2026-12-05 |
| `AZURE_CLIENT_SECRET` (Entra ID) | > PENDIENTE: anotar fecha | 2 semanas antes |

## 5. Procedimientos

### A. Agregar una variable nueva
1. Añadirla al `.env.example` con sus 4 líneas y valor vacío; correr `npm run check:env`.
2. Si es del **front**: también en `Dockerfile`, `Dockerfile.prod` y `deploy-front.yml` (hoy solo se inyectan `VITE_ENDPOINT_BACKEND` y `VITE_SITE_KEY`) y crear el GitHub Secret. Queda en el bundle público.
3. Si es del **back**: ponerla en el `.env` de test y prod del servidor **antes** de mergear el PR que la exige y **recrear** el contenedor.
4. Anotar el nombre (no el valor) en §3.

> `docker restart` **no** relee el `.env`: hay que recrear el contenedor o volver a desplegar.

### B. Pedir un acceso nuevo
Se pide al responsable de DevOps (qué, para qué y hasta cuándo). Nunca por chat, correo ni capturas. Servidor: la persona genera su par de llaves y entrega **solo la pública**. GitHub: se da acceso al repo, no se comparten cuentas. Azure, Docker Hub, Gmail, admin de la app: a la Scrum Master.

### C. Alta/baja en el servidor (opcional, no aplicado)
Alta: `ssh-keygen -t ed25519` (con passphrase) y entregar el `.pub`; el administrador lo agrega a `authorized_keys`. Baja: borrar esa línea. El servidor es compartido: solo el profesor (o quien designe) toca `authorized_keys` (> A CONFIRMAR nombre y canal).

### D. Rotar
Después de rotar, actualizar **todos** los sitios y probar con un deploy a test.

| Qué | Cómo / dónde actualizar |
|---|---|
| Llave SSH del pipeline | **No se rota de rutina** (decisión 2026-11-05). Solo si hay sospecha de exposición, salida de alguien con acceso o petición del administrador: par nuevo solo para CI, agregar pública a `authorized_keys`, actualizar secretos de ambos receptores, probar test y luego prod, quitar la vieja y **borrar la privada local** |
| `DEPLOY_PAT` | §F. Back **y** front |
| Docker Hub | Token nuevo → `DOCKERHUB_TOKEN` en back, front y los dos receptores; revocar el viejo |
| `JWT_SECRET`, `SOCKET_KEY_SECRET` | `openssl rand -hex 32`; `.env` del servidor (valores distintos test/prod); recrear contenedor. **Invalida sesiones** |
| Contraseña PostgreSQL | Cambiar en la base, actualizar `DATABASE_URL`, recrear |
| `RECAPTCHA_SECRET_KEY` y `VITE_SITE_KEY` | Regenerar el par; `.env` del back **y** Secret del front (reconstruir front) |
| `ACS_CONNECTION_STRING`, `AZURE_ACCOUNT_KEY`, `AZURE_CLIENT_SECRET` | Regenerar en Azure (en Entra ID, crear el nuevo antes de que venza el viejo); `.env` y recrear |

### E. Credenciales que circularon (herencia V3)
Una llave privada y archivos de credenciales circularon en documentos y chats antes de ARK-43. Decisión 2026-11-05: **no se rotan** en esta versión la llave SSH del CI, la contraseña admin de prod ni el Gmail. Es una decisión consciente; **la exposición histórica sigue vigente**. **Para la V5:** asumir que son las heredadas y decidir si rotarlas (en especial llave SSH y admin de prod).

### F. Renovar `DEPLOY_PAT`
**Qué es:** PAT *classic* con solo `repo`, creado por DevOps con su cuenta. Lo usa `peter-evans/repository-dispatch` para avisar a los repos receptores. **Si falla, la imagen se publica pero el servidor no se actualiza.**

Dependencias que se olvidan:
1. El token actúa con los permisos de quien lo creó: esa persona debe ser colaboradora de los **dos** receptores y tener escritura en back y front. En un traspaso, la persona nueva crea **su propio** token.
2. Es secreto **por repositorio**: cargarlo en back **y** front (incidente 2026-10-28).

| Síntoma (job `test-dispatch`/`prod-dispatch`) | Causa probable |
|---|---|
| `Bad credentials` (401) | Token vencido/revocado, o valor viejo en uno de los dos repos |
| `Not Found` (404) | El dueño del token no tiene acceso al repo destino, o `REPO_DISPATCH_TARGET` mal escrito |
| `docker-image` verde pero el servidor no cambia | Falló el dispatch |

Pasos:
1. GitHub → *Settings → Developer settings → Personal access tokens → Tokens (classic)*.
2. Mismo dueño: *Regenerate token*. Otro dueño: *Generate new token (classic)*, nombre descriptivo (p. ej. `arkad-deploy-dispatch`), vencimiento elegido, **solo** `repo`.
3. Copiar el valor una sola vez; no pegarlo en chat, documento, commit ni terminal compartida.
4. Cargarlo en ambos repos: `gh secret set DEPLOY_PAT --repo djromerom/gamerlab_back_2295_2` y `gh secret set DEPLOY_PAT --repo djromerom/gamerlab_front_2295_2` (o por web en *Settings → Secrets and variables → Actions*).
5. Verificar: lanzar `Deploy-back` (`target_branch=dev`) y `Deploy-front` (`target_branch=dev-deploy`). Deben pasar `docker-image` y `test-dispatch` (con `prod-dispatch` omitido) y correr `Test_deploy_back` y `Deploy-dev-front`.
6. Si el token es nuevo: revocar el viejo y actualizar §4.

## 6. Qué no se hace
No pegar valores reales en `.env.example`, PR, issue, chat ni docs. No versionar `.env`, `cookies.txt`, `output.sql`, llaves `.pem`/`.key` ni archivos de credenciales (`check:env` falla si aparecen). No pasar llaves SSH por chat. No poner secretos en variables `VITE_*`. No dejar credenciales en texto plano en repos ni carpetas compartidas.

## 7. Pendientes
- [ ] Acordar con la Scrum Master dónde guarda y cómo entrega las credenciales; cómo le avisa DevOps al rotar algo.
- [ ] Renovar `DEPLOY_PAT` antes del 2026-12-19 y poner recordatorio el 2026-12-05.
- [ ] Confirmar el comando exacto con que el receptor recrea el contenedor y relee el `.env`.
- [ ] Confirmar dueños de la consola de reCAPTCHA, del App registration de Entra ID y de Docker Hub.
- [ ] Confirmar si test ejecuta el seed (contraseñas por defecto de desarrollo).
- [ ] Decidir si Supabase sigue en uso en el front (`VITE_SUPABASE_*`).
- [ ] Pasar `check:env` de aviso a obligatorio (quitar `continue-on-error`) tras un sprint limpio.
- [ ] Ticket de limpieza TA-08: ver [riesgos y deuda](riesgos-y-deuda.md).
