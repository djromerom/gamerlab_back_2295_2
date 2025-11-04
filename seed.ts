import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

interface SeedData {
  table: string;
  data: any[];
}

async function main() {
  try {
    console.log('🌱 Starting seeding process from seed-data.json...');
    
    // Ruta al archivo JSON con los datos de seeding
    const seedDataPath = join(__dirname, 'prisma', 'seed-data.json');
    
    // Verificar si el archivo existe
    if (!existsSync(seedDataPath)) {
      console.log('⚠️  seed-data.json file not found. Skipping seeding...');
      return;
    }
    
    // Leer el archivo JSON
    const seedDataContent = readFileSync(seedDataPath, 'utf-8');
    const seedData: SeedData[] = JSON.parse(seedDataContent);
    
    console.log(`📄 Seeding file found with ${seedData.length} tables`);
    
    // Procesar cada tabla en el orden especificado
    for (const tableData of seedData) {
      console.log(`🔄 Processing table: ${tableData.table}`);
      
      // Ejecutar cada registro usando Prisma ORM
      for (const record of tableData.data) {
        try {
          // Usar el método createMany de Prisma según la tabla
          switch (tableData.table) {
            case 'tipo_token':
              await prisma.tokenType.createMany({
                data: [record],
                skipDuplicates: true
              });
              break;
            case 'estado_videojuego':
              await prisma.videogameStatus.createMany({
                data: [record],
                skipDuplicates: true
              });
              break;
            case 'estados_confirmacion':
              await prisma.confirmationStatus.createMany({
                data: [record],
                skipDuplicates: true
              });
              break;
            case 'roles':
              await prisma.role.createMany({
                data: [record],
                skipDuplicates: true
              });
              break;
            case 'ediciones':
              await prisma.edition.createMany({
                data: [record],
                skipDuplicates: true
              });
              break;
            case 'podio':
              await prisma.podium.createMany({
                data: [record],
                skipDuplicates: true
              });
              break;
            case 'enfoque_educativo':
              await prisma.educationalFocus.createMany({
                data: [record],
                skipDuplicates: true
              });
              break;
            case 'testimonio':
              await prisma.testimonial.createMany({
                data: [record],
                skipDuplicates: true
              });
              break;
            default:
              console.log(`⚠️  Table ${tableData.table} not recognized, skipping...`);
              continue;
          }
          
          console.log(`✅ Record created successfully in ${tableData.table}`);
        } catch (error) {
          console.error(`❌ Error creating record in ${tableData.table}:`, error);
          console.log(`Problematic record:`, JSON.stringify(record, null, 2));
          // Continuar con el siguiente registro aunque uno falle
        }
      }
    }
    
    console.log('🎉 Seeding process completed successfully');
    
  } catch (error) {
    console.error('💥 Error during seeding process:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar el seeding
main()
  .catch((e) => {
    console.error('Fatal error in seeding:', e);
    process.exit(1);
  });
