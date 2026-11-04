# Cierre de edición: qué hace «archivar» (TA-17 / ARK-137)

Este documento está listo para copiarse a `arkad_docs`. Complementa [`editions.md`](./editions.md), que explica qué es global y qué es por edición (HU-27).

## Estados de una edición

| Estado | Qué significa |
|---|---|
| `ACTIVE` | La edición de trabajo. Solo hay una. Es la única donde se inscribe, se asigna, se califica y se quita. |
| `INACTIVE` | Edición creada que aún no empieza, o que ya terminó y no se ha archivado. Sus datos se consultan como historial de solo lectura. |
| `ARCHIVED` | Edición cerrada. Además de sus datos vivos, tiene una copia (volcado) en las tablas históricas. No se puede volver a activar. |

Transiciones: `INACTIVE → ACTIVE` (activar; la activa anterior pasa a `INACTIVE`) y `INACTIVE → ARCHIVED` (archivar). No existe `ARCHIVED → ACTIVE` ni `ACTIVE → ARCHIVED` directo.

## Qué hace `POST /editions/:id/archive`

Solo acepta ediciones `INACTIVE` (si no, 400). En **una sola transacción**:

1. Marca la edición `ARCHIVED`. Si otra petición la archivó o activó en ese momento, responde 400 y no hace nada.
2. Copia a las tablas históricas los **equipos activos** de la edición:
   - `equipos_historico`: nombre, código, edición y si es externo (colegio).
   - `integrante_historico`: nombre, apellido, correo y código de cada integrante.
   - `integrante_historico_nrc`: los NRC de **esa** edición de cada integrante (id y código).
   - `videojuegos_historico`: nombre, descripción, logo, repositorio, video, imágenes, archivo, `entry`, número de likes y la nota final (de la vista `vw_team_final_scores`).
3. Si algo falla, se deshace todo: la edición sigue `INACTIVE`, sin volcado, y se puede volver a intentar.

Otras reglas:

- **No duplica:** si la edición ya tiene volcado, responde 400.
- **Edición sin equipos:** se archiva igual, sin volcado.
- `POST /historicals/create-historical-edition-dump/:id` (volcado suelto) **solo** sirve para recuperar el volcado de una edición que ya está `ARCHIVED` y no lo tiene. Sobre una edición `ACTIVE` o `INACTIVE` responde 400: antes dejaba un volcado incompleto que después impedía archivarla.

## Qué queda vivo (no se borra nada)

Archivar **no borra ni modifica** ninguna tabla de trabajo. Después de archivar siguen intactos:

| Tabla de trabajo | Se copia al histórico | Sigue viva |
|---|---|---|
| `equipos` | Sí (solo los activos) | Sí |
| `integrante` | Sí | Sí |
| `videojuegos` | Sí (con likes y nota final) | Sí |
| `nrc` e `_MemberNRC` | Solo el código y el id del NRC de cada integrante | Sí |
| `evaluacion` y su detalle | No (solo la nota final del videojuego) | Sí |
| Asignaciones jurado-equipo (`_JurorTeamAssignment`) | No | Sí |
| `configuracion_evento`, ponderados, ranking y desempates | No | Sí |
| Jurados de la edición, escarapelas y asistencia (HU-25, HU-10, HU-11) | No | Sí |
| Juegos destacados, testimonios y enfoques educativos | No | Sí |
| Cuentas de usuario | No (son globales) | Sí |

## Decisión: el cierre no borra datos vivos

**Decisión (TA-17, con BG-17 y HU-27):** cerrar una edición **no borra** sus datos vivos. Los equipos, integrantes, videojuegos, evaluaciones y asignaciones de la edición cerrada **se conservan** y se consultan como **historial de solo lectura**.

Por qué:

