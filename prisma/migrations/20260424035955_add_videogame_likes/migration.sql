-- CreateTable
CREATE TABLE "videogame_likes" (
    "id" SERIAL NOT NULL,
    "id_videojuego" INTEGER NOT NULL,
    "visitor_id" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "videogame_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "videogame_likes_id_videojuego_visitor_id_key" ON "videogame_likes"("id_videojuego", "visitor_id");

-- AddForeignKey
ALTER TABLE "videogame_likes" ADD CONSTRAINT "videogame_likes_id_videojuego_fkey" FOREIGN KEY ("id_videojuego") REFERENCES "videojuegos"("id_videojuego") ON DELETE CASCADE ON UPDATE NO ACTION;
