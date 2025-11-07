# 🧪 Comandos para Probar Endpoints desde la Consola

Comandos listos para usar en PowerShell o bash para probar los nuevos endpoints.

## 🔐 Paso 1: Obtener Token de Autenticación

### PowerShell
```powershell
# Hacer login y guardar cookies
$loginResponse = Invoke-WebRequest -Uri "http://localhost:3000/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"tu-email@uninorte.edu.co","password":"tu-password"}' `
  -SessionVariable session

# Las cookies se guardan en $session
```

### cURL (funciona en PowerShell y bash)
```bash
# Hacer login y guardar cookies
curl -X POST "http://localhost:3000/auth/login" `
  -H "Content-Type: application/json" `
  -d "{\"email\":\"tu-email@uninorte.edu.co\",\"password\":\"tu-password\"}" `
  -c cookies.txt
```

---

## 🎯 Endpoints de Equipos (Teams)

### 1. Obtener Equipos con Menos de 3 Jurados

**PowerShell:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/teams/incomplete-jurors" `
  -Method GET `
  -ContentType "application/json" `
  -WebSession $session | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

**cURL:**
```bash
curl -X GET "http://localhost:3000/teams/incomplete-jurors" `
  -H "Content-Type: application/json" `
  -b cookies.txt
```

---

### 2. Obtener Información Completa de un Equipo

**PowerShell:**
```powershell
# Reemplaza 1 con el ID real del equipo
Invoke-WebRequest -Uri "http://localhost:3000/teams/1/full" `
  -Method GET `
  -ContentType "application/json" `
  -WebSession $session | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

**cURL:**
```bash
# Reemplaza 1 con el ID real del equipo
curl -X GET "http://localhost:3000/teams/1/full" `
  -H "Content-Type: application/json" `
  -b cookies.txt
```

---

### 3. Actualizar Información del Equipo

**PowerShell:**
```powershell
# Reemplaza 1 con el ID real del equipo
$body = @{
    teamName = "Nuevo Nombre del Equipo"
    description = "Nueva descripción"
    youtubeUrl = "https://www.youtube.com/watch?v=ejemplo"
    githubUrl = "https://github.com/usuario/repositorio"
    logoUrl = "https://ejemplo.com/logo.png"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/teams/1" `
  -Method PATCH `
  -ContentType "application/json" `
  -Body $body `
  -WebSession $session | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

**cURL:**
```bash
# Reemplaza 1 con el ID real del equipo
curl -X PATCH "http://localhost:3000/teams/1" `
  -H "Content-Type: application/json" `
  -b cookies.txt `
  -d "{\"teamName\":\"Nuevo Nombre\",\"description\":\"Nueva descripción\",\"youtubeUrl\":\"https://www.youtube.com/watch?v=ejemplo\",\"githubUrl\":\"https://github.com/usuario/repo\"}"
```

**Solo actualizar YouTube y GitHub:**
```bash
curl -X PATCH "http://localhost:3000/teams/1" `
  -H "Content-Type: application/json" `
  -b cookies.txt `
  -d "{\"youtubeUrl\":\"https://www.youtube.com/watch?v=ejemplo\",\"githubUrl\":\"https://github.com/usuario/repo\"}"
