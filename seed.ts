import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';

const prisma = new PrismaClient();

interface SeedData {
  table: string;
  data: any[];
}

async function main() {
  const configService = new ConfigService();

  try {
    console.log('🌱 Starting seeding process from seed-data.json...');

    // Ruta al archivo JSON con los datos de seeding
    const seedDataPath = join(process.cwd(), 'prisma', 'seed-data.json');

    // Verificar si el archivo existe
    if (!existsSync(seedDataPath)) {
      console.log(`⚠️ ${seedDataPath} file not found. Skipping seeding...`);
      return;
    }

    // Leer el archivo JSON
    const seedDataContent = readFileSync(seedDataPath, 'utf-8');
    const seedData: SeedData[] = JSON.parse(seedDataContent);

    console.log(`📄 Seeding file found with ${seedData.length} tables`);

    // Procesar cada tabla en el orden especificado
    for (const tableData of seedData) {
      console.log(`🔄 Processing table: ${tableData.table} (${tableData.data.length} records)`);

      try {
        // Usar el método createMany de Prisma según la tabla (insertar todos los registros de una vez)
        switch (tableData.table) {
          case 'tipo_token':
            await prisma.tokenType.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'estado_videojuego':
            await prisma.videogameStatus.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'estados_confirmacion':
            await prisma.confirmationStatus.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'roles':
            await prisma.role.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'ediciones':
            await prisma.edition.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'enfoque_educativo':
            await prisma.educationalFocus.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'testimonio':
            // Limpiar espacios en blanco en nombres antes de insertar
            const cleanedTestimonials = tableData.data.map(t => ({
              ...t,
              name: t.name.trim(),
              role: t.role.trim()
            }));
            await prisma.testimonial.createMany({
              data: cleanedTestimonials,
              skipDuplicates: true
            });
            break;
          case 'permisos':
            await prisma.permission.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'servicio':
            await prisma.service.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'servicio_permiso':
            await prisma.servicePermission.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'rol_permiso':
            await prisma.rolePermission.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'configuracion_evento':
            await prisma.eventConfiguration.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'usuarios':
            await prisma.user.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'equipos':
            await prisma.team.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'integrante':
            await prisma.member.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'videojuegos':
            await prisma.videogame.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'materia':
            await prisma.subject.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'nrc':
            await prisma.nRC.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'criterios':
            await prisma.criterion.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'ponderado':
            await prisma.weighting.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'evaluacion':
            await prisma.evaluation.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'detalle_evaluacion':
            await prisma.evaluationDetail.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'juego_destacado':
            await prisma.highlightedGame.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;

          default:
            console.log(`⚠️  Table ${tableData.table} not recognized, skipping...`);
            continue;
        }

        console.log(`✅ ${tableData.data.length} records created/updated in ${tableData.table}`);
      } catch (error) {
        console.error(`❌ Error creating records in ${tableData.table}:`, error);
        if (error instanceof Error) {
          console.error(`Error message: ${error.message}`);
        }
        // Continuar con la siguiente tabla aunque una falle
      }
    }

    // Create admin user only if it doesn't exist
    const adminEmail = 'admin@uninorte.edu.co';
    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail }
    });

    if (!existingAdmin) {
      console.log('👤 Creating admin user...');
      const password = configService.get<string>('ADMIN_PASSWORD') || 'Admin1234';
      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.user.create({
        data: {
          id: randomUUID(),
          email: adminEmail,
          confirmationStatusId: 1,
          firstName: 'Admin',
          lastName: 'Romero',
          roleId: 1,
          isActive: true,
          createdAt: new Date(),
          authMethod: 'PASSWORD',
          password: hashedPassword
        }
      });
      console.log('✅ Admin user created successfully');
    } else {
      console.log('👤 Admin user already exists, skipping creation...');
    }

    // Crear o actualizar profesor, materia y NRC para colegios
    console.log('🏫 Setting up Colegios professor, subject and NRC...');

    const profesorEmail = 'profesorcolegios@uninorte.edu.co';
    const profesorId = 'a1b2c3d4-e5f6-4789-a012-345678901234';

    // Crear o buscar materia Colegios primero (necesaria para el NRC)
    let materiaColegios = await prisma.subject.findFirst({
      where: {
        abrevName: 'COL',
        isActive: true
      }
    });

    if (!materiaColegios) {
      console.log('📚 Creating subject "Colegios"...');
      materiaColegios = await prisma.subject.create({
        data: {
          name: 'Colegios',
          code: 'COL0000',
          abrevName: 'COL',
          semester: 0,
          isActive: true
        }
      });
      console.log('✅ Subject "Colegios" created successfully');
    } else {
      console.log('📚 Subject "Colegios" already exists, using existing...');
    }

    // Crear o buscar profesor
    let profesor = await prisma.user.findUnique({
      where: { email: profesorEmail }
    });

    if (!profesor) {
      console.log(`👨‍🏫 Creating professor ${profesorEmail}...`);
      const password = configService.get<string>('PROFESOR_COLEGIOS_PASSWORD') || 'Pass1234';
      const hashedPassword = await bcrypt.hash(password, 10);
      profesor = await prisma.user.create({
        data: {
          id: profesorId,
          email: profesorEmail,
          firstName: 'Profesor',
          lastName: 'Colegios',
          roleId: 3, // Rol Profesor
          confirmationStatusId: 1, // CONFIRMADO
          isActive: true,
          createdAt: new Date(),
          lastSignInAt: new Date(),
          authMethod: 'PASSWORD',
          password: hashedPassword
        }
      });
      console.log('✅ Professor created successfully');
    } else {
      console.log(`👨‍🏫 Professor ${profesorEmail} already exists, using existing...`);
    }

    // Crear o buscar NRC 9999 (asociado al profesor y la materia)
    const nrcExistente = await prisma.nRC.findFirst({
      where: {
        code: 9999,
        editionId: 3
      }
    });

    if (!nrcExistente) {
      console.log('🔢 Creating NRC 9999...');
      await prisma.nRC.create({
        data: {
          code: 9999,
          subjectId: materiaColegios.id, // Asociado a la materia
          professorId: profesor.id, // Asociado al profesor
          editionId: 3,
          isActive: true
        }
      });
      console.log('✅ NRC 9999 created successfully (associated with professor and subject)');
    } else {
      console.log('🔢 NRC 9999 already exists, skipping creation...');
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
