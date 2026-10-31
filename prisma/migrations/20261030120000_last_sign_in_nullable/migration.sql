-- AlterTable: ultimoInicioSesion solo se llena al iniciar sesión (null = nunca ingresó)
ALTER TABLE "usuarios" ALTER COLUMN "ultimoInicioSesion" DROP NOT NULL,
ALTER COLUMN "ultimoInicioSesion" DROP DEFAULT;
