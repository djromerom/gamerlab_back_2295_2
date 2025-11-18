#!/bin/sh
echo "Generating Prisma client..."
npx prisma generate

echo "Running database migrations..."
npx prisma migrate deploy

echo "Database migrations completed"

echo "Running database seeding..."
node dist/seed.js

echo "Database seeding completed"

echo "Starting application..."
exec "$@"
