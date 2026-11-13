# Diagnóstico de la estructura del frontend (TA-13)

> **Audiencia:** Frontend, Scrum · **Actualizado:** 2026-11-13 · **Estado:** completo · **Fuente:** `origin/dev-deploy` en `10b4bd7f` (13-nov), medido con los comandos de abajo. Ticket: ARK-49 (TA-13). Insumo de la estructura objetivo y las convenciones (TA-14, ARK-50).

Este documento dice **qué hay y qué estorba**, no cómo se arregla: la propuesta va en TA-14 y los movimientos de archivos en TA-15 (ARK-51). Nada de lo que aparece aquí se cambió al escribirlo. Reemplaza las cifras de tamaño de [estructura del proyecto](estructura-del-proyecto.md) y [deuda técnica](deuda-tecnica.md), que se habían leído de `origin/main` el 5-nov.

## Cómo se midió

| Qué | Comando (desde la raíz del repo, sin agregar dependencias) |
|---|---|
| Tamaño por carpeta y archivos grandes | `find src \( -name '*.ts' -o -name '*.tsx' \) -exec wc -l {} +` |
| Archivos, exports y dependencias sin uso | `npx --yes knip@5 --reporter compact` |
| Código duplicado (sin pruebas ni `components/ui`) | `npx --yes jscpd@4 src --min-lines 15 --ignore "**/*.test.*,**/components/ui/**"` |
| Dependencias circulares | `npx --yes madge@8 --circular --extensions ts,tsx --ts-config tsconfig.app.json src` |
| Quién llama a la API | `git grep -lE "apiFetch\|VITE_ENDPOINT_BACKEND" -- src/<carpeta>` |

Todo candidato a «sin uso» se confirmó con `git grep` antes de listarlo.

## Mapa actual

`src/` tiene **381 archivos** `.ts`/`.tsx` (90 son pruebas) y **61 538 líneas**.

| Carpeta | Archivos / líneas | Qué contiene de verdad |
|---|---|---|
| `components/grupo 1`, `pages/grupo 1`, `fetchs/grupo 1` | 12 / 2 533 | Estadísticas y reportes del admin (`StatisticsPage`, gráficos, tablas de ranking y jueces) y un contexto global de criterios **dentro de `fetchs/`** |
| `components/grupo 5`, `pages/grupo 5` | 39 / 6 578 | Público y estudiante: landing, ranking, ferias pasadas, créditos, inicio de estudiante y profesor, editar equipo, mis jurados, navbar |
| `components/grupo 8`, `pages/grupo 8` | 19 / 4 841 | Calificación: calificar, calificar colegios, calificar por lote, pendientes, calificados, borradores |
| `components/grupo 9`, `pages/grupo 9` | 42 / 11 587 | Administración y acceso: login, recuperar contraseña, NRC, materias, profesores, criterios, pesos, desempates, gestión de equipos, verificación, sidebar, `ProtectedRoute` |
| `components/grupo 11` | 12 / 2 548 | Asistente de registro de equipo (pasos, recorte de imagen, subida a Azure). La tabla de [estructura del proyecto](estructura-del-proyecto.md) le atribuía páginas de profesor y jurado: no es así |
| `components/grupo 12`, `pages/grupo 12` | 12 / 2 677 | Gestión de jurados (tabla, asignación manual) |
| `components/admin`, `pages/admin` | 34 / 6 088 | Ediciones, presentadores externos, escarapelas, jurados de la edición, encuesta, publicación de notas. **Ya está organizado por dominio** |
| `components/jurados-modals`, `pages/JuradosAssignment.tsx` | 13 / 4 152 | Asignación de jurados, separada de `grupo 12` aunque es el mismo dominio |
| `components/juror-presence`, `juror-survey`, `pwa`, `staff`, `videogamePage`; `pages/staff`, `teams`, `gameplayer`, `external-presenter` | 27 | Funcionalidades nuevas de V4, ya nombradas por dominio |
| `components/ui` | 29 / 3 004 | Primitivas de shadcn (generadas) |
| `fetchs/` | 33 / 3 800 | Llamadas a la API por tema |
| `lib/` | 57 / 4 247 | Utilidades puras **y** cuatro módulos que llaman a la API |
| `hooks/`, `contexts/`, `routes/`, `layouts/`, `types/`, `data/` | 40 / ~4 100 | Lo esperado por el nombre |

Las carpetas `grupo N` suman **136 archivos y 30 764 líneas de TS/TSX (más un `.css`): la mitad del código del front**. En todo el repo hay 193 líneas de import que dicen `grupo N`, repartidas en 84 archivos.

## Archivos de más de 500 líneas (sin `components/ui`)

| Archivo | Líneas | | Archivo | Líneas |
|---|---|---|---|---|
| `pages/JuradosAssignment.tsx` | 1983 | | `components/jurados-modals/AutomaticAssignmentModal.tsx` | 669 |
| `components/grupo 9/TeamsManagementTable.tsx` | 1267 | | `components/grupo 9/SubjectsTable.tsx` | 638 |
| `components/grupo 12/JuryManagementTable.tsx` | 990 | | `pages/RealtimeTrackingPanel.tsx` | 606 |
| `components/grupo 9/TeamWizardForm.tsx` | 863 | | `components/grupo 1/GraphicsDisplay.tsx` | 571 |
| `components/grupo 9/NrcsTable.tsx` | 795 | | `pages/admin/EditionJurorsPage.tsx` | 565 |
| `pages/grupo 8/RatePage.tsx` | 754 | | `pages/grupo 5/RankingPage.tsx` | 564 |
| `components/grupo 9/TeamWizardDialog.tsx` | 743 | | `components/grupo 9/CriterionTable.tsx` | 564 |
| `pages/grupo 8/SchoolRate.tsx` | 725 | | `pages/grupo 9/VerificationPage.tsx` | 553 |
| `pages/grupo 5/FeriasPasadas.tsx` | 716 | | `fetchs/grupo 1/GlobalStateContext.tsx` | 520 |
| `components/grupo 9/professorsTable.tsx` | 691 | | `data/contributorsData.tsx` | 511 |
| `pages/grupo 8/BatchRatePage.tsx` | 685 | | `pages/admin/ExternalPresentersPage.tsx` | 503 |

