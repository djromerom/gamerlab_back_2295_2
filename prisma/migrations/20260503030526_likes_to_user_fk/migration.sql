/*
  Warnings:

  - You are about to drop the column `visitor_id` on the `videogame_likes` table. All the data in the column will be lost.
  - You are about to drop the column `likes` on the `videojuegos` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[id_videojuego,user_id]` on the table `videogame_likes` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `user_id` to the `videogame_likes` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."videogame_likes_id_videojuego_visitor_id_key";

-- AlterTable
ALTER TABLE "videogame_likes" DROP COLUMN "visitor_id",
ADD COLUMN     "user_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "videojuegos" DROP COLUMN "likes";

-- CreateIndex
CREATE UNIQUE INDEX "videogame_likes_id_videojuego_user_id_key" ON "videogame_likes"("id_videojuego", "user_id");

-- AddForeignKey
ALTER TABLE "videogame_likes" ADD CONSTRAINT "videogame_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuarios"("id_usuario") ON DELETE CASCADE ON UPDATE NO ACTION;
