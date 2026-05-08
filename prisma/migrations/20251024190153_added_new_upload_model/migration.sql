-- CreateTable
CREATE TABLE "archivos_subidos" (
    "id" TEXT NOT NULL,
    "blobName" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivos_subidos_pkey" PRIMARY KEY ("id")
);
