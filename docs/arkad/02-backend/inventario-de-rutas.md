# Inventario de acceso por ruta (generado)

> **Audiencia:** Backend, QA, seguridad · **Actualizado:** 2026-11-05 · **Estado:** completo para `origin/main` (`bcfe237`, producción) · **Fuente:** `npm run routes:inventory` (copia de `docs/route-access-inventory.md`). **No editar a mano:** regenerar con el comando.


> Generado automáticamente con `npm run routes:inventory`. **No editar a mano**: cambia los
> decoradores del controlador (o `ROUTE_NOTES` / `AUTHENTICATED_ONLY_ROUTES` en
> `src/auth/route-inventory/route-inventory.ts`) y vuelve a generarlo.

- **Pública**: marcada con `@Public()`; no exige sesión.
- **Solo sesión**: exige haber iniciado sesión, sin distinguir rol. Cada una está justificada en
  `AUTHENTICATED_ONLY_ROUTES`.
- **Permiso `X`**: exige `@UseGuards(RolePermissionGuard)` + `@RequiredService('X')`. Los roles se
  calculan con el catálogo (`servicio → permiso → rol`). El Administrador siempre pasa.
- Las notas describen reglas de propiedad (p. ej. "solo su equipo") que se verifican en el servicio.

**Total: 203 rutas** — 145 con permiso, 48 públicas, 10 solo sesión, 0 sin decidir.

## AppController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| GET | `/` | Pública | Cualquiera (sin sesión) |  |

## AuthController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| GET | `/auth/callback` | Pública | Cualquiera (sin sesión) |  |
| GET | `/auth/me` | Permiso `GetMyProfile` | Administrador, Estudiante, Jurado, Profesor, Staff |  |
| GET | `/auth/outlook-login` | Pública | Cualquiera (sin sesión) |  |
| GET | `/auth/verify-token` | Pública | Cualquiera (sin sesión) |  |
| POST | `/auth/login` | Pública | Cualquiera (sin sesión) |  |
| POST | `/auth/logout` | Pública | Cualquiera (sin sesión) |  |
| POST | `/auth/refresh` | Pública | Cualquiera (sin sesión) |  |
| POST | `/auth/resend-confirmation` | Pública | Cualquiera (sin sesión) |  |
| POST | `/auth/reset-password` | Pública | Cualquiera (sin sesión) |  |
| POST | `/auth/reset-token-expiration` | Permiso `ManageAuthTokens` | Administrador |  |
| POST | `/auth/set-password` | Pública | Cualquiera (sin sesión) |  |

## AutomaticAssignmentController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| POST | `/juror/automatic-assignment/confirm` | Permiso `AssignJurors` | Administrador |  |
| POST | `/juror/automatic-assignment/preview` | Permiso `AssignJurors` | Administrador |  |

## CertificatesController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| POST | `/certificates/juror` | Permiso `certificates` | Administrador |  |
| POST | `/certificates/juror/all` | Permiso `certificates` | Administrador |  |

## CriterionController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| DELETE | `/criteria/:id` | Permiso `DeleteCriterion` | Administrador |  |
| GET | `/criteria` | Permiso `ListCriterion` | Administrador, Jurado, Profesor |  |
| GET | `/criteria/:id` | Permiso `GetCriterion` | Administrador, Jurado, Profesor |  |
| GET | `/criteria/select-options` | Pública | Cualquiera (sin sesión) |  |
| PATCH | `/criteria/:id` | Permiso `UpdateCriterion` | Administrador |  |
| PATCH | `/criteria/:id/restore` | Permiso `RestoreCriterion` | Administrador |  |
| POST | `/criteria` | Permiso `CreateCriterion` | Administrador |  |

## EditionsController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| DELETE | `/editions/:id` | Permiso `ManageEditions` | Administrador |  |
| DELETE | `/editions/:id/photos` | Permiso `ManageEditions` | Administrador |  |
| GET | `/editions` | Pública | Cualquiera (sin sesión) |  |
| GET | `/editions/:id` | Pública | Cualquiera (sin sesión) |  |
| GET | `/editions/:id/videogames` | Pública | Cualquiera (sin sesión) |  |
| PATCH | `/editions/:id` | Permiso `ManageEditions` | Administrador |  |
| PATCH | `/editions/:id/activate` | Permiso `ManageEditions` | Administrador |  |
| POST | `/editions` | Permiso `ManageEditions` | Administrador |  |
| POST | `/editions/:id/archive` | Permiso `ManageEditions` | Administrador |  |
| POST | `/editions/:id/main-photo` | Permiso `ManageEditions` | Administrador |  |
| POST | `/editions/:id/photos` | Permiso `ManageEditions` | Administrador |  |

