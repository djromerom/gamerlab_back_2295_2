# 🧪 Endpoints para Probar con CRUD

Lista de endpoints nuevos a probar organizados por operación CRUD.

---

## 📋 Endpoints de Equipos (Teams)

### ✅ CREATE (Crear)
**No hay endpoints nuevos de CREATE** - Usa el existente:
- `POST /teams` - Crear equipo (ya existía)

---

### 📖 READ (Leer/Consultar)

#### 1. Listar equipos con menos de 3 jurados
**Endpoint:** `GET /teams/incomplete-jurors`  
**CRUD:** READ (filtrado especial)  
**Body:** No requiere  
**Respuesta esperada:** Array de equipos con menos de 3 jurados

```bash
curl -X GET "http://localhost:3000/teams/incomplete-jurors" \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

#### 2. Obtener información completa de un equipo
**Endpoint:** `GET /teams/:id/full`  
**CRUD:** READ (con relaciones)  
**Body:** No requiere  
**Parámetros:** `id` (número) - ID del equipo  
**Respuesta esperada:** Objeto con información completa (líder, videojuego, miembros, jurados, edición)

```bash
curl -X GET "http://localhost:3000/teams/1/full" \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

**Qué verificar:**
- ✅ Retorna información del líder
- ✅ Retorna videojuego con `youtubeUrl` y `githubUrl`
- ✅ Retorna lista de miembros activos
- ✅ Retorna lista de jurados asignados activos
- ✅ Retorna información de la edición

---

### ✏️ UPDATE (Actualizar)

#### 3. Actualizar información básica del equipo
**Endpoint:** `PATCH /teams/:id`  
**CRUD:** UPDATE  
**Body:** JSON con campos a actualizar
**Parámetros:** `id` (número) - ID del equipo  
**Restricción:** Solo el líder puede actualizar

**Campos disponibles:**
- `teamName` - Nombre del equipo
- `description` - Descripción
- `youtubeUrl` - URL de YouTube del videojuego
- `githubUrl` - URL de GitHub del videojuego
- `logoUrl` - URL del logo

```bash
# Actualizar solo YouTube y GitHub
curl -X PATCH "http://localhost:3000/teams/1" \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{\"youtubeUrl\":\"https://www.youtube.com/watch?v=ejemplo\",\"githubUrl\":\"https://github.com/usuario/repo\"}"

# Actualizar nombre y descripción
curl -X PATCH "http://localhost:3000/teams/1" \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{\"teamName\":\"Nuevo Nombre\",\"description\":\"Nueva descripción\"}"

# Actualizar todo
curl -X PATCH "http://localhost:3000/teams/1" \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{\"teamName\":\"Nuevo Nombre\",\"description\":\"Nueva descripción\",\"youtubeUrl\":\"https://www.youtube.com/watch?v=ejemplo\",\"githubUrl\":\"https://github.com/usuario/repo\",\"logoUrl\":\"https://ejemplo.com/logo.png\"}"
```

**Qué verificar:**
- ✅ Solo el líder puede actualizar
- ✅ Se actualiza el nombre del equipo
- ✅ Se actualiza la descripción
- ✅ Se actualiza `youtubeUrl` en el videojuego
- ✅ Se actualiza `githubUrl` en el videojuego
- ✅ Se actualiza `logoUrl` en el videojuego
- ✅ Error si el nombre ya existe
- ✅ Error si no eres el líder

#### 4. Cambiar email de un integrante
**Endpoint:** `PATCH /teams/:teamId/members/:memberId`  
**CRUD:** UPDATE (miembro)  
**Body:** `{ "email": "nuevoemail@uninorte.edu.co" }`  
**Parámetros:** 
- `teamId` (número) - ID del equipo
- `memberId` (número) - ID del integrante
**Restricción:** Solo el líder puede cambiar emails

```bash
curl -X PATCH "http://localhost:3000/teams/1/members/5" \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{\"email\":\"nuevoemail@uninorte.edu.co\"}"
```

