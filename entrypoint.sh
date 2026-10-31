#!/bin/sh
echo "Generating Prisma client..."
npx prisma generate

echo "Running database migrations..."
npx prisma migrate deploy

echo "Database migrations completed"

if [ "$NODE_ENV" = "production" ]; then
  echo "Skipping database seeding in production."
else
  echo "Running database seeding..."
  node dist/seed.js
  echo "Database seeding completed"
fi

echo "Starting application..."
exec "$@"