## EducationalFocusesController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| DELETE | `/editions/:editionId/educational-focuses/:id` | Permiso `ManageEducationalFocuses` | Administrador |  |
| GET | `/editions/:editionId/educational-focuses` | Pública | Cualquiera (sin sesión) |  |
| GET | `/editions/:editionId/educational-focuses/:id` | Pública | Cualquiera (sin sesión) |  |
| PATCH | `/editions/:editionId/educational-focuses/:id` | Permiso `ManageEducationalFocuses` | Administrador |  |
| POST | `/editions/:editionId/educational-focuses` | Permiso `ManageEducationalFocuses` | Administrador |  |

## EmailController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| POST | `/email/resend-auth-email` | Permiso `SendEmail` | Administrador |  |
| POST | `/email/resend-certificate-email` | Permiso `SendEmail` | Administrador |  |
| POST | `/email/resend-team-email` | Permiso `SendEmail` | Administrador |  |

## EvaluationController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| GET | `/evaluation/progress` | Pública | Cualquiera (sin sesión) |  |
| POST | `/evaluation/batch` | Permiso `Create Evaluation` | Administrador, Jurado, Profesor |  |
| POST | `/evaluation/with-details` | Permiso `Create Evaluation` | Administrador, Jurado, Profesor |  |

## EvaluationTrackingController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| GET | `/evaluation-tracking` | Permiso `ViewEvaluationTracking` | Administrador, Profesor |  |

## GradedGamesController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| GET | `/graded-games` | Permiso `PendingGamesService` | Administrador, Jurado, Profesor |  |
| GET | `/graded-games/count` | Permiso `PendingGamesService` | Administrador, Jurado, Profesor |  |
| GET | `/graded-games/search` | Permiso `PendingGamesService` | Administrador, Jurado, Profesor |  |
| GET | `/graded-games/search/quick` | Permiso `PendingGamesService` | Administrador, Jurado, Profesor |  |

## HighlightedGamesController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| DELETE | `/editions/:editionId/highlighted-games/:videogameId` | Permiso `ManageHighlightedGames` | Administrador |  |
| DELETE | `/editions/:editionId/highlighted-games/historical/:historicalVideogameId` | Permiso `ManageHighlightedGames` | Administrador |  |
| GET | `/editions/:editionId/highlighted-games` | Pública | Cualquiera (sin sesión) |  |
| POST | `/editions/:editionId/highlighted-games` | Permiso `ManageHighlightedGames` | Administrador |  |

## HistoricalsController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| DELETE | `/historicals/remove-historical-member/:historicalMemberId` | Permiso `ManageHistoricals` | Administrador |  |
| DELETE | `/historicals/remove-historical-team/:historicalTeamId` | Permiso `ManageHistoricals` | Administrador |  |
| DELETE | `/historicals/remove-historical-videogame/:historicalVideogameId` | Permiso `ManageHistoricals` | Administrador |  |
| GET | `/historicals/historical-members/:TeamId` | Permiso `ManageHistoricals` | Administrador |  |
| GET | `/historicals/historical-teams` | Permiso `ManageHistoricals` | Administrador |  |
| GET | `/historicals/historical-teams-with-scores/:editionId` | Pública | Cualquiera (sin sesión) |  |
| GET | `/historicals/historical-teams/:editionId` | Permiso `ManageHistoricals` | Administrador |  |
| GET | `/historicals/historical-videogames/:editionId` | Pública | Cualquiera (sin sesión) |  |
| GET | `/historicals/videogames/:historicalVideogameId/game-file` | Pública | Cualquiera (sin sesión) |  |
| PATCH | `/historicals/update-historical-member/:historicalMemberId` | Permiso `ManageHistoricals` | Administrador |  |
| PATCH | `/historicals/update-historical-team/:historicalTeamId` | Permiso `ManageHistoricals` | Administrador |  |
| PATCH | `/historicals/update-historical-videogame/:historicalVideogameId` | Permiso `ManageHistoricals` | Administrador |  |
| POST | `/historicals/create-historical-edition-dump/:editionId` | Permiso `ManageHistoricals` | Administrador |  |

## JurorAttendanceController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| GET | `/juror-attendance` | Permiso `ViewJurorAttendance` | Administrador, Staff |  |
| PATCH | `/juror-attendance/:attendanceId/annul` | Permiso `AnnulJurorArrival` | Administrador | Agregada a mano (BG-49, ARK-251) |

