-- HU-50 (ARK-310 / ARK-314): el Administrador puede desactivar el código de verificación de un
-- equipo (Equipos inscritos) o de todos (Configuración del evento). Por defecto todo sigue
-- exigiéndose como hoy: los equipos y las configuraciones existentes quedan en true.

-- Registro de quién desactivó o volvió a activar el código de un equipo.
-- PostgreSQL 12+ admite ADD VALUE dentro de la transacción mientras el valor no se use en ella.
ALTER TYPE "TeamVerificationAction" ADD VALUE 'CODE_DISABLED';
ALTER TYPE "TeamVerificationAction" ADD VALUE 'CODE_ENABLED';

-- Interruptor global «Exigir código de verificación a los jurados» (por edición) y su último cambio.
ALTER TABLE "configuracion_evento"
  ADD COLUMN "exigir_codigo_verificacion" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "exigir_codigo_verificacion_cambiado_en" TIMESTAMP(3),
  ADD COLUMN "exigir_codigo_verificacion_cambiado_por" TEXT;

-- Interruptor por equipo.
ALTER TABLE "equipos" ADD COLUMN "codigo_verificacion_requerido" BOOLEAN NOT NULL DEFAULT true;
