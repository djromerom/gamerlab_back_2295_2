import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function resetSequence(tableName: string, idColumn: string) {
  try {
    await prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('"${tableName}"', '${idColumn}'),
        COALESCE((SELECT MAX("${idColumn}") FROM "${tableName}"), 1),
        true
      );
    `);
  } catch (error) {
    console.error(`⚠️ Could not reset sequence for ${tableName}.${idColumn}`);
  }
}

interface SeedData {
  table: string;
  data: any[];
}

/**
 * BG-01: aplica los servicios/permisos de las rutas administrativas ejecutando la
 * MISMA migración que se corre en Arkad-test y producción
 * (`prisma/migrations/*_add_admin_route_permissions`). Así hay una sola definición.
 *
 * Es necesario porque en una base nueva la migración corre antes del seed, cuando
 * la tabla `roles` aún está vacía y la migración no hace nada. Es idempotente.
 */
async function applyAdminRoutePermissions() {
  const migrationsDir = join(process.cwd(), 'prisma', 'migrations');
  const migrationName = readdirSync(migrationsDir)
    .filter((dir) => dir.endsWith('_add_admin_route_permissions'))
    .sort()[0];

  if (!migrationName) {
    console.log('⚠️ Migration *_add_admin_route_permissions not found. Skipping...');
    return;
  }

  const sql = readFileSync(
    join(migrationsDir, migrationName, 'migration.sql'),
    'utf-8',
  );
  await prisma.$executeRawUnsafe(sql);
  console.log(`🔐 Admin route permissions applied from ${migrationName}`);
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.log(
      '⚠️  Seeding should only be run in non-production environment. Aborting...',
    );
    return;
  }

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
      console.log(
        `🔄 Processing table: ${tableData.table} (${tableData.data.length} records)`,
      );

      try {
        // Usar el método createMany de Prisma según la tabla (insertar todos los registros de una vez)
        switch (tableData.table) {
          case 'tipo_token':
            await prisma.tokenType.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'estado_videojuego':
            await prisma.videogameStatus.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'estados_confirmacion':
            await prisma.confirmationStatus.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'roles':
            await prisma.role.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'ediciones':
            await prisma.edition.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'enfoque_educativo':
            await prisma.educationalFocus.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'testimonio':
            // Limpiar espacios en blanco en nombres antes de insertar
            const cleanedTestimonials = tableData.data.map((t) => ({
              ...t,
              name: t.name.trim(),
              role: t.role.trim(),
            }));
            await prisma.testimonial.createMany({
              data: cleanedTestimonials,
              skipDuplicates: true,
            });
            break;
          case 'permisos':
            await prisma.permission.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'servicio':
            await prisma.service.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'servicio_permiso':
            await prisma.servicePermission.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'rol_permiso':
            await prisma.rolePermission.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'configuracion_evento':
            await prisma.eventConfiguration.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'usuarios':
            await prisma.user.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'equipos':
            await prisma.team.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'integrante':
            await prisma.member.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'videojuegos':
            await prisma.videogame.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'materia':
            await prisma.subject.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'nrc':
            await prisma.nRC.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'criterios':
            await prisma.criterion.createMany({
              data: tableData.data,
              skipDuplicates: true,
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
              skipDuplicates: true,
            });
            break;
          case 'detalle_evaluacion':
            await prisma.evaluationDetail.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'juego_destacado':
            await prisma.highlightedGame.createMany({
              data: tableData.data,
              skipDuplicates: true,
            });
            break;
          case 'equipos_historico':
            await prisma.historicalTeam.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'integrante_historico':
            await prisma.historicalMember.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;
          case 'videojuegos_historico':
            await prisma.historicalVideogame.createMany({
              data: tableData.data,
              skipDuplicates: true
            });
            break;

          default:
            console.log(
              `⚠️  Table ${tableData.table} not recognized, skipping...`,
            );
            continue;
        }

        console.log(
          `✅ ${tableData.data.length} records created/updated in ${tableData.table}`,
        );
      } catch (error) {
        console.error(
          `❌ Error creating records in ${tableData.table}:`,
          error,
        );
        if (error instanceof Error) {
          console.error(`Error message: ${error.message}`);
        }
        // Continuar con la siguiente tabla aunque una falle
      }
    }

    // Create admin user only if it doesn't exist
    const adminEmail = 'admin@uninorte.edu.co';
    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (!existingAdmin) {
      console.log('👤 Creating admin user...');
      const password =
        configService.get<string>('ADMIN_PASSWORD') || 'Admin1234';
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
          password: hashedPassword,
        },
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
        isActive: true,
      },
    });

    if (!materiaColegios) {
      console.log('📚 Creating subject "Colegios"...');
      materiaColegios = await prisma.subject.create({
        data: {
          name: 'Colegios',
          code: 'COL0000',
          abrevName: 'COL',
          semester: 0,
          isActive: true,
        },
      });
      console.log('✅ Subject "Colegios" created successfully');
    } else {
      console.log('📚 Subject "Colegios" already exists, using existing...');
    }

    // Crear o buscar profesor
    let profesor = await prisma.user.findUnique({
      where: { email: profesorEmail },
    });

    const password =
      configService.get<string>('PROFESOR_COLEGIOS_PASSWORD') || 'Pass1234';
    const hashedPassword = await bcrypt.hash(password, 10);

    if (!profesor) {
      console.log(`👨‍🏫 Creating professor ${profesorEmail}...`);
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
          password: hashedPassword,
        },
      });
      console.log('✅ Professor created successfully');
    } else {
      console.log(
        `👨‍🏫 Professor ${profesorEmail} already exists, setting password...`,
      );
      // El usuario existe pero fue creado desde seed-data.json sin contraseña
      // Actualizamos su contraseña y authMethod para que pueda hacer login
      profesor = await prisma.user.update({
        where: { email: profesorEmail },
        data: {
          password: hashedPassword,
          authMethod: 'PASSWORD',
          roleId: 3, // Asegurar que sea Profesor
        },
      });
      console.log('✅ Professor password updated successfully');
    }

    // ARK-139: todo profesor es jurado Senior y, si no tiene tipo, Oficial
    // (los de seed-data.json llegan sin categoría). Solo llena valores vacíos.
    await prisma.user.updateMany({
      where: { roleId: 3, jurorCategory: null },
      data: { jurorCategory: 'SENIOR' },
    });
    await prisma.user.updateMany({
      where: { roleId: 3, jurorType: null },
      data: { jurorType: 'OFFICIAL' },
    });

    // Crear o buscar NRC 9999 (asociado al profesor y la materia)
    const nrcExistente = await prisma.nRC.findFirst({
      where: {
        code: 9999,
        editionId: 3,
      },
    });

    if (!nrcExistente) {
      console.log('🔢 Creating NRC 9999...');
      await prisma.nRC.create({
        data: {
          code: 9999,
          subjectId: materiaColegios.id, // Asociado a la materia
          professorId: profesor.id, // Asociado al profesor
          editionId: 3,
          isActive: true,
        },
      });
      console.log(
        '✅ NRC 9999 created successfully (associated with professor and subject)',
      );
    } else {
      console.log('🔢 NRC 9999 already exists, skipping creation...');
    }

    // Asignar profesor-colegios al equipo 500 (Equipo Epsilon Mock, colegio)
    console.log(
      '🔗 Assigning professor to team 500 (Equipo Epsilon Mock - school team)...',
    );

    // Buscar el profesor actualizado (pudo ser creado por JSON o por el seed)
    const profesorFinal = await prisma.user.findUnique({
      where: { email: profesorEmail },
    });

    const equipoEpsilon = await prisma.team.findUnique({
      where: { id: 500 },
    });

    if (profesorFinal && equipoEpsilon) {
      // Verificar si ya existe la asignación en la tabla implícita _JurorTeamAssignment
      // Usamos métodos nativos de Prisma para relaciones many-to-many (type-safe)
      const alreadyAssigned = await prisma.user.findFirst({
        where: {
          id: profesorFinal.id,
          teamsToEvaluate: { some: { id: equipoEpsilon.id } },
        },
      });

      if (!alreadyAssigned) {
        await prisma.user.update({
          where: { id: profesorFinal.id },
          data: {
            teamsToEvaluate: { connect: { id: equipoEpsilon.id } },
          },
        });
        console.log(
          `✅ Professor assigned to team ${equipoEpsilon.teamName} (ID: ${equipoEpsilon.id})`,
        );
      } else {
        console.log('ℹ️ Professor already assigned to team 500, skipping...');
      }
    } else {
      console.warn('⚠️ Could not find professor or team 500 for assignment');
    }

    await applyAdminRoutePermissions();

    console.log('🌱 Synchronizing database sequences...');
    await resetSequence('ediciones', 'id_edicion');
    await resetSequence('configuracion_evento', 'id');
    await resetSequence('enfoque_educativo', 'id_enfoque');
    await resetSequence('testimonio', 'id_testimonio');
    await resetSequence('juego_destacado', 'id_juego_destacado');
    await resetSequence('ponderado', 'id');
    await resetSequence('equipos', 'id_equipo');
    await resetSequence('equipos_historico', 'id_equipo_historico');
    await resetSequence('integrante_historico', 'id_integrante_historico');
    await resetSequence('videojuegos_historico', 'id_videojuego_historico');
    await resetSequence('integrante', 'id_integrante');
    await resetSequence('videojuegos', 'id_videojuego');
    await resetSequence('videogame_likes', 'id');
    await resetSequence('evaluacion', 'id_evaluacion');
    await resetSequence('materia', 'id_materia');
    await resetSequence('nrc', 'id_nrc');
    await resetSequence('criterios', 'id_criterio');
    await resetSequence('detalle_evaluacion', 'id_detalle');
    await resetSequence('tipo_token', 'id');
    await resetSequence('estado_videojuego', 'id_estado');
    await resetSequence('estados_confirmacion', 'id_estado');
    await resetSequence('roles', 'id_rol');
    await resetSequence('permisos', 'id_permiso');
    await resetSequence('servicio', 'id_servicio');
    console.log('✅ All sequences synchronized');

    console.log('🎉 Seeding process completed successfully');
  } catch (error) {
    console.error('💥 Error during seeding process:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar el seeding
main().catch((e) => {
  console.error('Fatal error in seeding:', e);
  process.exit(1);
});
