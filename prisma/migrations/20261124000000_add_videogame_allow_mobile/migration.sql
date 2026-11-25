-- TA-36 (ARK-326): "se puede jugar en celular", lo activa el administrador por videojuego.
-- Aditiva: todos los juegos quedan en false (siguen con el aviso «Este juego se juega en computador»).
-- Brainrot Breakout NO se marca aquí: su id cambia entre Arkad-test y producción; lo marca el
-- administrador desde «Editar equipo» antes de retirar la lista fija del front (mobileFriendly.ts).
ALTER TABLE "videojuegos" ADD COLUMN "permite_celular" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "videojuegos_historico" ADD COLUMN "permite_celular" BOOLEAN NOT NULL DEFAULT false;