- **Cascada.** Borrar un equipo borra en cascada su videojuego y con él sus evaluaciones, likes, ranking y juegos destacados. Se perderían las notas, los reportes y los certificados de la edición.
- **Ya no hace falta liberar nada.** Desde BG-17 (ARK-128), correo, código estudiantil, líder y nombre del equipo son únicos **por edición**: un estudiante de la edición anterior se inscribe en la nueva sin borrar su participación pasada.
- **Ya no se mezclan.** Desde HU-27 (ARK-130) y BG-18 a BG-22, todo se escribe solo en la edición activa y los listados filtran por edición. Los datos vivos de una edición cerrada no aparecen en la activa.
- **Solo lectura en el servidor.** Cualquier escritura sobre equipos, integrantes, videojuegos, NRC, asignaciones o ponderados de una edición que no es la activa responde 400 `EDITION_READ_ONLY`, también para el administrador (`assertEditionWritable`).

El volcado histórico es una **foto** de la edición para la página pública de ferias pasadas, no un reemplazo de los datos vivos.

## Qué ve cada rol de una edición archivada

| Rol | Qué ve | Qué puede cambiar |
|---|---|---|
| Público (sin sesión) | `/ediciones-pasadas`: la información de la edición (fotos, testimonios, destacados) y los juegos del volcado con su nota (`GET /historicals/historical-teams-with-scores/:id`, `GET /historicals/historical-videogames/:id`). | Nada. |
| Estudiante | Su equipo de esa edición como historial (ARK-112). En la edición activa ve «Aún no estás inscrito» hasta que se inscribe (BG-17). | Nada de la edición archivada. |
| Jurado | Nada: su panel muestra solo la edición activa (BG-19). | Nada. |
| Profesor | Su panel filtra por feria (HU-03); las notas de una edición pasada se consultan, no se editan (calificar exige la edición activa). | Nada de la edición archivada. |
| Administrador | Equipos inscritos con selector de edición (ARK-129), reportes con `?editionId=` (BG-22) y el volcado histórico (`/historicals/historical-teams/:id`). | Solo la información de la edición (título, fotos, testimonios, destacados, enfoques). Los equipos, NRC, asignaciones y notas son de solo lectura. El volcado histórico se puede corregir con los endpoints `update-historical-*` y `remove-historical-*`. |

> En `/ediciones-pasadas` aparecen todas las ediciones que no son la activa, también las `INACTIVE`. Una edición `INACTIVE` sin archivar no tiene volcado, así que su página de juegos sale vacía. Por eso conviene archivar la edición al cerrarla.

## Procedimiento para cerrar la edición 5

Lo ejecuta el administrador con DevOps. Nada de esto borra datos.

### Antes del cierre

1. Terminar la feria: evaluaciones cerradas, ranking y desempates decididos (HU-04), certificados enviados (los certificados y reportes de jurado se calculan con la edición activa; BG-22).
2. Revisar los datos de la edición 5: equipos de prueba, nombres y notas. **Después de desactivarla ya no se pueden corregir desde la plataforma** (solo lectura).
3. Respaldo de la base de producción:
   ```bash
   pg_dump -Fc -h <host> -U <usuario> -d <base> -f arkad_antes_cierre_ed5_$(date +%Y%m%d_%H%M).dump
   ```
   Guardar el archivo fuera del servidor y comprobar que se puede listar: `pg_restore -l <archivo> | head`.
4. Foto de control (solo lectura), para comparar después:
   ```sql
   SELECT e.id_edicion, e.titulo, e.estado,
          (SELECT count(*) FROM equipos t WHERE t.id_edicion = e.id_edicion)                 AS equipos,
          (SELECT count(*) FROM equipos t WHERE t.id_edicion = e.id_edicion AND t.activo)    AS equipos_activos,
          (SELECT count(*) FROM integrante i WHERE i.id_edicion = e.id_edicion)              AS integrantes,
          (SELECT count(*) FROM evaluacion v WHERE v.id_edicion = e.id_edicion)              AS evaluaciones,
          (SELECT count(*) FROM "_JurorTeamAssignment" a JOIN equipos t ON t.id_equipo = a."A"
            WHERE t.id_edicion = e.id_edicion)                                               AS asignaciones,
          (SELECT count(*) FROM equipos_historico h WHERE h.id_edicion = e.id_edicion)       AS equipos_historicos
   FROM ediciones e ORDER BY e.id_edicion;
   ```

