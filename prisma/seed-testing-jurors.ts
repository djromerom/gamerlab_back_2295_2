import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

export async function seedJurorTestData(prisma: PrismaClient) {
  console.log('🧪 Injecting testing data for Automated Juror Assignment...');

  // Roles: 2=Estudiante, 3=Profesor, 4=Jurado

  // 1. Create Jurors (Role 4)
  const jurors = [];
  for (let i = 1; i <= 10; i++) {
    const email = `test_jurado${i}@uninorte.edu.co`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        id: randomUUID(),
        email,
        firstName: `Jurado Test`,
        lastName: `Num ${i}`,
        roleId: 4,
        confirmationStatusId: 1, // CONFIRMADO
        isActive: true,
      },
    });
    jurors.push(user);
  }
  console.log(`✅ ${jurors.length} test jurors ensured.`);

  // 2. Create Professors (Role 3)
  const professors = [];
  for (let i = 1; i <= 5; i++) {
    const email = `test_profesor${i}@uninorte.edu.co`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        id: randomUUID(),
        email,
        firstName: `Profesor Test`,
        lastName: `Num ${i}`,
        roleId: 3,
        confirmationStatusId: 1, // CONFIRMADO
        isActive: true,
      },
    });
    professors.push(user);
  }
  console.log(`✅ ${professors.length} test professors ensured.`);

  // 3. Create Teams and Videogames
  const levels = ['N0', 'N1', 'N2', 'N3', 'N4'];
  let teamCount = 0;
  for (const level of levels) {
    // Creating 6 teams per level
    for (let i = 1; i <= 6; i++) {
      const studentEmail = `owner_${level}_${i}@test.com`;
      // Ensure student exists
      const student = await prisma.user.upsert({
        where: { email: studentEmail },
        update: {},
        create: {
          id: randomUUID(),
          email: studentEmail,
          firstName: `Estudiante`,
          lastName: `${level}-${i}`,
          roleId: 2, // Estudiante
          confirmationStatusId: 1,
          isActive: true,
        },
      });

      const teamName = `Team ${level} - Project ${i}`;
      const teamCode = `${level}-TEST-0${i}`;
      
      const team = await prisma.team.upsert({
        where: { teamName },
        update: { teamCode },
        create: {
          teamName: teamName,
          teamCode: teamCode,
          userId: student.id,
          editionId: 3,
          isActive: true,
          isExternal: false,
        },
      });
      
      const gameName = `Game ${level} - ${i}`;
      await prisma.videogame.upsert({
        where: { teamId: team.id },
        update: { videogameStatusId: 1 },
        create: {
          name: gameName,
          description: 'A test videogame for juror assignment.',
          videogameStatusId: 1, // CONFIRMADO
          teamId: team.id,
          isActive: true,
        }
      });
      
      teamCount++;
    }
  }
  console.log(`✅ ${teamCount} test teams with confirmed Videogames across levels N0-N4 ensured.`);
  console.log('🎉 Testing data injection completed successfully!');
}