## JurorBadgesController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| GET | `/juror-badges` | Permiso `ManageJurorBadges` | Administrador |  |
| GET | `/juror-badges/pdf` | Permiso `ManageJurorBadges` | Administrador |  |
| POST | `/juror-badges/:jurorId/regenerate` | Permiso `ManageJurorBadges` | Administrador |  |
| POST | `/juror-badges/generate` | Permiso `ManageJurorBadges` | Administrador |  |

## JurorCheckinController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| GET | `/juror-checkin/search` | Permiso `JurorCheckIn` | Administrador, Staff |  |
| POST | `/juror-checkin/manual` | Permiso `JurorCheckIn` | Administrador, Staff |  |
| POST | `/juror-checkin/scan` | Permiso `JurorCheckIn` | Administrador, Staff |  |

## JurorController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| DELETE | `/juror/:id` | Permiso `DeleteJurror` | Administrador |  |
| DELETE | `/juror/:id/assignments` | Permiso `AssignJurors` | Administrador |  |
| DELETE | `/juror/assignments` | Permiso `AssignJurors` | Administrador |  |
| DELETE | `/juror/assignments/all` | Permiso `AssignJurors` | Administrador |  |
| GET | `/juror` | Permiso `ListJurors` | Administrador |  |
| GET | `/juror/:id` | Permiso `GetJuror` | Administrador |  |
| GET | `/juror/:id/teams` | Permiso `ListJurors` | Administrador |  |
| GET | `/juror/assignments/audit` | Permiso `AssignJurors` | Administrador |  |
| GET | `/juror/evaluation-tracking` | Permiso `ListJurors` | Administrador |  |
| GET | `/juror/evaluators` | Permiso `ListJurors` | Administrador |  |
| GET | `/juror/teams/:teamId/evaluation-stats` | Permiso `ViewTeamEvaluationStats` | Administrador, Estudiante, Jurado, Profesor | Estudiante: solo las estadísticas de su propio equipo (BG-01). Solo devuelve conteos, sin datos de los jurados (ARK-110). |
| GET | `/juror/teams/:teamId/jurors-status` | Permiso `ListJurors` | Administrador | Solo Administrador (ListJurors no está concedido a ningún otro rol). El correo de cada jurado solo se incluye para el Administrador (ARK-110). |
| PATCH | `/juror/:id` | Permiso `UpdateJuror` | Administrador |  |
| PATCH | `/juror/assignments/reassign` | Permiso `AssignJurors` | Administrador |  |
| POST | `/juror` | Permiso `CreateJuror` | Administrador |  |
| POST | `/juror/assignments` | Permiso `AssignJurors` | Administrador |  |
| POST | `/juror/resend-confirmation` | Permiso `SendEmail` | Administrador |  |

## JurorEditionController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| GET | `/juror-edition` | Permiso `ListEditionJurors` | Administrador |  |
| PATCH | `/juror-edition/status` | Permiso `ManageEditionJurors` | Administrador |  |
| POST | `/juror-edition/enroll` | Permiso `ManageEditionJurors` | Administrador |  |
| POST | `/juror-edition/import-previous` | Permiso `ManageEditionJurors` | Administrador |  |

## NrcsController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| DELETE | `/nrcs/:id` | Permiso `DeleteNrc` | Administrador |  |
| GET | `/nrcs` | Permiso `ListNrcs` | Administrador |  |
| GET | `/nrcs/:id` | Permiso `ListNrcs` | Administrador |  |
| GET | `/nrcs/registration-readiness` | Permiso `ListNrcs` | Administrador |  |
| GET | `/nrcs/select-options` | Pública | Cualquiera (sin sesión) |  |
| PATCH | `/nrcs/:id` | Permiso `UpdateNrc` | Administrador |  |
| POST | `/nrcs` | Permiso `CreateNrc` | Administrador |  |

## PendingGamesController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| GET | `/pending-games` | Permiso `PendingGamesService` | Administrador, Jurado, Profesor |  |
| GET | `/pending-games/count` | Permiso `PendingGamesService` | Administrador, Jurado, Profesor |  |
| GET | `/pending-games/search` | Permiso `PendingGamesService` | Administrador, Jurado, Profesor |  |
| GET | `/pending-games/search/quick` | Permiso `PendingGamesService` | Administrador, Jurado, Profesor |  |

