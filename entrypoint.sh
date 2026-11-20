#!/bin/sh
# Si un paso falla (prisma generate o migrate deploy), el contenedor se detiene en vez de
# arrancar la app sobre un esquema viejo sin que nadie lo note.
set -e

echo "Generating Prisma client..."
npx prisma generate

echo "Running database migrations..."
npx prisma migrate deploy

echo "Database migrations completed"

if [ "$NODE_ENV" = "production" ]; then
  echo "Skipping database seeding in production."
else
  echo "Running database seeding..."
  # El seed solo corre fuera de producción; si falla, se avisa pero la app arranca igual
  # (mismo comportamiento que antes de set -e).
  if node dist/seed.js; then
    echo "Database seeding completed"
  else
    echo "WARNING: database seeding failed; starting the application anyway." >&2
  fi
fi

echo "Starting application..."
exec "$@"
