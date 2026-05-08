-- CreateEnum
CREATE TYPE "JurorCategory" AS ENUM ('JUNIOR', 'SENIOR');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "categoria_jurado" "JurorCategory";

-- CreateIndex
CREATE INDEX "usuarios_categoria_jurado_idx" ON "usuarios"("categoria_jurado");
