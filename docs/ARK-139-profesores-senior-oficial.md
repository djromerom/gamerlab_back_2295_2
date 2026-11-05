# ARK-139: profesores como jurado Senior y Oficial

La migración `20261105000000_profesores_senior_oficial` deja a todo profesor con categoría `SENIOR` y, si no tenía tipo, con tipo `OFFICIAL`. Solo cambia valores vacíos. Corre sola con `prisma migrate deploy` al desplegar.

Antes de desplegar en producción, DevOps saca el respaldo y el recuento. Después del despliegue, repite el recuento.

## 1. Respaldo (antes del despliegue)

```sql
CREATE TABLE respaldo_ark139_profesores AS
SELECT u.id_usuario, u.correo, u.categoria_jurado, u.tipo_jurado, u.actualizado_en
FROM usuarios u
JOIN roles r ON r.id_rol = u.id_rol
WHERE r.rol = 'Profesor';
```

## 2. Recuento (antes y después)

```sql
SELECT
  COUNT(*)                                                  AS profesores,
  COUNT(*) FILTER (WHERE u.categoria_jurado IS NULL)        AS sin_categoria,
  COUNT(*) FILTER (WHERE u.categoria_jurado = 'JUNIOR')     AS junior,
  COUNT(*) FILTER (WHERE u.categoria_jurado = 'SENIOR')     AS senior,
  COUNT(*) FILTER (WHERE u.tipo_jurado IS NULL)             AS sin_tipo,
  COUNT(*) FILTER (WHERE u.tipo_jurado = 'OFFICIAL')        AS oficial,
  COUNT(*) FILTER (WHERE u.tipo_jurado = 'BACKUP')          AS suplente
FROM usuarios u
JOIN roles r ON r.id_rol = u.id_rol
WHERE r.rol = 'Profesor';
```

Después del despliegue, `sin_categoria` y `sin_tipo` deben dar 0, y `profesores` debe dar lo mismo que antes. Si `junior` no da 0, hay profesores marcados a mano como Junior: la migración no los toca y hay que revisarlos con el Product Owner.

## 3. Jurados Senior que no son profesores (solo lectura)

La regla P-07 dice que Senior es solo para profesores, y el plan pide revisarlo antes de probar la asignación automática (HU-07). Esta migración no toca a los jurados. Esta consulta los lista para que el equipo decida:

```sql
SELECT u.id_usuario, u.correo, r.rol, u.categoria_jurado, u.tipo_jurado
FROM usuarios u
JOIN roles r ON r.id_rol = u.id_rol
WHERE u.categoria_jurado = 'SENIOR'
  AND r.rol <> 'Profesor'
  AND u.activo = true;
```

## 4. Volver atrás (solo si hace falta)

```sql
UPDATE usuarios u
SET categoria_jurado = b.categoria_jurado,
    tipo_jurado      = b.tipo_jurado
FROM respaldo_ark139_profesores b
WHERE u.id_usuario = b.id_usuario;
```

Cuando el recuento esté bien, se puede borrar `respaldo_ark139_profesores`.
