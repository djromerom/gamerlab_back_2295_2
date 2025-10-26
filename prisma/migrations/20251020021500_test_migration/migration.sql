/*
  Warnings:

  - You are about to drop the column `LastName` on the `usuarios` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `usuarios` table. All the data in the column will be lost.
  - You are about to drop the column `username` on the `usuarios` table. All the data in the column will be lost.
  - Added the required column `lastName` to the `usuarios` table without a default value. This is not possible if the table is not empty.
  - Made the column `firstName` on table `usuarios` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "nrc_codigo_key";

-- DropIndex
DROP INDEX "usuarios_username_key";

-- AlterTable
ALTER TABLE "usuarios" DROP COLUMN "LastName",
DROP COLUMN "name",
DROP COLUMN "username",
ADD COLUMN     "lastName" VARCHAR(50) NOT NULL,
ALTER COLUMN "firstName" SET NOT NULL;

-- CreateTable
CREATE TABLE "tipo_token" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tipo_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_verificacion" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tipo_id" INTEGER NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_verificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipo_token_tipo_key" ON "tipo_token"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "token_verificacion_token_key" ON "token_verificacion"("token");

-- CreateIndex
CREATE INDEX "token_verificacion_email_tipo_id_idx" ON "token_verificacion"("email", "tipo_id");

-- AddForeignKey
ALTER TABLE "token_verificacion" ADD CONSTRAINT "token_verificacion_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "tipo_token"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