Son 22 archivos (23 si se cuenta `components/ui/sidebar.tsx`, de shadcn). El ticket hablaba de 15 con un máximo de 1895: vale lo medido el 13-nov. Hay 16 en carpetas `grupo N`.

## Hallazgos priorizados

Prioridad = cuánto frena a alguien nuevo × cuántos archivos toca.

**H1. Las carpetas `grupo N` no dicen qué contienen y son la mitad del código.** Hay 6 en `components/`, 5 en `pages/` y una en `fetchs/`. Un mismo dominio queda repartido entre carpetas: jurados está en `grupo 12`, `jurados-modals/`, `pages/JuradosAssignment.tsx` y `pages/admin/EditionJurorsPage.tsx`. Además, el espacio en el nombre obliga a poner comillas en la terminal y en los scripts.

**H2. Duplicación fuerte en calificación.** El 6,4 % del TSX está duplicado (2 426 líneas en 69 clones). La mayor parte está en `grupo 8`: `RatePage.tsx` y `SchoolRate.tsx` comparten al menos siete bloques de 70 a 349 líneas (por ejemplo `RatePage.tsx:163` ↔ `SchoolRate.tsx:158`, 349 líneas), y `GradedPage.tsx` ↔ `PendingSchoolGradesPage.tsx` comparten 126. Un arreglo en una pantalla de calificación hay que repetirlo a mano en su gemela. Otros pares: `NrcsTable` ↔ `SubjectsTable` (78), `JuryManagementTable` ↔ `professorsTable` (99) y `EditionForm` ↔ `CreateEditionModal` (121).

**H3. Pantallas gigantes que mezclan estado, reglas y llamadas a la API.** `JuradosAssignment.tsx` (1983 líneas) tiene 30 `useState` y define su propio `apiRequest` y su propio `refreshAccessToken` (líneas 70–120): es la **tercera** implementación del refresh de sesión, junto a `contexts/AuthContext.tsx:116` y `lib/api.ts:67`. `TeamsManagementTable.tsx` (1267) tiene 23 `useState` y 7 llamadas a la API dentro del componente.

**H4. No hay una sola capa de acceso a la API.**

| Dónde se llama a la API | Archivos |
|---|---|
| `fetchs/` | 21 de 22 módulos (el camino previsto) |
| `lib/` | 4 (`certificates.ts`, `evaluationDrafts.ts`, `ownTeam.ts`, `session.ts`) |
| `hooks/` | 4 |
| Componentes y páginas que importan `apiFetch` | 35 |
| Componentes y páginas que leen `VITE_ENDPOINT_BACKEND` | 39 |

Para saber qué endpoint usa una pantalla hay que leerla entera. Si cambia el contrato del back, no hay un lugar único donde buscar.

**H5. Nombres inconsistentes y con errores.**
- Hay archivos de componente en minúscula: `professorsTable.tsx`, `professorsPage.tsx`, `boton.tsx`, `criteriabutton.tsx`, `nav-user.tsx`.
- Se mezcla español e inglés en un mismo nivel: `FeriasPasadas`, `MisJuradosPage` y `JuradosAssignment` conviven con `RankingPage`.
- Hay erratas que ya están en las rutas de import: `BreadCrums.tsx`, `SubjetsPage.tsx`, `LayoutAplication.tsx`, y la carpeta `fetchs/`.
- `grupo 8/` tiene sus propios `boton.tsx`, `input.tsx` y `textarea.tsx` además de los de `components/ui`.

**H6. El service worker se compila a mano.** `src/sw.ts` se compila con `sw.config.ts` a `public/sw.js`, que se commitea. Ni el `build` ni el CI ni el Dockerfile lo hacen: si alguien edita `sw.ts` y olvida compilarlo, producción sirve el `sw.js` viejo. Hasta ahora los tres archivos se cambiaron siempre juntos (ARK-198, ARK-201). Por eso `knip` los marca como sin uso, igual que a `jszip`, que solo usa `sw.ts`: son **falsos positivos**.

**H7. Menores.**
- Hay una dependencia circular, `pages/grupo 9/professorsPage.tsx` ↔ `components/grupo 9/professorsTable.tsx`.
- Cinco componentes se exportan con nombre y por defecto a la vez: `JurorSurveyAccess`, `JurorSurveyDialog`, `Logo`, `ThemeToggle` y `ProfessorsPage`.
- De los 42 exports y 33 tipos que `knip` marca sin uso, la mayoría son piezas de shadcn en `components/ui` (normal en esa librería). Los de dominio (por ejemplo, `validationTeamsAdmin.tsx`: `isYouTubeUrl`, `uninorteEmail`, `emailValid`) se revisan en TA-14.

## Lo que está bien y conviene conservar
- `pages/admin/` + `components/admin/<dominio>/`, `juror-presence/` y `juror-survey/`: organización por dominio, con pruebas al lado.
- `lib/api.ts` como cliente único con reintentos y refresh. El problema es que no todos lo usan, no el cliente.
- El alias `@/`: casi todos los imports son absolutos, lo que abarata mover carpetas.
- 90 archivos de prueba con Vitest, al lado del código.