## ProfessorsController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| DELETE | `/professors/:id` | Permiso `DeleteProfessor` | Administrador |  |
| GET | `/professors` | Permiso `ListProfessors` | Administrador |  |
| GET | `/professors/:id` | Permiso `GetProfessor` | Administrador, Profesor |  |
| GET | `/professors/download-grading-report-grouped` | Permiso `ExportToExcel` | Administrador, Profesor |  |
| GET | `/professors/grading-games` | Permiso `MySubjects` | Administrador, Profesor |  |
| GET | `/professors/grading-games/filter-options` | Permiso `MySubjects` | Administrador, Profesor |  |
| GET | `/professors/juror-evaluations` | Permiso `NrcReport` | Administrador, Profesor |  |
| GET | `/professors/my-subjects` | Permiso `MySubjects` | Administrador, Profesor |  |
| GET | `/professors/nrc-report/:nrcCode` | Permiso `NrcReport` | Administrador, Profesor |  |
| GET | `/professors/nrc-report/by-id/:nrcId` | Permiso `NrcReport` | Administrador, Profesor |  |
| GET | `/professors/select-options` | Pública | Cualquiera (sin sesión) |  |
| GET | `/professors/signature-report/:subjectName` | Permiso `SubjectReport` | Administrador, Profesor |  |
| PATCH | `/professors/:id` | Permiso `UpdateProfessor` | Administrador |  |
| POST | `/professors` | Permiso `CreateProfessor` | Administrador |  |
| POST | `/professors/team-evaluation` | Permiso `UploadSeniorGrades` | Administrador, Profesor |  |
| POST | `/professors/team-evaluation/batch` | Permiso `UploadSeniorGrades` | Administrador, Profesor |  |

## PublicHighlightedGamesController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| GET | `/highlighted-games` | Pública | Cualquiera (sin sesión) |  |

## RankingController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| GET | `/ranking` | Solo sesión | Cualquier usuario con sesión | Solo el Administrador (AdminRoleGuard): ranking oficial por nivel con empates (HU-04). |
| GET | `/ranking/decisions` | Solo sesión | Cualquier usuario con sesión | Solo el Administrador (AdminRoleGuard): decisiones de desempate registradas (HU-04). |
| GET | `/ranking/my-ties` | Permiso `MySubjects` | Administrador, Profesor | Profesor: solo los empates que le toca decidir (HU-04). |
| GET | `/ranking/ties` | Solo sesión | Cualquier usuario con sesión | Solo el Administrador (AdminRoleGuard): empates detectados (HU-04). |
| GET | `/ranking/winners` | Solo sesión | Cualquier usuario con sesión | Solo el Administrador (AdminRoleGuard): ganadores de cada nivel (HU-04). |
| POST | `/ranking/finalize` | Solo sesión | Cualquier usuario con sesión | Solo el Administrador (AdminRoleGuard): define el ranking final (HU-04). |
| POST | `/ranking/ties/decision` | Permiso `MySubjects` | Administrador, Profesor | Profesor: solo empates entre grupos de sus NRC (RankingService.decide); el Administrador, cualquier empate pendiente (HU-04). |

## ReportsController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| GET | `/reports/DatosGraficoMateria` | Permiso `ExportAdminReports` | Administrador | Solo Administrador (ExportAdminReports): trae integrantes, notas, promedios junior/senior y promedio por NRC para /estadisticas (BG-67, ARK-268). |
| GET | `/reports/exportExcel` | Permiso `ExportAdminReports` | Administrador |  |
| GET | `/reports/exportJurados` | Permiso `ExportAdminReports` | Administrador |  |
| GET | `/reports/JuradosData` | Solo sesión | Cualquier usuario con sesión | La usa la página "Mis jurados": el administrador ve todos los jurados y cualquier otro usuario solo los de su propio equipo (OptionalAdminRoleGuard, BG-02). Antes era pública; desde ARK-60 exige sesión y filtra los jurados según el rol. |
| GET | `/reports/materiaData` | Pública | Cualquiera (sin sesión) | ⚠️ BG-02: pública; revisar si debe exigir sesión o rol. |
| GET | `/reports/NRCData` | Permiso `ExportAdminReports` | Administrador | Solo Administrador (ExportAdminReports): trae integrantes, notas, promedios junior/senior y promedio por NRC para /estadisticas (BG-67, ARK-268). |
| GET | `/reports/videojuegoData` | Permiso `ExportAdminReports` | Administrador | Solo Administrador (ExportAdminReports): trae integrantes, notas, promedios junior/senior y promedio por NRC para /estadisticas (BG-67, ARK-268). |