```

---

### 4. Cambiar Email de un Integrante

**PowerShell:**
```powershell
# Reemplaza 1 y 5 con los IDs reales (teamId y memberId)
$body = @{
    email = "nuevoemail@uninorte.edu.co"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/teams/1/members/5" `
  -Method PATCH `
  -ContentType "application/json" `
  -Body $body `
  -WebSession $session | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

**cURL:**
```bash
# Reemplaza 1 y 5 con los IDs reales (teamId y memberId)
curl -X PATCH "http://localhost:3000/teams/1/members/5" `
  -H "Content-Type: application/json" `
  -b cookies.txt `
  -d "{\"email\":\"nuevoemail@uninorte.edu.co\"}"
```

---

## 👨‍⚖️ Endpoints de Jurados (Juror)

### 5. Obtener Lista de Evaluadores con Equipos

**PowerShell:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/juror/evaluators" `
  -Method GET `
  -ContentType "application/json" `
  -WebSession $session | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

**cURL:**
```bash
curl -X GET "http://localhost:3000/juror/evaluators" `
  -H "Content-Type: application/json" `
  -b cookies.txt
```

---

### 6. Asignar Jurado a Equipo

**PowerShell:**
```powershell
# Reemplaza los valores con IDs reales
$body = @{
    jurorId = "uuid-del-jurado"
    teamId = 1
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/juror/assignments" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body `
  -WebSession $session | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

**cURL:**
```bash
# Reemplaza los valores con IDs reales
curl -X POST "http://localhost:3000/juror/assignments" `
  -H "Content-Type: application/json" `
  -b cookies.txt `
  -d "{\"jurorId\":\"uuid-del-jurado\",\"teamId\":1}"
```

---

### 7. Obtener Equipos Asignados a un Jurado

**PowerShell:**
```powershell
# Reemplaza uuid-del-jurado con el ID real del jurado
Invoke-WebRequest -Uri "http://localhost:3000/juror/uuid-del-jurado/teams" `
  -Method GET `
  -ContentType "application/json" `
  -WebSession $session | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

**cURL:**
```bash
# Reemplaza uuid-del-jurado con el ID real del jurado
curl -X GET "http://localhost:3000/juror/uuid-del-jurado/teams" `
  -H "Content-Type: application/json" `
  -b cookies.txt
```

---

## 📝 Script Completo para PowerShell

Copia y pega este script completo en PowerShell (reemplaza los valores marcados):

```powershell
# Configuración
$baseUrl = "http://localhost:3000"
$email = "tu-email@uninorte.edu.co"
$password = "tu-password"
$teamId = 1
$memberId = 5
$jurorId = "uuid-del-jurado"

# 1. Login
Write-Host "🔐 Haciendo login..." -ForegroundColor Cyan
$loginBody = @{
    email = $email
    password = $password
} | ConvertTo-Json

$loginResponse = Invoke-WebRequest -Uri "$baseUrl/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body $loginBody `
  -SessionVariable session

Write-Host "✅ Login exitoso" -ForegroundColor Green

# 2. Obtener equipos con menos de 3 jurados
Write-Host "`n📋 Obteniendo equipos con menos de 3 jurados..." -ForegroundColor Cyan
$response = Invoke-WebRequest -Uri "$baseUrl/teams/incomplete-jurors" `
  -Method GET `
  -ContentType "application/json" `
  -WebSession $session
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10

# 3. Obtener información completa de un equipo
Write-Host "`n📋 Obteniendo información completa del equipo $teamId..." -ForegroundColor Cyan
$response = Invoke-WebRequest -Uri "$baseUrl/teams/$teamId/full" `
  -Method GET `
  -ContentType "application/json" `
  -WebSession $session
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10

# 4. Obtener lista de evaluadores
Write-Host "`n👨‍⚖️ Obteniendo lista de evaluadores..." -ForegroundColor Cyan
$response = Invoke-WebRequest -Uri "$baseUrl/juror/evaluators" `
  -Method GET `
  -ContentType "application/json" `
  -WebSession $session
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10

# 5. Obtener equipos de un jurado
Write-Host "`n📋 Obteniendo equipos del jurado $jurorId..." -ForegroundColor Cyan
$response = Invoke-WebRequest -Uri "$baseUrl/juror/$jurorId/teams" `
  -Method GET `
  -ContentType "application/json" `
  -WebSession $session
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10

Write-Host "`n✅ Pruebas completadas" -ForegroundColor Green
```

---

## 📝 Script Completo para Bash (Linux/Mac/Git Bash)

```bash
#!/bin/bash

# Configuración
BASE_URL="http://localhost:3000"
EMAIL="tu-email@uninorte.edu.co"
PASSWORD="tu-password"
TEAM_ID=1
MEMBER_ID=5
JUROR_ID="uuid-del-jurado"

# 1. Login
echo "🔐 Haciendo login..."
curl -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  -c cookies.txt

echo -e "\n✅ Login exitoso\n"

# 2. Obtener equipos con menos de 3 jurados
echo "📋 Obteniendo equipos con menos de 3 jurados..."
curl -X GET "$BASE_URL/teams/incomplete-jurors" \
  -H "Content-Type: application/json" \
  -b cookies.txt | jq .

# 3. Obtener información completa de un equipo
echo -e "\n📋 Obteniendo información completa del equipo $TEAM_ID..."
curl -X GET "$BASE_URL/teams/$TEAM_ID/full" \
  -H "Content-Type: application/json" \
  -b cookies.txt | jq .

# 4. Obtener lista de evaluadores
echo -e "\n👨‍⚖️ Obteniendo lista de evaluadores..."
curl -X GET "$BASE_URL/juror/evaluators" \
  -H "Content-Type: application/json" \
  -b cookies.txt | jq .

# 5. Obtener equipos de un jurado
echo -e "\n📋 Obteniendo equipos del jurado $JUROR_ID..."
curl -X GET "$BASE_URL/juror/$JUROR_ID/teams" \
  -H "Content-Type: application/json" \
  -b cookies.txt | jq .

echo -e "\n✅ Pruebas completadas"
```

---

## 🔧 Comandos Rápidos (cURL)

### Login y guardar cookies
```bash
curl -X POST "http://localhost:3000/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"tu-email@uninorte.edu.co\",\"password\":\"tu-password\"}" -c cookies.txt
```

### 1. Equipos con menos de 3 jurados
```bash
curl -X GET "http://localhost:3000/teams/incomplete-jurors" -H "Content-Type: application/json" -b cookies.txt
```

### 2. Info completa del equipo
```bash
curl -X GET "http://localhost:3000/teams/1/full" -H "Content-Type: application/json" -b cookies.txt
```

### 3. Actualizar info del equipo
```bash
curl -X PATCH "http://localhost:3000/teams/1" -H "Content-Type: application/json" -b cookies.txt -d "{\"youtubeUrl\":\"https://www.youtube.com/watch?v=ejemplo\",\"githubUrl\":\"https://github.com/usuario/repo\"}"
```

### 4. Cambiar email de integrante
```bash
curl -X PATCH "http://localhost:3000/teams/1/members/5" -H "Content-Type: application/json" -b cookies.txt -d "{\"email\":\"nuevoemail@uninorte.edu.co\"}"
```

### 5. Lista de evaluadores
```bash
curl -X GET "http://localhost:3000/juror/evaluators" -H "Content-Type: application/json" -b cookies.txt
```

### 6. Asignar jurado a equipo
```bash
curl -X POST "http://localhost:3000/juror/assignments" -H "Content-Type: application/json" -b cookies.txt -d "{\"jurorId\":\"uuid-del-jurado\",\"teamId\":1}"
```

### 7. Equipos de un jurado
```bash
curl -X GET "http://localhost:3000/juror/uuid-del-jurado/teams" -H "Content-Type: application/json" -b cookies.txt
```

---

## 💡 Tips

1. **Formatear JSON en PowerShell:**
   ```powershell
   $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
   ```

2. **Formatear JSON en bash (requiere jq):**
   ```bash
   curl ... | jq .
   ```

3. **Ver solo el código de estado:**
   ```bash
   curl -X GET "http://localhost:3000/teams/incomplete-jurors" -H "Content-Type: application/json" -b cookies.txt -w "\nHTTP Status: %{http_code}\n" -o /dev/null -s
   ```

4. **Guardar respuesta en archivo:**
   ```bash
   curl -X GET "http://localhost:3000/teams/incomplete-jurors" -H "Content-Type: application/json" -b cookies.txt -o response.json
   ```

---

## ⚠️ Notas Importantes

- Reemplaza los valores marcados (`tu-email@uninorte.edu.co`, `1`, `5`, `uuid-del-jurado`) con valores reales de tu base de datos
- Asegúrate de que el servidor esté corriendo en `http://localhost:3000`
- Las cookies se guardan en `cookies.txt` (cURL) o en `$session` (PowerShell)
- Si obtienes error 401, vuelve a hacer login

