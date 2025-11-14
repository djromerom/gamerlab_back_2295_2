-- AlterTable
ALTER TABLE "usuarios" ALTER COLUMN "metodo_auth" DROP NOT NULL,
ALTER COLUMN "metodo_auth" DROP DEFAULT;
