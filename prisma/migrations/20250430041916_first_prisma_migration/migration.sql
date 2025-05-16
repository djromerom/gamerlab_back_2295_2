-- CreateTable
CREATE TABLE "ediciones" (
    "id_edicion" SERIAL NOT NULL,
    "semestre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ediciones_pkey" PRIMARY KEY ("id_edicion")
);

-- CreateTable
CREATE TABLE "configuracion_evento" (
    "id" SERIAL NOT NULL,
    "evaluaciones_abiertas" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id_rol" SERIAL NOT NULL,
    "rol" TEXT NOT NULL,
    "descripcion" TEXT,
    "estado" BOOLEAN,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id_rol")
);

-- CreateTable
CREATE TABLE "servicio" (
    "id_servicio" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "url" TEXT,
    "metodo" VARCHAR(10),
    "estado" BOOLEAN,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servicio_pkey" PRIMARY KEY ("id_servicio")
);

-- CreateTable
CREATE TABLE "permisos" (
    "id_permiso" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "estado" BOOLEAN,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("id_permiso")
);

-- CreateTable
CREATE TABLE "rol_permiso" (
    "id_rol" INTEGER NOT NULL,
    "id_permiso" INTEGER NOT NULL,
    "estado" BOOLEAN,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rol_permiso_pkey" PRIMARY KEY ("id_rol","id_permiso")
);

-- CreateTable
CREATE TABLE "servicio_permiso" (
    "id_servicio" INTEGER NOT NULL,
    "id_permiso" INTEGER NOT NULL,
    "estado" BOOLEAN,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servicio_permiso_pkey" PRIMARY KEY ("id_servicio","id_permiso")
);

