# Branching — Nomenclatura de ramas

Estándar oficial de nombres de rama para Arkad, vigente desde V4 en adelante (back y front). Las ramas creadas antes de este documento no se renombran; quedan como registro histórico.

## Estructura

```
<tipo>/<TICKET>-<descripcion-corta>       → feat, fix, hotfix (ticket obligatorio)
<tipo>/<descripcion-corta>                → docs, refactor, chore (ticket opcional)
```

### Ejemplos

```
feat/ARK-25-exigir-permisos-backend
fix/ARK-30-boton-filtro-colgado
hotfix/ARK-61-pantalla-blanca-login
chore/actualizar-dependencias-eslint
docs/documentar-pipeline-deploy
refactor/ARK-40-modularizar-servicio-emails
```

## Reglas

1. **Tipo** (`<tipo>`): uno de `feat`, `fix`, `docs`, `refactor`, `chore`, `hotfix`, siempre en minúscula.
   - `feat` — funcionalidad nueva.
   - `fix` — corrección de bug.
   - `docs` — solo documentación.
   - `refactor` — cambio interno sin alterar comportamiento.
   - `chore` — mantenimiento (dependencias, configuración, CI).
   - `hotfix` — corrección urgente directa sobre `main`/producción.
2. **Ticket** (`<TICKET>`): formato fijo `ARK-NN` (mayúscula, como lo muestra Jira).
   - Obligatorio en `feat`, `fix` y `hotfix`.
   - Opcional en `docs`, `refactor` y `chore` (inclúyelo si existe un ticket relacionado).
   - **Tareas con subtareas**: usa el `ARK-NN` de la **subtarea** en la que trabajas, no el de la tarea padre. La tarea padre no tiene rama propia; se cierra cuando se cierran todas sus subtareas. El `<tipo>` depende del trabajo de la subtarea, no del tipo de la padre.
   - **Excepción, rama de integración**: si la tarea padre debe llegar a `dev` completa y de una sola vez, se crea una rama con el `ARK-NN` del padre. Las ramas de las subtareas salen de ella y se mergean a ella, y un único PR lleva la rama del padre a `dev`. Úsala solo con una razón concreta; por defecto, cada subtarea sale directo de `dev`.
3. **Descripción corta** (`<descripcion-corta>`): minúsculas, kebab-case (palabras separadas por guion), sin tildes/ñ/espacios/guion bajo/camelCase, máximo ~6 palabras. Idioma libre, se sugiere inglés.
4. **Sin `/` adicionales**: no anidar más niveles (ej. evitar `add/Profesor/Materia/...`) — los niveles extra generan conflictos de refs en git.
5. **Ramas efímeras**: se borran al hacer merge del PR; no se dejan vivas en el remoto.
