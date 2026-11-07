# Qué es ARKAD

> **Audiencia:** todos · **Actualizado:** 2026-11-05 · **Estado:** completo · **Fuente:** backlog §3, §2.1

**ARKAD** es la plataforma web de la **feria de videojuegos de Uninorte** (Gamerlab/Openlab). Producción: `https://arkad.openlab.uninorte.edu.co/`.

## Para qué sirve
- Los **estudiantes** de 1.º a 4.º semestre (cuyo proyecto final de la materia es el juego que muestran) **inscriben su equipo y su videojuego**, ven a sus jurados y, al final, su nota. También participan **colegios invitados** (nivel N0).
- Los **profesores** de las materias suben las notas de sus estudiantes por NRC, califican y deciden empates.
- Los **jurados** califican los juegos en la feria (con un código de verificación del grupo).
- El **staff** de la mesa de escarapelas registra la llegada de los jurados con un QR.
- Los **administradores** (organizadores) gestionan ediciones, NRC, jurados, asignaciones, ranking y la página pública.
- El público ve la **landing**, el **ranking**, la galería de juegos y las **ediciones pasadas**.

## Cómo se evalúa
Cada grupo recibe la nota de su profesor y la de **mínimo 3 jurados** (solo cuentan las 3 primeras), combinadas con ponderaciones (la definitiva sigue abierta: P-02). Escala 0–5 con 2 decimales. **Ranking oficial por nivel (N0–N4)** con podio de 3 y desempate definido. Reglas completas: [01-negocio/reglas-de-negocio](../01-negocio/reglas-de-negocio.md).

## Roles de usuario
Administrador · Estudiante · Profesor · Jurado · Staff (nuevo). Cada usuario tiene **un solo rol**. [Detalle](../01-negocio/roles-y-permisos.md).

## Conceptos clave
- **Edición** = una feria anual (activa / inactiva / archivada). Siempre se trabaja sobre la **activa**; las anteriores son historial. [Ediciones](../01-negocio/ediciones.md).
- **Nivel** N0–N4 (prefijo del código del equipo; N0 = colegios).
- **NRC** = sección de un curso; **Jurado** junior/senior (senior = profesores) y oficial/suplente; **escarapela** con QR; **check-in**.
- Glosario completo: [06-referencia/glosario](../06-referencia/glosario.md).

## Fecha importante
**Feria: 26-nov-2026**, 8:00 a ~12:00. Inscripciones del 2 al 22 de noviembre. [Calendario](../05-scrum-y-proceso/calendario-feria.md).

## Cómo está construida (resumen)
Dos repos: **backend** (NestJS + Prisma + PostgreSQL) y **frontend** (React + Vite), con Docker; despliegue por GitHub Actions + Docker Hub a un servidor compartido. [Arquitectura](arquitectura-general.md).

## Historia y versiones
ARKAD lo mantienen equipos de estudiantes por semestre. **V3** (mayo-2026, Carlos Morales como DevOps) dejó la base; **V4** (2026-30: Allison Ruiz, Santiago Díaz, Rafael Mejía, Juan Álvarez, Samuel Tilano, Camilo Acevedo, Jorge Silva) agregó seguridad, ranking por nivel, gestión de jurados, check-in y datos por edición, y escribió esta documentación. La **V5** continúa desde aquí.