-- CreateTable
CREATE TABLE "estados_confirmacion" (
    "id_estado" SERIAL NOT NULL,
    "estado" VARCHAR(30) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estados_confirmacion_pkey" PRIMARY KEY ("id_estado")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id_usuario" TEXT NOT NULL,
    "name" VARCHAR(20),
    "username" VARCHAR(30),
    "correo" VARCHAR(30) NOT NULL,
    "id_estado_confirmacion" INTEGER,
    "activo" BOOLEAN DEFAULT false,
    "id_rol" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "equipos" (
    "id_equipo" SERIAL NOT NULL,
    "nombre_equipo" VARCHAR(50) NOT NULL,
    "fecha_registro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado_confirmacion" BOOLEAN,
    "id_usuario" TEXT NOT NULL,
    "id_edicion" INTEGER NOT NULL,

    CONSTRAINT "equipos_pkey" PRIMARY KEY ("id_equipo")
);

-- CreateTable
CREATE TABLE "integrante" (
    "id_integrante" SERIAL NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,
    "apellido" VARCHAR(50) NOT NULL,
    "correo" VARCHAR(100) NOT NULL,
    "codigo_estudiantil" VARCHAR(100) NOT NULL,
    "id_equipo" INTEGER NOT NULL,

    CONSTRAINT "integrante_pkey" PRIMARY KEY ("id_integrante")
);

-- CreateTable
CREATE TABLE "estado_videojuego" (
    "id_estado" SERIAL NOT NULL,
    "estado" VARCHAR(30) NOT NULL,

    CONSTRAINT "estado_videojuego_pkey" PRIMARY KEY ("id_estado")
);

-- CreateTable
CREATE TABLE "videojuegos" (
    "id_videojuego" SERIAL NOT NULL,
    "nombre" VARCHAR(30) NOT NULL,
    "descripcion" TEXT,
    "logo_url" TEXT,
    "fecha_registro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_estado_videojuego" INTEGER NOT NULL,
    "id_equipo" INTEGER NOT NULL,

    CONSTRAINT "videojuegos_pkey" PRIMARY KEY ("id_videojuego")
);

-- CreateTable
CREATE TABLE "evaluacion" (
    "id_evaluacion" SERIAL NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comentarios" TEXT,
    "puntaje_total" DOUBLE PRECISION,
    "id_jurado" TEXT NOT NULL,
    "id_videojuego" INTEGER NOT NULL,
    "id_edicion" INTEGER NOT NULL,

    CONSTRAINT "evaluacion_pkey" PRIMARY KEY ("id_evaluacion")
);

-- CreateTable
CREATE TABLE "materia" (
    "id_materia" SERIAL NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,
    "codigo" VARCHAR(50),
    "semestre" INTEGER NOT NULL,

    CONSTRAINT "materia_pkey" PRIMARY KEY ("id_materia")
);

-- CreateTable
CREATE TABLE "nrc" (
    "id_nrc" SERIAL NOT NULL,
    "codigo" INTEGER NOT NULL,
    "id_materia" INTEGER NOT NULL,
    "id_profesor" TEXT NOT NULL,

    CONSTRAINT "nrc_pkey" PRIMARY KEY ("id_nrc")
);

-- CreateTable
CREATE TABLE "criterios" (
    "id_criterio" SERIAL NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,
    "descripcion" TEXT,
    "peso" DOUBLE PRECISION,

    CONSTRAINT "criterios_pkey" PRIMARY KEY ("id_criterio")
);

-- CreateTable
CREATE TABLE "detalle_evaluacion" (
    "id_detalle" SERIAL NOT NULL,
    "puntaje" DOUBLE PRECISION NOT NULL,
    "id_evaluacion" INTEGER NOT NULL,
    "id_criterio" INTEGER NOT NULL,

    CONSTRAINT "detalle_evaluacion_pkey" PRIMARY KEY ("id_detalle")
);

-- CreateTable
CREATE TABLE "_JurorTeamAssignment" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_JurorTeamAssignment_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_MemberNRC" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_MemberNRC_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "ediciones_semestre_key" ON "ediciones"("semestre");

-- CreateIndex
CREATE UNIQUE INDEX "roles_rol_key" ON "roles"("rol");

-- CreateIndex
CREATE UNIQUE INDEX "servicio_nombre_key" ON "servicio"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "permisos_nombre_key" ON "permisos"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "estados_confirmacion_estado_key" ON "estados_confirmacion"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_username_key" ON "usuarios"("username");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_key" ON "usuarios"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "equipos_nombre_equipo_key" ON "equipos"("nombre_equipo");

-- CreateIndex
CREATE UNIQUE INDEX "equipos_id_usuario_key" ON "equipos"("id_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "integrante_correo_key" ON "integrante"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "integrante_codigo_estudiantil_key" ON "integrante"("codigo_estudiantil");

-- CreateIndex
CREATE UNIQUE INDEX "videojuegos_id_equipo_key" ON "videojuegos"("id_equipo");

-- CreateIndex
CREATE UNIQUE INDEX "evaluacion_id_jurado_id_videojuego_key" ON "evaluacion"("id_jurado", "id_videojuego");

-- CreateIndex
CREATE UNIQUE INDEX "nrc_codigo_key" ON "nrc"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "detalle_evaluacion_id_evaluacion_id_criterio_key" ON "detalle_evaluacion"("id_evaluacion", "id_criterio");

-- CreateIndex
CREATE INDEX "_JurorTeamAssignment_B_index" ON "_JurorTeamAssignment"("B");

-- CreateIndex
CREATE INDEX "_MemberNRC_B_index" ON "_MemberNRC"("B");

-- AddForeignKey
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_id_rol_fkey" FOREIGN KEY ("id_rol") REFERENCES "roles"("id_rol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_id_permiso_fkey" FOREIGN KEY ("id_permiso") REFERENCES "permisos"("id_permiso") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicio_permiso" ADD CONSTRAINT "servicio_permiso_id_servicio_fkey" FOREIGN KEY ("id_servicio") REFERENCES "servicio"("id_servicio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicio_permiso" ADD CONSTRAINT "servicio_permiso_id_permiso_fkey" FOREIGN KEY ("id_permiso") REFERENCES "permisos"("id_permiso") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_id_estado_confirmacion_fkey" FOREIGN KEY ("id_estado_confirmacion") REFERENCES "estados_confirmacion"("id_estado") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_id_rol_fkey" FOREIGN KEY ("id_rol") REFERENCES "roles"("id_rol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrante" ADD CONSTRAINT "integrante_id_equipo_fkey" FOREIGN KEY ("id_equipo") REFERENCES "equipos"("id_equipo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videojuegos" ADD CONSTRAINT "videojuegos_id_estado_videojuego_fkey" FOREIGN KEY ("id_estado_videojuego") REFERENCES "estado_videojuego"("id_estado") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videojuegos" ADD CONSTRAINT "videojuegos_id_equipo_fkey" FOREIGN KEY ("id_equipo") REFERENCES "equipos"("id_equipo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluacion" ADD CONSTRAINT "evaluacion_id_jurado_fkey" FOREIGN KEY ("id_jurado") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluacion" ADD CONSTRAINT "evaluacion_id_videojuego_fkey" FOREIGN KEY ("id_videojuego") REFERENCES "videojuegos"("id_videojuego") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluacion" ADD CONSTRAINT "evaluacion_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nrc" ADD CONSTRAINT "nrc_id_materia_fkey" FOREIGN KEY ("id_materia") REFERENCES "materia"("id_materia") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nrc" ADD CONSTRAINT "nrc_id_profesor_fkey" FOREIGN KEY ("id_profesor") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_evaluacion" ADD CONSTRAINT "detalle_evaluacion_id_evaluacion_fkey" FOREIGN KEY ("id_evaluacion") REFERENCES "evaluacion"("id_evaluacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_evaluacion" ADD CONSTRAINT "detalle_evaluacion_id_criterio_fkey" FOREIGN KEY ("id_criterio") REFERENCES "criterios"("id_criterio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_JurorTeamAssignment" ADD CONSTRAINT "_JurorTeamAssignment_A_fkey" FOREIGN KEY ("A") REFERENCES "equipos"("id_equipo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_JurorTeamAssignment" ADD CONSTRAINT "_JurorTeamAssignment_B_fkey" FOREIGN KEY ("B") REFERENCES "usuarios"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MemberNRC" ADD CONSTRAINT "_MemberNRC_A_fkey" FOREIGN KEY ("A") REFERENCES "integrante"("id_integrante") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MemberNRC" ADD CONSTRAINT "_MemberNRC_B_fkey" FOREIGN KEY ("B") REFERENCES "nrc"("id_nrc") ON DELETE CASCADE ON UPDATE CASCADE;
