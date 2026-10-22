import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
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

    // Semillas para el panel docente: cada grupo se asocia a un NRC concreto
    // y a la misma edición que ese NRC. El NRC 2501 se repite entre ediciones
    // para cubrir explícitamente ese caso en el frontend y en el reporte.
    const gradingDemos = [
      {
        year: 2025,
        editionId: 3,
        nrcCode: 9999,
        projects: [
          ['01', 'Demo Colegios - Exploradores', 'Lucia', 'Martinez', 'Ecoaventura', 'Juego educativo para aprender sobre el cuidado del ambiente.'],
          ['02', 'Demo Colegios - Inventores', 'Mateo', 'Gomez', 'Laboratorio Loco', 'Retos interactivos para explorar conceptos de ciencias.'],
          ['03', 'Demo Colegios - Aventureros', 'Valentina', 'Rojas', 'Aventura Matematica', 'Minijuegos para practicar operaciones y lógica matemática.'],
        ],
      },
      {
        year: 2024,
        editionId: 2,
        nrcCode: 2401,
        projects: [
          ['01', 'Demo 2024 NRC 2401 - Guardianes del Agua', 'Camila', 'Pardo', 'Guardianes del Agua', 'Aventura educativa sobre el uso responsable del agua.'],
          ['02', 'Demo 2024 NRC 2401 - Ruta Espacial', 'Samuel', 'Vega', 'Ruta Espacial', 'Juego de exploración con retos de lógica y ciencias.'],
        ],
      },
      {
        year: 2025,
        editionId: 1,
        nrcCode: 2501,
        projects: [
          ['01', 'Demo 2025 NRC 2501 - Mision Naturaleza', 'Isabella', 'Mora', 'Mision Naturaleza', 'Retos para conocer ecosistemas y biodiversidad.'],
          ['02', 'Demo 2025 NRC 2501 - Codigo Secreto', 'Nicolas', 'Gil', 'Codigo Secreto', 'Desafíos introductorios de pensamiento computacional.'],
        ],
      },
      {
        year: 2025,
        editionId: 3,
        nrcCode: 2502,
        projects: [
          ['01', 'Demo 2025 NRC 2502 - Isla de los Retos', 'Mariana', 'Leon', 'Isla de los Retos', 'Minijuegos educativos de matemáticas y ciencias.'],
          ['02', 'Demo 2025 NRC 2502 - Ciudad Sostenible', 'Daniel', 'Ruiz', 'Ciudad Sostenible', 'Simulación de decisiones para construir una ciudad sostenible.'],
        ],
      },
      {
        year: 2025,
        editionId: 3,
        nrcCode: 2501,
        projects: [
          ['03', 'Demo 2025 S2 NRC 2501 - Bosque Digital', 'Juliana', 'Castro', 'Bosque Digital', 'Juego de exploración y aprendizaje sobre los bosques.'],
          ['04', 'Demo 2025 S2 NRC 2501 - Desafio Orbital', 'Andres', 'Mejia', 'Desafio Orbital', 'Retos educativos ambientados en una misión espacial.'],
        ],
      },
    ] as const;

    for (const demo of gradingDemos) {
      const edition = await prisma.edition.findUnique({
        where: { id: demo.editionId },
      });
      if (!edition) {
        console.log(`⚠️ Edition ${demo.editionId} not found; skipping NRC ${demo.nrcCode}.`);
        continue;
      }

      let demoNrc = await prisma.nRC.findFirst({
        where: {
          code: demo.nrcCode,
          editionId: demo.editionId,
          professorId: profesor.id,
        },
      });
      if (!demoNrc) {
        demoNrc = await prisma.nRC.create({
          data: {
            code: demo.nrcCode,
            subjectId: materiaColegios.id,
            professorId: profesor.id,
            editionId: demo.editionId,
            isActive: true,
          },
        });
      }

      for (const [
        suffix,
        teamName,
        firstName,
        lastName,
        gameName,
        description,
      ] of demo.projects) {
        const email =
          demo.nrcCode === 9999
            ? `demo.colegios.${suffix}@example.com`
            : `demo.${demo.year}.${demo.nrcCode}.${suffix}@example.com`;
        const studentCode =
          demo.nrcCode === 9999
            ? `DEMO-COL-0${suffix}`
            : `D${demo.year}${demo.nrcCode}${suffix}`;
        const teamCode =
          demo.nrcCode === 9999
            ? `DEMO-COL-${suffix}`
            : `D${String(demo.year).slice(-2)}N${demo.nrcCode}-${suffix}`;
        const student = await prisma.user.upsert({
          where: { email },
          update: {},
          create: {
            email,
            firstName,
            lastName,
            roleId: 2,
            confirmationStatusId: 1,
            isActive: true,
          },
        });

        const team = await prisma.team.upsert({
          where: { teamName },
          update: {},
          create: {
            teamName,
            teamCode,
            userId: student.id,
            editionId: demo.editionId,
            isActive: true,
            isExternal: false,
          },
        });

        const member = await prisma.member.upsert({
          where: { email },
          update: {},
          create: {
            firstName,
            lastName,
            email,
            studentCode,
            teamId: team.id,
            isActive: true,
            nrcs: { connect: { id: demoNrc.id } },
          },
        });
        await prisma.member.update({
          where: { id: member.id },
          data: { nrcs: { connect: { id: demoNrc.id } } },
        });

        await prisma.videogame.upsert({
          where: { teamId: team.id },
          update: {},
          create: {
            name: gameName,
            description,
            teamId: team.id,
            videogameStatusId: 1,
            isActive: true,
          },
        });
      }

      console.log(
        `✅ Demo projects ready for ${demo.year}, edition ${demo.editionId}, NRC ${demo.nrcCode}`,
      );
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