**Qué verificar:**
- ✅ Solo el líder puede cambiar emails
- ✅ Se actualiza el email del integrante
- ✅ Error si intentas cambiar el email del líder
- ✅ Error si el email ya está en uso
- ✅ Error si el email no es institucional (@uninorte.edu.co)
- ✅ Error si el integrante no pertenece al equipo

---

### 🗑️ DELETE (Eliminar)
**No hay endpoints nuevos de DELETE** - Usa el existente:
- `DELETE /teams/:id` - Eliminar equipo (ya existía)

---

## 👨‍⚖️ Endpoints de Jurados (Juror)

### ✅ CREATE (Crear)
**No hay endpoints nuevos de CREATE** - Usa el existente:
- `POST /juror` - Crear jurado (ya existía)

---

### 📖 READ (Leer/Consultar)

#### 5. Listar evaluadores con equipos asignados
**Endpoint:** `GET /juror/evaluators`  
**CRUD:** READ (con relaciones)  
**Body:** No requiere  
**Respuesta esperada:** Array de evaluadores con sus equipos asignados

```bash
curl -X GET "http://localhost:3000/juror/evaluators" \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

**Qué verificar:**
- ✅ Retorna lista de evaluadores activos
- ✅ Cada evaluador incluye sus equipos asignados
- ✅ Cada equipo incluye nombre y videojuego
- ✅ Incluye cantidad de equipos asignados

#### 6. Obtener equipos asignados a un jurado
**Endpoint:** `GET /juror/:id/teams`  
**CRUD:** READ (relaciones)  
**Body:** No requiere  
**Parámetros:** `id` (UUID) - ID del jurado  
**Respuesta esperada:** Array de equipos asignados al jurado

```bash
curl -X GET "http://localhost:3000/juror/uuid-del-jurado/teams" \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

**Qué verificar:**
- ✅ Retorna equipos asignados al jurado
- ✅ Cada equipo incluye información completa
- ✅ Incluye información del videojuego
- ✅ Incluye información del líder
- ✅ Incluye lista de otros jurados asignados
- ✅ Error si el jurado no existe

---

### ✏️ UPDATE (Actualizar)

#### 7. Asignar jurado a equipo
**Endpoint:** `POST /juror/assignments`  
**CRUD:** CREATE (relación entre jurado y equipo)  
**Body:** 
```json
{
  "jurorId": "uuid-del-jurado",
  "teamId": 1
}
```

```bash
curl -X POST "http://localhost:3000/juror/assignments" \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{\"jurorId\":\"uuid-del-jurado\",\"teamId\":1}"
```

**Qué verificar:**
- ✅ Asigna el jurado al equipo correctamente
- ✅ Retorna información del equipo actualizado
- ✅ Error si el jurado no existe o está inactivo
- ✅ Error si el equipo no existe o está inactivo
- ✅ Error si el jurado ya está asignado al equipo
- ✅ Error si el equipo ya tiene 3 jurados (máximo)

---

### 🗑️ DELETE (Eliminar)
**No hay endpoints nuevos de DELETE** - Usa el existente:
- `PATCH /juror/:id/delete` - Eliminar jurado (soft delete, ya existía)

---

## 📊 Resumen de Pruebas CRUD

| Operación | Endpoint | Método | Descripción |
|-----------|----------|--------|-------------|
| **READ** | `/teams/incomplete-jurors` | GET | Listar equipos con menos de 3 jurados |
| **READ** | `/teams/:id/full` | GET | Info completa de equipo |
| **UPDATE** | `/teams/:id` | PATCH | Actualizar info del equipo |
| **UPDATE** | `/teams/:teamId/members/:memberId` | PATCH | Cambiar email de integrante |
| **READ** | `/juror/evaluators` | GET | Listar evaluadores con equipos |
| **CREATE** | `/juror/assignments` | POST | Asignar jurado a equipo |
| **READ** | `/juror/:id/teams` | GET | Equipos asignados a un jurado |

---

## ✅ Checklist de Pruebas

### Equipos (Teams)

#### GET /teams/incomplete-jurors
- [ ] Retorna lista de equipos
- [ ] Solo equipos con menos de 3 jurados
- [ ] Solo equipos activos y confirmados
- [ ] Incluye información del líder
- [ ] Incluye cantidad de jurados

