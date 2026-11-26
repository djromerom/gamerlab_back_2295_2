-- Likes sin iniciar sesión: un like puede ser de un visitante anónimo (cookie arkad_visitor).
-- Los likes existentes son todos de usuarios con sesión, así que el CHECK se cumple al aplicarlo.

-- AlterTable
ALTER TABLE "videogame_likes" ADD COLUMN     "visitor_id" VARCHAR(64),
ALTER COLUMN "user_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "videogame_likes_id_videojuego_visitor_id_key" ON "videogame_likes"("id_videojuego", "visitor_id");

-- Exactamente uno: usuario con sesión o visitante (Prisma no expresa CHECK).
ALTER TABLE "videogame_likes" ADD CONSTRAINT "videogame_likes_un_autor_check" CHECK (("user_id" IS NULL) <> ("visitor_id" IS NULL));