### Cierre

5. Activar la edición siguiente (la 6) desde **Ediciones**, o dejar la 5 sin activa si aún no existe la 6. Activar otra edición deja la 5 en `INACTIVE` automáticamente.
6. Archivar la 5 desde **Ediciones → Archivar**, o con `POST /editions/5/archive`. Respuesta esperada: la edición con `status: "ARCHIVED"`.

### Verificación (solo lectura)

7. Repetir la consulta del paso 4. Para la edición 5 debe salir:
   - `estado = ARCHIVED`;
   - `equipos`, `integrantes`, `evaluaciones` y `asignaciones` **iguales** a antes;
   - `equipos_historicos = equipos_activos`.
   Las demás ediciones, sin ningún cambio.
8. Revisar el volcado:
   ```sql
   SELECT h.codigo_equipo, h.nombre_equipo,
          (SELECT count(*) FROM integrante_historico m WHERE m.id_equipo_historico = h.id_equipo_historico) AS integrantes,
          v.nombre AS juego, v.likes, v.puntaje_final
   FROM equipos_historico h
   LEFT JOIN videojuegos_historico v ON v.id_equipo_historico = h.id_equipo_historico
   WHERE h.id_edicion = 5 ORDER BY h.codigo_equipo;
   ```
9. En el navegador, sin sesión: `/ediciones-pasadas`, elegir la edición 5 y abrir **Juegos**: deben aparecer los juegos con su nota.

### Si algo falla

- **El archivado responde error:** no queda nada a medias (la edición sigue `INACTIVE` y sin volcado). Leer el mensaje: «ya tiene volcado» indica un volcado previo; «cambió de estado» indica otra operación simultánea. Corregir y volver a archivar.
- **El volcado salió mal** (por ejemplo, faltan datos): los datos vivos no se tocaron. Se pueden borrar los equipos históricos de esa edición con `DELETE /historicals/remove-historical-team/:id` y volver a generar el volcado con `POST /historicals/create-historical-edition-dump/5` (permitido porque la edición ya está `ARCHIVED`).
- **Hay que volver atrás del todo:** restaurar el respaldo del paso 3 con `pg_restore` en una base nueva y comparar antes de reemplazar nada. No usar scripts que modifiquen producción sin ese respaldo.

## Ensayo pendiente en Arkad-test (edición 4)

El ensayo automatizado está en `src/editions/edition-archive.db.spec.ts` (corre en CI con un Postgres desechable). Falta el ensayo con datos reales, que hace **DevOps** en Arkad-test:

1. Restaurar en Arkad-test una copia reciente de producción (respaldo `pg_dump` según TA-01 / ARK-12), con el despliegue de `dev` que incluye BG-17 a BG-23 y TA-17.
2. Antes de tocar nada, respaldar la propia base de test (`pg_dump`).
3. Correr la consulta del paso 4 y guardar el resultado. En producción (3 de noviembre) la edición 4 tenía 151 equipos activos, 505 integrantes, 606 evaluaciones y 433 asignaciones; las ediciones 2 y 3 ya tienen volcado (95 y 102 equipos).
4. Confirmar que la edición 4 está `INACTIVE` y que **no** tiene volcado:
   ```sql
   SELECT estado FROM ediciones WHERE id_edicion = 4;
   SELECT count(*) FROM equipos_historico WHERE id_edicion = 4;  -- debe ser 0
   ```
5. Archivar la edición 4 como administrador en test (`POST /editions/4/archive`).
6. Verificar con los pasos 7 a 9, usando la edición 4: datos vivos iguales, `equipos_historicos = equipos_activos`, y la edición 4 visible con sus juegos en `/ediciones-pasadas`.
7. Comprobar que la edición activa de test no cambió y que, como estudiante de la edición 4, se puede inscribir en la activa (BG-17).
8. Registrar en Jira (TA-17) los conteos de antes y después, y la hora del ensayo. Con el ensayo bien, repetir el mismo procedimiento en producción para la edición 4, con su respaldo previo.
