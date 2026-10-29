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

## Ramas dependientes (feature2 basada en feature1)

Cuando necesitas código de una rama que aún no está mergeada a `dev` (por ejemplo, feature1 todavía está en revisión), puedes crear tu rama sobre la de ella. Todos los PR a `dev` se cierran con **squash**.

### Flujo

1. Se crea `feature1` desde `dev`, se programa y se abre su PR a `dev`.
2. Se crea `feature2` **desde `feature1`**, se programa y se abre su PR a `dev`. Márcalo como **Draft** hasta que `feature1` esté mergeada.
3. Se revisa y se hace squash merge de `feature1` a `dev`.
4. Se actualiza `feature2` (ver abajo), se saca de Draft y se hace squash merge a `dev`.

```bash
git switch feature1
git switch -c feature2
```

### Reglas

- **El orden es obligatorio: `feature1` entra a `dev` antes que `feature2`.** Si `feature2` se mergea primero, el squash arrastra el código de `feature1` y se salta su revisión.
- **Mientras `feature1` no esté mergeada**, el PR de `feature2` muestra también los cambios de `feature1`. Para revisar solo lo de `feature2`, compara contra `feature1`. No se mergea todavía.
- **Después del squash de `feature1`, `feature2` se rebasea.** Los commits originales de `feature1` siguen en la historia de `feature2` y git los ve como cambios nuevos. Un `merge dev` no sirve: produce conflictos falsos porque el código es el mismo pero los commits son distintos.

```bash
git fetch origin
git rebase --onto origin/dev <ultimo-commit-de-feature1> feature2
git push --force-with-lease
```

`<ultimo-commit-de-feature1>` es el último commit de `feature1` antes de empezar `feature2` (`git log feature1 -1` mientras la rama aún existe, o `git merge-base feature1 feature2`). Anótalo o conserva la rama hasta terminar.

### Alternativa: PR de feature2 hacia feature1

Si quien revisa prefiere un diff limpio desde el principio, abre el PR de `feature2` hacia `feature1` (stacked PR) y cámbialo a `dev` cuando `feature1` se mergee. Después del squash de `feature1` aplica el mismo `rebase --onto`.

### Tipo de merge según el destino

| PR | Merge |
|---|---|
| a `dev` | squash |
| feature → feature (stacked) | squash si `feature2` ya no se usa; merge commit si se sigue trabajando en ella |
| promoción `dev` → `main` | merge commit, nunca squash (si no, las ramas divergen y aparecen conflictos falsos) |
