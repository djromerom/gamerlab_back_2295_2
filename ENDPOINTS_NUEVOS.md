# 📋 Endpoints Nuevos Implementados

Lista de los **7 endpoints nuevos** que se implementaron en esta sesión.

---

## 🎯 Endpoints de Equipos (Teams)

### 1. `GET /teams/incomplete-jurors`
**Para qué sirve:** Obtener equipos activos con menos de 3 jurados asignados  
**Permisos:** `ListTeams`

---

### 2. `GET /teams/:id/full`
**Para qué sirve:** Obtener información completa de un equipo (líder, videojuego con YouTube/GitHub, miembros, jurados, edición)  
**Permisos:** `GetTeam`

---

### 3. `PATCH /teams/:id`
**Para qué sirve:** Actualizar información básica del equipo (nombre, descripción, YouTube, GitHub, logo)  
**Permisos:** `UpdateTeam`  
**Nota:** Solo el líder puede actualizar. Detecta automáticamente si es actualización de info básica.

---

### 4. `PATCH /teams/:teamId/members/:memberId`
**Para qué sirve:** Cambiar el email de un integrante del equipo (no puede ser el líder)  
**Permisos:** `UpdateTeam`  
**Nota:** Solo el líder puede cambiar emails de integrantes.

---

## 👨‍⚖️ Endpoints de Jurados (Juror)

### 5. `GET /juror/evaluators`
**Para qué sirve:** Obtener lista de evaluadores activos con sus equipos asignados  
**Permisos:** `ListJurors`

---

### 6. `POST /juror/assignments`
**Para qué sirve:** Asignar manualmente un jurado a un equipo  
**Permisos:** `AssignJurors`  
**Body:**
```json
{
  "jurorId": "uuid-del-jurado",
  "teamId": 1
}
```

---

### 7. `GET /juror/:id/teams`
**Para qué sirve:** Obtener equipos asignados a un jurado específico  
**Permisos:** `ListJurors`

---

## 📊 Resumen

| # | Método | Endpoint | Propósito |
|---|--------|----------|-----------|
| 1 | GET | `/teams/incomplete-jurors` | Equipos con menos de 3 jurados |
| 2 | GET | `/teams/:id/full` | Info completa del equipo |
| 3 | PATCH | `/teams/:id` | Actualizar info del equipo |
| 4 | PATCH | `/teams/:teamId/members/:memberId` | Cambiar email de integrante |
| 5 | GET | `/juror/evaluators` | Lista de evaluadores con equipos |
| 6 | POST | `/juror/assignments` | Asignar jurado a equipo |
| 7 | GET | `/juror/:id/teams` | Equipos de un jurado |

---

## ✨ Características Nuevas

- **Campos nuevos en videojuegos:** `youtubeUrl` y `githubUrl` (se pueden actualizar)
- **Filtrado automático:** Solo muestra entidades activas
- **Validaciones:** Emails institucionales, nombres únicos, máximo 3 jurados por equipo

---

## 📝 Notas

- Todos los endpoints requieren autenticación (cookies HTTP-only)
- Los endpoints de actualización solo pueden ser usados por el líder del equipo
- Para más detalles de uso, consulta `COMO_PROBAR_ENDPOINTS.md`
