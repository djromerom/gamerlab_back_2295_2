import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Creando datos de prueba para la asignación de jurados...');

    // 1. Obtener o crear una edición activa
    let edition = await prisma.edition.findFirst({
        where: { isActive: true },
        orderBy: { id: 'desc' },
    });

    if (!edition) {
        edition = await prisma.edition.create({
            data: {
                semester: '2026-1',
                isActive: true,
                year: 2026,
                name: 'Edición de Prueba',
            },
        });
    }

    // 2. Asegurar que el estado "CONFIRMADO" exista
    let confirmedStatus = await prisma.videogameStatus.findUnique({
        where: { status: 'CONFIRMADO' }
    });
    if (!confirmedStatus) {
        confirmedStatus = await prisma.videogameStatus.create({ data: { status: 'CONFIRMADO' } });
    }

    // 3. Crear los 6 jurados de colegios
    const COLEGIO_EMAILS = [
        'edangulo@uninorte.edu.co',
        'rramos@uninorte.edu.co',
        'mrgamarra@uninorte.edu.co',
        'katherineospino@uninorte.edu.co',
        'pineresm@uninorte.edu.co',
        'djromero@uninorte.edu.co',
    ];

    const jurorRole = await prisma.role.findFirst({ where: { name: 'Jurado' } });
    if (!jurorRole) throw new Error('No existe el rol Jurado. Corre el seed original primero.');

    for (const email of COLEGIO_EMAILS) {
        await prisma.user.upsert({
            where: { email },
            update: { roleId: jurorRole.id, isActive: true },
            create: {
                id: randomUUID(),
                email,
                firstName: 'Jurado',
                lastName: 'Colegio',
                roleId: jurorRole.id,
                isActive: true,
                jurorCategory: 'SENIOR',
            },
        });
    }

    // 4. Crear 14 jurados normales (20 en total)
    for (let i = 1; i <= 14; i++) {
        const email = `jurado.normal${i}@uninorte.edu.co`;
        await prisma.user.upsert({
            where: { email },
            update: { roleId: jurorRole.id, isActive: true },
            create: {
                id: randomUUID(),
                email,
                firstName: 'Jurado',
                lastName: `Normal ${i}`,
                roleId: jurorRole.id,
                isActive: true,
                jurorCategory: 'JUNIOR',
            },
        });
    }

    // 5. Función helper para crear equipos y sus videojuegos confirmados
    const createTeams = async (levelCode: string, count: number) => {
        for (let i = 1; i <= count; i++) {
            const teamCode = `${levelCode}-PRB-${i.toString().padStart(2, '0')}`;

            // Crear usuario dueño del equipo (rol 2 asumido como Estudiante)
            const ownerEmail = `owner.${teamCode}@uninorte.edu.co`;
            const owner = await prisma.user.upsert({
                where: { email: ownerEmail },
                update: { isActive: true },
                create: {
                    id: randomUUID(),
                    email: ownerEmail,
                    firstName: 'Estudiante',
                    lastName: teamCode,
                    roleId: 2,
                    isActive: true,
                }
            });

            const team = await prisma.team.upsert({
                where: { teamName: `Equipo ${teamCode}` },
                update: { isActive: true, editionId: edition.id },
                create: {
                    teamName: `Equipo ${teamCode}`,
                    teamCode: teamCode,
                    editionId: edition.id,
                    userId: owner.id,
                    isActive: true,
                },
            });

            await prisma.videogame.upsert({
                where: { teamId: team.id },
                update: { videogameStatusId: confirmedStatus!.id },
                create: {
                    name: `Juego de ${teamCode}`,
                    teamId: team.id,
                    videogameStatusId: confirmedStatus!.id,
                    isActive: true,
                },
            });
        }
    };

    // 6. Crear 10 equipos de N0, 10 de N1 y 10 de N2
    console.log('🎮 Creando equipos y videojuegos...');
    await createTeams('N0', 10);
    await createTeams('N1', 10);
    await createTeams('N2', 10);

    console.log('✅ Datos de prueba creados exitosamente. Ahora puedes probar la asignación automática.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