#### GET /teams/:id/full
- [ ] Retorna información completa
- [ ] Incluye líder con email y nombre
- [ ] Incluye videojuego con `youtubeUrl` y `githubUrl`
- [ ] Incluye lista de miembros activos
- [ ] Incluye lista de jurados activos
- [ ] Incluye información de edición
- [ ] Error 404 si el equipo no existe

#### PATCH /teams/:id
- [ ] Actualiza nombre del equipo
- [ ] Actualiza descripción
- [ ] Actualiza `youtubeUrl` del videojuego
- [ ] Actualiza `githubUrl` del videojuego
- [ ] Actualiza `logoUrl` del videojuego
- [ ] Solo el líder puede actualizar
- [ ] Error si el nombre ya existe
- [ ] Error 401 si no eres el líder
- [ ] Error 404 si el equipo no existe

#### PATCH /teams/:teamId/members/:memberId
- [ ] Actualiza email del integrante
- [ ] Solo el líder puede cambiar
- [ ] Error si intentas cambiar email del líder
- [ ] Error si el email ya está en uso
- [ ] Error si el email no es institucional
- [ ] Error si el integrante no pertenece al equipo
- [ ] Error 404 si el integrante no existe

### Jurados (Juror)

#### GET /juror/evaluators
- [ ] Retorna lista de evaluadores
- [ ] Solo evaluadores activos
- [ ] Cada evaluador incluye equipos asignados
- [ ] Incluye cantidad de equipos
- [ ] Incluye nombre y videojuego de cada equipo

#### POST /juror/assignments
- [ ] Asigna jurado al equipo
- [ ] Retorna equipo actualizado
- [ ] Error si el jurado no existe
- [ ] Error si el equipo no existe
- [ ] Error si el jurado ya está asignado
- [ ] Error si el equipo ya tiene 3 jurados
- [ ] Error si el jurado está inactivo
- [ ] Error si el equipo está inactivo

#### GET /juror/:id/teams
- [ ] Retorna equipos asignados al jurado
- [ ] Solo equipos activos
- [ ] Incluye información completa de cada equipo
- [ ] Incluye videojuego con detalles
- [ ] Incluye líder
- [ ] Incluye otros jurados asignados
- [ ] Error 404 si el jurado no existe

---

## 🔍 Casos de Prueba Especiales

### Validaciones
- [ ] URLs de YouTube deben ser válidas
- [ ] URLs de GitHub deben ser válidas
- [ ] Emails deben ser institucionales (@uninorte.edu.co)
- [ ] Nombres de equipo deben ser únicos
- [ ] Máximo 3 jurados por equipo

### Permisos
- [ ] Solo líder puede actualizar información del equipo
- [ ] Solo líder puede cambiar emails de integrantes
- [ ] Usuarios sin permisos reciben error 403

### Filtrado
- [ ] Solo entidades activas se muestran
- [ ] Equipos inactivos no aparecen
- [ ] Jurados inactivos no aparecen
- [ ] Miembros inactivos no aparecen

---

## 📝 Notas

1. **Autenticación:** Todos los endpoints requieren estar autenticado (excepto los marcados como `@Public()`)
2. **Permisos:** Verifica que tengas los permisos necesarios en la base de datos
3. **IDs reales:** Usa IDs reales de tu base de datos para las pruebas
4. **Cookies:** Asegúrate de hacer login primero para obtener las cookies

---

## 🚀 Orden Recomendado de Pruebas

1. **Login** → Obtener cookies
2. **GET /teams/incomplete-jurors** → Ver qué equipos necesitan jurados
3. **GET /teams/:id/full** → Ver información completa de un equipo
4. **GET /juror/evaluators** → Ver qué evaluadores hay disponibles
5. **POST /juror/assignments** → Asignar un jurado a un equipo
6. **GET /juror/:id/teams** → Verificar que la asignación funcionó
7. **PATCH /teams/:id** → Actualizar información del equipo
8. **PATCH /teams/:teamId/members/:memberId** → Cambiar email de integrante

