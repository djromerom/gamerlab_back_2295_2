# Sistema de Seeding para Prisma

Este sistema permite poblar automáticamente la base de datos con datos iniciales mediante un archivo JSON que contiene inserts SQL.

## Archivos Creados

- `seed.ts` - Script principal de seeding (en la raíz del proyecto)
- `prisma/seed-data.json` - Archivo JSON con los datos de seeding
- Configuración en `package.json` para comandos de seeding

## Estructura del Archivo JSON

El archivo `seed-data.json` debe seguir esta estructura con datos JSON puros:

```json
[
  {
    "table": "nombre_tabla",
    "data": [
      {
        "campo1": "valor1",
        "campo2": "valor2",
        "campo3": true
      },
      {
        "campo1": "valor3",
        "campo2": "valor4",
        "campo3": false
      }
    ]
  }
]
```

## Comandos Disponibles

### Comandos de Seeding
- `npm run prisma:seed` - Ejecuta solo el seeding
- `npm run db:seed` - Alias para prisma:seed
- `npm run db:setup` - Ejecuta migraciones y seeding
- `npm run db:reset` - Resetea la base de datos y ejecuta seeding

### Comandos de Prisma
- `npm run prisma:generate` - Genera el cliente de Prisma
- `npm run prisma:migrate` - Ejecuta migraciones en desarrollo
- `npm run prisma:migrate:deploy` - Despliega migraciones en producción
- `npm run prisma:migrate:reset` - Resetea la base de datos

## Uso Automático

El script de seeding se ejecutará automáticamente cuando uses:
- `prisma migrate reset` (resetea y ejecuta seeding)
- `prisma db seed` (ejecuta solo seeding)

## Personalización

### Agregar Nuevos Datos
1. Edita el archivo `prisma/seed-data.json`
2. Agrega nuevas tablas con sus respectivos datos JSON
3. Actualiza el script `seed.ts` para incluir el caso de la nueva tabla
4. Ejecuta `npm run prisma:seed` para aplicar los cambios

### Orden de Ejecución
Los registros se crean en el orden que aparecen en el array JSON. Asegúrate de respetar las dependencias entre tablas (foreign keys).

### Ventajas del Formato JSON
- ✅ **Datos estructurados** - Fácil de leer y mantener
- ✅ **Validación automática** - Prisma valida los tipos de datos
- ✅ **Sin SQL manual** - Usa el ORM de Prisma
- ✅ **Prevención de duplicados** - `skipDuplicates: true`
- ✅ **Mejor rendimiento** - `createMany` es más eficiente

### Ejemplo de Uso
```bash
# Configurar base de datos completa (migraciones + seeding)
npm run db:setup

# Solo ejecutar seeding
npm run db:seed

# Resetear base de datos y ejecutar seeding
npm run db:reset
```

## Datos Incluidos

El archivo `seed-data.json` incluye datos JSON puros para las siguientes tablas:
- `tipo_token` - Tipos de token de verificación
- `estado_videojuego` - Estados de los videojuegos  
- `estados_confirmacion` - Estados de confirmación de usuarios
- `roles` - Roles de usuario (Administrador, Estudiante, Profesor, Jurado)
- `ediciones` - Ediciones del evento

## Notas Importantes

- El script usa Prisma ORM en lugar de SQL raw
- Los datos están en formato JSON puro, no como strings SQL
- El script maneja errores graciosamente - si un registro falla, continúa con el siguiente
- Los logs muestran el progreso de cada operación
- El archivo JSON es opcional - si no existe, el seeding se omite sin errores
- Usa `createMany` con `skipDuplicates: true` para mejor rendimiento
- Los datos están basados en el archivo `init-db.sql` original pero convertidos a JSON
