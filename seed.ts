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
    console.log('🌱 Iniciando proceso de seeding desde seed-data.json...');
    
    // Ruta al archivo JSON con los datos de seeding
    const seedDataPath = join(__dirname, 'prisma', 'seed-data.json');
    
    // Verificar si el archivo existe
    if (!existsSync(seedDataPath)) {
      console.log('⚠️  Archivo seed-data.json no encontrado. Saltando seeding...');
      return;
    }
    
    // Leer el archivo JSON
    const seedDataContent = readFileSync(seedDataPath, 'utf-8');
    const seedData: SeedData[] = JSON.parse(seedDataContent);
    
    console.log(`📄 Archivo de seeding encontrado con ${seedData.length} tablas`);
    
    // Procesar cada tabla en el orden especificado
    for (const tableData of seedData) {
      console.log(`🔄 Procesando tabla: ${tableData.table}`);
      
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
            default:
              console.log(`⚠️  Tabla ${tableData.table} no reconocida, saltando...`);
              continue;
          }
          
          console.log(`✅ Registro creado exitosamente en ${tableData.table}`);
        } catch (error) {
          console.error(`❌ Error creando registro en ${tableData.table}:`, error);
          console.log(`Registro problemático:`, JSON.stringify(record, null, 2));
          // Continuar con el siguiente registro aunque uno falle
        }
      }
    }
    
    console.log('🎉 Proceso de seeding completado exitosamente');
    
  } catch (error) {
    console.error('💥 Error durante el proceso de seeding:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar el seeding
main()
  .catch((e) => {
    console.error('Error fatal en seeding:', e);
    process.exit(1);
  });
