-- Refresh tokens revocables (ARK-SP1, I3): se guarda solo el sha256 de cada refresh emitido.
-- Idempotente: se puede volver a ejecutar sin error.
-- Al desplegar no hay registros: las sesiones abiertas antes caen a 401 en su próximo refresh (una sola vez).

-- CreateTable
CREATE TABLE IF NOT EXISTS "refresh_token" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "revocado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "refresh_token_token_hash_key" ON "refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "refresh_token_user_id_idx" ON "refresh_token"("user_id");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'refresh_token_user_id_fkey'
    ) THEN
        ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuarios"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
