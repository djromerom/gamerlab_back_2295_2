const fs = require('fs');
const path = require('path');
const {
  PrismaClient,
  AuthMethod,
  JurorCategory,
} = require('@prisma/client');

let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch {
  bcrypt = require('bcryptjs');
}

const prisma = new PrismaClient();

const seedPath = path.join(__dirname, 'seed-data.json');
const rawSeed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

function tableData(tableName) {
  const entry = rawSeed.find((item) => item.table === tableName);
  return entry?.data ?? [];
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = keyFn(item);

    if (seen.has(key)) {
      console.warn(`⚠️ Duplicado ignorado en seed: ${key}`);
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

async function resetSequence(tableName, idColumn) {
  await prisma.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('"${tableName}"', '${idColumn}'),
      COALESCE((SELECT MAX("${idColumn}") FROM "${tableName}"), 1),
      true
    );
  `);
}

async function seedBaseData() {
  console.log('🌱 Cargando seed-data.json base...');

  const tokenTypes = uniqueBy(tableData('tipo_token'), (x) => x.id);
  const videogameStatuses = uniqueBy(tableData('estado_videojuego'), (x) => x.id);
  const confirmationStatuses = uniqueBy(
    tableData('estados_confirmacion'),
    (x) => x.id,
  );
  const roles = uniqueBy(tableData('roles'), (x) => x.id);
  const permissions = uniqueBy(tableData('permisos'), (x) => x.id);
  const services = uniqueBy(tableData('servicio'), (x) => x.id);
  const rolePermissions = uniqueBy(
    tableData('rol_permiso'),
    (x) => `${x.roleId}-${x.permissionId}`,
  );
  const servicePermissions = uniqueBy(
    tableData('servicio_permiso'),
    (x) => `${x.serviceId}-${x.permissionId}`,
  );

  await prisma.tokenType.createMany({
    data: tokenTypes,
    skipDuplicates: true,
  });

  await prisma.videogameStatus.createMany({
    data: videogameStatuses,
    skipDuplicates: true,
  });

  await prisma.confirmationStatus.createMany({
    data: confirmationStatuses,
    skipDuplicates: true,
  });

  await prisma.role.createMany({
    data: roles,
    skipDuplicates: true,
  });

  await prisma.permission.createMany({
    data: permissions,
    skipDuplicates: true,
  });

  await prisma.service.createMany({
    data: services,
    skipDuplicates: true,
  });

  await prisma.rolePermission.createMany({
    data: rolePermissions,
    skipDuplicates: true,
  });

  await prisma.servicePermission.createMany({
    data: servicePermissions,
    skipDuplicates: true,
  });

  await resetSequence('tipo_token', 'id');
  await resetSequence('estado_videojuego', 'id_estado');
  await resetSequence('estados_confirmacion', 'id_estado');
  await resetSequence('roles', 'id_rol');
  await resetSequence('permisos', 'id_permiso');
  await resetSequence('servicio', 'id_servicio');

  console.log('✅ Seed base cargado');
}

async function seedJurorTestData() {
  console.log('🌱 Agregando datos de prueba para jurados...');

  const passwordHash = await bcrypt.hash('Admin1234', 10);

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'Administrador' },
  });

  const jurorRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'Jurado' },
  });

  const professorRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'Profesor' },
  });

  const studentRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'Estudiante' },
  });

  const confirmedUserStatus = await prisma.confirmationStatus.findUniqueOrThrow({
    where: { status: 'CONFIRMADO' },
  });

  const confirmedVideogameStatus = await prisma.videogameStatus.findUniqueOrThrow({
    where: { status: 'CONFIRMADO' },
  });

  const edition = await prisma.edition.upsert({
    where: { id: 3 },
    update: {
      semester: '2026-10',
      isActive: true,
      title: 'Feria GamerLab Dev',
      year: 2026,
      semesterName: '2026-10',
      name: 'Edición Dev',
      date: '2026',
      description: 'Edición de pruebas para jurados',
    },
    create: {
      id: 3,
      semester: '2026-10',
      isActive: true,
      title: 'Feria GamerLab Dev',
      year: 2026,
      semesterName: '2026-10',
      name: 'Edición Dev',
      date: '2026',
      description: 'Edición de pruebas para jurados',
    },
  });

  await prisma.weighting.upsert({
    where: { editionId: edition.id },
    update: {
      seniorPct: 0.6,
      juniorPct: 0.4,
    },
    create: {
      editionId: edition.id,
      seniorPct: 0.6,
      juniorPct: 0.4,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@uninorte.edu.co' },
    update: {
      firstName: 'Admin',
      lastName: 'Uninorte',
      password: passwordHash,
      roleId: adminRole.id,
      confirmationStatusId: confirmedUserStatus.id,
      isActive: true,
      authMethod: AuthMethod.PASSWORD,
    },
    create: {
      email: 'admin@uninorte.edu.co',
      firstName: 'Admin',
      lastName: 'Uninorte',
      password: passwordHash,
      roleId: adminRole.id,
      confirmationStatusId: confirmedUserStatus.id,
      isActive: true,
      authMethod: AuthMethod.PASSWORD,
    },
  });

  const junior = await prisma.user.upsert({
    where: { email: 'jurado.junior@uninorte.edu.co' },
    update: {
      firstName: 'Jurado',
      lastName: 'Junior',
      password: passwordHash,
      roleId: jurorRole.id,
      jurorCategory: JurorCategory.JUNIOR,
      confirmationStatusId: confirmedUserStatus.id,
      isActive: true,
      authMethod: AuthMethod.PASSWORD,
    },
    create: {
      email: 'jurado.junior@uninorte.edu.co',
      firstName: 'Jurado',
      lastName: 'Junior',
      password: passwordHash,
      roleId: jurorRole.id,
      jurorCategory: JurorCategory.JUNIOR,
      confirmationStatusId: confirmedUserStatus.id,
      isActive: true,
      authMethod: AuthMethod.PASSWORD,
    },
  });

  const senior = await prisma.user.upsert({
    where: { email: 'jurado.senior@uninorte.edu.co' },
    update: {
      firstName: 'Jurado',
      lastName: 'Senior',
      password: passwordHash,
      roleId: jurorRole.id,
      jurorCategory: JurorCategory.SENIOR,
      confirmationStatusId: confirmedUserStatus.id,
      isActive: true,
      authMethod: AuthMethod.PASSWORD,
    },
    create: {
      email: 'jurado.senior@uninorte.edu.co',
      firstName: 'Jurado',
      lastName: 'Senior',
      password: passwordHash,
      roleId: jurorRole.id,
      jurorCategory: JurorCategory.SENIOR,
      confirmationStatusId: confirmedUserStatus.id,
      isActive: true,
      authMethod: AuthMethod.PASSWORD,
    },
  });

  const professor = await prisma.user.upsert({
    where: { email: 'profesor.colegios@uninorte.edu.co' },
    update: {
      firstName: 'Profesor',
      lastName: 'Colegios',
      password: passwordHash,
      roleId: professorRole.id,
      jurorCategory: JurorCategory.SENIOR,
      confirmationStatusId: confirmedUserStatus.id,
      isActive: true,
      authMethod: AuthMethod.PASSWORD,
    },
    create: {
      email: 'profesor.colegios@uninorte.edu.co',
      firstName: 'Profesor',
      lastName: 'Colegios',
      password: passwordHash,
      roleId: professorRole.id,
      jurorCategory: JurorCategory.SENIOR,
      confirmationStatusId: confirmedUserStatus.id,
      isActive: true,
      authMethod: AuthMethod.PASSWORD,
    },
  });

  const ownerColegio = await prisma.user.upsert({
    where: { email: 'equipo.colegio@uninorte.edu.co' },
    update: {
      firstName: 'Equipo',
      lastName: 'Colegio',
      password: passwordHash,
      roleId: studentRole.id,
      confirmationStatusId: confirmedUserStatus.id,
      isActive: true,
      authMethod: AuthMethod.PASSWORD,
    },
    create: {
      email: 'equipo.colegio@uninorte.edu.co',
      firstName: 'Equipo',
      lastName: 'Colegio',
      password: passwordHash,
      roleId: studentRole.id,
      confirmationStatusId: confirmedUserStatus.id,
      isActive: true,
      authMethod: AuthMethod.PASSWORD,
    },
  });

  const ownerN1 = await prisma.user.upsert({
    where: { email: 'equipo.n1@uninorte.edu.co' },
    update: {
      firstName: 'Equipo',
      lastName: 'N1',
      password: passwordHash,
      roleId: studentRole.id,
      confirmationStatusId: confirmedUserStatus.id,
      isActive: true,
      authMethod: AuthMethod.PASSWORD,
    },
    create: {
      email: 'equipo.n1@uninorte.edu.co',
      firstName: 'Equipo',
      lastName: 'N1',
      password: passwordHash,
      roleId: studentRole.id,
      confirmationStatusId: confirmedUserStatus.id,
      isActive: true,
      authMethod: AuthMethod.PASSWORD,
    },
  });

  const ownerN2 = await prisma.user.upsert({
    where: { email: 'equipo.n2@uninorte.edu.co' },
    update: {
      firstName: 'Equipo',
      lastName: 'N2',
      password: passwordHash,
      roleId: studentRole.id,
      confirmationStatusId: confirmedUserStatus.id,
      isActive: true,
      authMethod: AuthMethod.PASSWORD,
    },
    create: {
      email: 'equipo.n2@uninorte.edu.co',
      firstName: 'Equipo',
      lastName: 'N2',
      password: passwordHash,
      roleId: studentRole.id,
      confirmationStatusId: confirmedUserStatus.id,
      isActive: true,
      authMethod: AuthMethod.PASSWORD,
    },
  });

  const colegioTeam = await prisma.team.upsert({
    where: {
      teamCode_editionId: {
        teamCode: 'N0-COL-01',
        editionId: edition.id,
      },
    },
    update: {
      teamName: 'Equipo Colegio Dev',
      userId: ownerColegio.id,
      isActive: true,
      isExternal: true,
    },
    create: {
      teamName: 'Equipo Colegio Dev',
      teamCode: 'N0-COL-01',
      userId: ownerColegio.id,
      editionId: edition.id,
      isActive: true,
      isExternal: true,
    },
  });

  const n1Team = await prisma.team.upsert({
    where: {
      teamCode_editionId: {
        teamCode: 'N1-AYP-01',
        editionId: edition.id,
      },
    },
    update: {
      teamName: 'Equipo AYP Dev',
      userId: ownerN1.id,
      isActive: true,
      isExternal: false,
    },
    create: {
      teamName: 'Equipo AYP Dev',
      teamCode: 'N1-AYP-01',
      userId: ownerN1.id,
      editionId: edition.id,
      isActive: true,
      isExternal: false,
    },
  });

  const n2Team = await prisma.team.upsert({
    where: {
      teamCode_editionId: {
        teamCode: 'N2-AYP2-01',
        editionId: edition.id,
      },
    },
    update: {
      teamName: 'Equipo AYP2 Dev',
      userId: ownerN2.id,
      isActive: true,
      isExternal: false,
    },
    create: {
      teamName: 'Equipo AYP2 Dev',
      teamCode: 'N2-AYP2-01',
      userId: ownerN2.id,
      editionId: edition.id,
      isActive: true,
      isExternal: false,
    },
  });

  await prisma.videogame.upsert({
    where: { teamId: colegioTeam.id },
    update: {
      name: 'Juego Colegio',
      description: 'Videojuego colegio dev',
      videogameStatusId: confirmedVideogameStatus.id,
      isActive: true,
    },
    create: {
      name: 'Juego Colegio',
      description: 'Videojuego colegio dev',
      teamId: colegioTeam.id,
      videogameStatusId: confirmedVideogameStatus.id,
      isActive: true,
    },
  });

  await prisma.videogame.upsert({
    where: { teamId: n1Team.id },
    update: {
      name: 'Juego AYP',
      description: 'Videojuego AYP dev',
      videogameStatusId: confirmedVideogameStatus.id,
      isActive: true,
    },
    create: {
      name: 'Juego AYP',
      description: 'Videojuego AYP dev',
      teamId: n1Team.id,
      videogameStatusId: confirmedVideogameStatus.id,
      isActive: true,
    },
  });

  await prisma.videogame.upsert({
    where: { teamId: n2Team.id },
    update: {
      name: 'Juego AYP2',
      description: 'Videojuego AYP2 dev',
      teamId: n2Team.id,
      videogameStatusId: confirmedVideogameStatus.id,
      isActive: true,
    },
    create: {
      name: 'Juego AYP2',
      description: 'Videojuego AYP2 dev',
      teamId: n2Team.id,
      videogameStatusId: confirmedVideogameStatus.id,
      isActive: true,
    },
  });

  console.log('✅ Datos de prueba de jurados creados');
  console.table([
    {
      tipo: 'ADMIN',
      email: admin.email,
      password: 'Admin1234',
      id: admin.id,
    },
    {
      tipo: 'JUNIOR',
      email: junior.email,
      id: junior.id,
    },
    {
      tipo: 'SENIOR',
      email: senior.email,
      id: senior.id,
    },
    {
      tipo: 'PROFESOR',
      email: professor.email,
      id: professor.id,
    },
    {
      tipo: 'TEAM_COLEGIO',
      teamId: colegioTeam.id,
      teamCode: colegioTeam.teamCode,
    },
    {
      tipo: 'TEAM_N1',
      teamId: n1Team.id,
      teamCode: n1Team.teamCode,
    },
    {
      tipo: 'TEAM_N2',
      teamId: n2Team.id,
      teamCode: n2Team.teamCode,
    },
  ]);
}

async function main() {
  await seedBaseData();
  await seedJurorTestData();

  console.log('🌱 Sincronizando secuencias de IDs');
  await resetSequence('ediciones', 'id_edicion');
  await resetSequence('configuracion_evento', 'id');
  await resetSequence('enfoque_educativo', 'id_enfoque');
  await resetSequence('testimonio', 'id_testimonio');
  await resetSequence('juego_destacado', 'id_juego_destacado');
  await resetSequence('ponderado', 'id');
  await resetSequence('equipos', 'id_equipo');
  await resetSequence('integrante', 'id_integrante');
  await resetSequence('videojuegos', 'id_videojuego');
  await resetSequence('videogame_likes', 'id');
  await resetSequence('evaluacion', 'id_evaluacion');
  await resetSequence('materia', 'id_materia');
  await resetSequence('nrc', 'id_nrc');
  await resetSequence('criterios', 'id_criterio');
  await resetSequence('detalle_evaluacion', 'id_detalle');
  console.log('✅ Secuencias sincronizadas');
}

main()
  .catch((error) => {
    console.error('❌ Seed error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });