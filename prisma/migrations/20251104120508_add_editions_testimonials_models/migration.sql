-- AlterTable
ALTER TABLE "ediciones" ADD COLUMN     "titulo" VARCHAR(100),
ADD COLUMN     "año" INTEGER,
ADD COLUMN     "nombre_semestre" VARCHAR(50),
ADD COLUMN     "nombre" VARCHAR(100),
ADD COLUMN     "fecha" VARCHAR(50),
ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "descripcion2" TEXT,
ADD COLUMN     "juegos_destacados" TEXT,
ADD COLUMN     "alt" VARCHAR(100);

-- CreateTable
CREATE TABLE "podio" (
    "id_podio" SERIAL NOT NULL,
    "id_edicion" INTEGER NOT NULL,
    "puesto" INTEGER NOT NULL,
    "equipo" VARCHAR(100) NOT NULL,
    "juego" VARCHAR(100) NOT NULL,
    "puntuacion" DOUBLE PRECISION NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "podio_pkey" PRIMARY KEY ("id_podio")
);

-- CreateTable
CREATE TABLE "enfoque_educativo" (
    "id_enfoque" SERIAL NOT NULL,
    "id_edicion" INTEGER NOT NULL,
    "titulo" VARCHAR(100) NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enfoque_educativo_pkey" PRIMARY KEY ("id_enfoque")
);

-- CreateTable
CREATE TABLE "testimonio" (
    "id_testimonio" SERIAL NOT NULL,
    "id_edicion" INTEGER NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "rol" VARCHAR(100) NOT NULL,
    "cita" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "testimonio_pkey" PRIMARY KEY ("id_testimonio")
);

-- AddForeignKey
ALTER TABLE "podio" ADD CONSTRAINT "podio_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enfoque_educativo" ADD CONSTRAINT "enfoque_educativo_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testimonio" ADD CONSTRAINT "testimonio_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;