## SettingsController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| GET | `/settings/evaluations-status` | Pública | Cualquiera (sin sesión) |  |
| GET | `/settings/registrations` | Pública | Cualquiera (sin sesión) |  |
| GET | `/settings/show-evaluations` | Pública | Cualquiera (sin sesión) |  |
| GET | `/settings/show-ranking` | Pública | Cualquiera (sin sesión) | `true` solo con el ranking publicado y la nota final liberada (BG-67). |
| GET | `/settings/weights` | Permiso `GetWeight` | Administrador |  |
| GET | `/settings/weights/:editionId` | Permiso `GetWeight` | Administrador |  |
| PATCH | `/settings/evaluations-status` | Permiso `UpdateSettings` | Administrador |  |
| PATCH | `/settings/registrations` | Solo sesión | Cualquier usuario con sesión | Solo el Administrador (AdminRoleGuard): abre o cierra las inscripciones. |
| PATCH | `/settings/show-evaluations` | Permiso `UpdateSettings` | Administrador |  |
| PATCH | `/settings/show-ranking` | Permiso `UpdateSettings` | Administrador | 400 `RANKING_REQUIRES_FINAL_GRADE` si se publica sin la nota final liberada (BG-67). |
| POST | `/settings/weights` | Permiso `ManageWeight` | Administrador |  |
| PUT | `/settings/weights` | Permiso `ManageWeight` | Administrador |  |

## StaffController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| POST | `/staff` | Permiso `ManageStaffAccounts` | Administrador |  |

## StudentsController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| GET | `/students` | Solo sesión | Cualquier usuario con sesión | Solo el Administrador (AdminRoleGuard): evaluaciones individuales del equipo. El estudiante recibe 403 y ve solo la nota final (HU-30, ARK-154). |
| GET | `/students/grades` | Permiso `MyGeneralGrade` | Administrador, Estudiante |  |
| GET | `/students/members` | Permiso `MyTeamMembers` | Administrador, Estudiante |  |
| GET | `/students/my-judges` | Permiso `MyEvaluations` | Administrador, Estudiante |  |
| GET | `/students/participation` | Permiso `ListEditionStudents` | Administrador |  |
| PATCH | `/students/members/:memberId/nrcs` | Permiso `EditMemberNrc` | Administrador, Estudiante | Solo el Administrador cambia los NRC de un integrante, aunque el Estudiante tenga el permiso EditMemberNrc (ARK-161, BG-38). |

## SubjectsController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| DELETE | `/subjects/:id` | Permiso `Delete Subject` | Administrador |  |
| GET | `/subjects` | Permiso `List Subjects` | Administrador, Jurado, Profesor |  |
| GET | `/subjects/:id` | Permiso `Get Subject By ID` | Administrador, Jurado, Profesor |  |
| GET | `/subjects/select-options` | Pública | Cualquiera (sin sesión) |  |
| PATCH | `/subjects/:id` | Permiso `Update Subject (PATCH)` | Administrador |  |
| POST | `/subjects` | Permiso `Create Subject` | Administrador |  |

## TeamsController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| DELETE | `/teams/:id` | Permiso `DeleteTeam` | Administrador |  |
| DELETE | `/teams/:id/members/:memberId` | Permiso `UpdateTeam` | Administrador, Estudiante | Solo el Administrador quita integrantes, y el integrante debe pertenecer a ese equipo (ARK-161, BG-38). |
| GET | `/teams` | Pública | Cualquiera (sin sesión) |  |
| GET | `/teams/:id` | Permiso `GetTeam` | Administrador, Estudiante | Estudiante: solo su propio equipo (líder o integrante activo). Otros roles con GetTeam lo reciben sin correos, códigos estudiantiles ni código de verificación (ARK-112). |
| GET | `/teams/:id/full` | Permiso `GetTeam` | Administrador, Estudiante | Estudiante: solo su propio equipo (líder o integrante activo), sin el correo de los jurados. Otros roles con GetTeam lo reciben sin correos, códigos estudiantiles ni código de verificación (ARK-112). |
| GET | `/teams/final-score/by-n/:n` | Pública | Cualquiera (sin sesión) |  |
| GET | `/teams/final-score/team/:teamId` | Pública | Cualquiera (sin sesión) |  |
| GET | `/teams/final-score/videogame/:videogameId` | Pública | Cualquiera (sin sesión) |  |
| GET | `/teams/incomplete-jurors` | Permiso `AssignJurors` | Administrador |  |
| GET | `/teams/leader/:email/status` | Permiso `ViewTeamLeaderStatus` | Administrador |  |
| GET | `/teams/name/:teamName` | Pública | Cualquiera (sin sesión) |  |
| GET | `/teams/videogame/:videogameName` | Pública | Cualquiera (sin sesión) |  |
| PATCH | `/teams/:id` | Permiso `UpdateTeam` | Administrador, Estudiante | Estudiante: solo el líder, solo el nombre del equipo y el contenido del juego, y solo con las inscripciones abiertas; integrantes, externo, nombre del juego y estado de aprobación responden 403 (ARK-161, BG-38). |
| PATCH | `/teams/:teamId/members/:memberId` | Permiso `UpdateTeam` | Administrador, Estudiante | Solo el Administrador cambia el correo de un integrante (ARK-161, BG-38). |
| POST | `/teams` | Pública | Cualquiera (sin sesión) |  |
| POST | `/teams/:id/member` | Permiso `UpdateTeam` | Administrador, Estudiante | Solo el Administrador agrega integrantes (ARK-161, BG-38). |
| POST | `/teams/admin` | Permiso `RegisterTeam` | Administrador |  |
| POST | `/teams/validate-emails` | Pública | Cualquiera (sin sesión) |  |
| POST | `/teams/validate-student-codes` | Pública | Cualquiera (sin sesión) |  |

## TeamVerificationController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| GET | `/team-verification/:teamId` | Permiso `ManageTeamVerificationCode` | Administrador |  |
| GET | `/team-verification/my-code` | Permiso `MyTeamMembers` | Administrador, Estudiante |  |
| GET | `/team-verification/status` | Permiso `Create Evaluation` | Administrador, Jurado, Profesor |  |
| POST | `/team-verification/:teamId/regenerate` | Permiso `ManageTeamVerificationCode` | Administrador |  |
| POST | `/team-verification/verify` | Permiso `Create Evaluation` | Administrador, Jurado, Profesor |  |

## TestimonialsController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| DELETE | `/editions/:editionId/testimonials/:id` | Permiso `ManageTestimonials` | Administrador |  |
| GET | `/editions/:editionId/testimonials` | Pública | Cualquiera (sin sesión) |  |
| GET | `/editions/:editionId/testimonials/:id` | Pública | Cualquiera (sin sesión) |  |
| PATCH | `/editions/:editionId/testimonials/:id` | Permiso `ManageTestimonials` | Administrador |  |
| POST | `/editions/:editionId/testimonials` | Permiso `ManageTestimonials` | Administrador |  |

## UploadController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| DELETE | `/upload/:id` | Permiso `ManageUploads` | Administrador |  |
| GET | `/upload/:id` | Permiso `ManageUploads` | Administrador |  |
| GET | `/upload/:id/url` | Pública | Cualquiera (sin sesión) |  |
| POST | `/upload` | Pública | Cualquiera (sin sesión) | Pública: la usa el registro de equipos antes de crear la cuenta. Con límite de peticiones y verificación del tipo de archivo (BG-02). |
| POST | `/upload/:id/public` | Permiso `ManageUploads` | Administrador |  |
| POST | `/upload/zip` | Pública | Cualquiera (sin sesión) | Pública con condición: exige sesión o token reCAPTCHA válido (cabecera x-recaptcha-token). Máx. 200 MB, 3 por 10 min y verificación del tipo de archivo (I6). |

## VideogamesController

| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |
|---|---|---|---|---|
| DELETE | `/videogames/:id` | Permiso `ManageVideogames` | Administrador |  |
| GET | `/videogames` | Pública | Cualquiera (sin sesión) |  |
| GET | `/videogames/:id` | Pública | Cualquiera (sin sesión) |  |
| GET | `/videogames/:id/likes` | Pública | Cualquiera (sin sesión) |  |
| GET | `/videogames/:id/my-like` | Solo sesión | Cualquier usuario con sesión | Cualquier usuario con sesión puede consultar si ya dio like a un juego. |
| PATCH | `/videogames/:id` | Permiso `UpdateVideogame` | Administrador, Estudiante | Estudiante: solo el videojuego de su equipo y con las inscripciones abiertas; el nombre y el estado de aprobación solo los cambia el Administrador (BG-01, ARK-161). |
| POST | `/videogames` | Permiso `ManageVideogames` | Administrador |  |
| POST | `/videogames/:id/toggle-like` | Solo sesión | Cualquier usuario con sesión | Cualquier usuario con sesión puede dar o quitar su propio like. |
