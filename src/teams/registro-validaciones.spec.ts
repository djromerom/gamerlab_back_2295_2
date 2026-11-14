import {
  ValidationPipe,
  ConflictException,
  BadRequestException,
  ArgumentMetadata,
} from '@nestjs/common';
import { CreateTeamDto } from './dto/create-team.dto';
import { ValidateEmailsDto } from './dto/validate-emails.dto';
import { ValidateStudentCodesDto } from './dto/validate-student-codes.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { TeamRepository } from './repositories/team.repository';
import { TeamsService } from './services/teams.service';

/**
 * Chore registro de equipos (beta-test del 1 de noviembre): el registro sin logo
 * funciona, los datos se normalizan y los errores llegan antes, en español.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const validate = <T>(metatype: new () => T, value: unknown): Promise<T> =>
  pipe.transform(value, { type: 'body', metatype } as ArgumentMetadata);
const messagesOf = async (
  metatype: new () => unknown,
  value: unknown,
): Promise<string[]> => {
  try {
    await validate(metatype, value);
    return [];
  } catch (error: any) {
    return [].concat(error.getResponse().message);
  }
};

const validTeam = (overrides: any = {}) => ({
  teamName: 'Equipo QA',
  members: [
    {
      memberFirstName: 'Ana',
      memberLastName: 'Pérez',
      memberEmail: 'ana@uninorte.edu.co',
      studentCode: '200190601',
      nrc: ['3501'],
    },
  ],
  videogame: {
    vgName: 'Juego QA',
    description: 'Un juego',
    ...(overrides.videogame ?? {}),
  },
  recaptchaToken: 'token',
  ...overrides.root,
});

describe('Registro de equipos — DTO', () => {
  it('acepta logoUrl vacío y lo trata como sin logo', async () => {
    const dto = await validate(
      CreateTeamDto,
      validTeam({ videogame: { logoUrl: '' } }),
    );
    expect(dto.videogame.logoUrl).toBeUndefined();
  });

  it('acepta logoUrl de solo espacios como sin logo', async () => {
    const dto = await validate(
      CreateTeamDto,
      validTeam({ videogame: { logoUrl: '   ' } }),
    );
    expect(dto.videogame.logoUrl).toBeUndefined();
  });

  it('sigue rechazando un logoUrl que no es URL', async () => {
    const messages = await messagesOf(
      CreateTeamDto,
      validTeam({ videogame: { logoUrl: 'no es url' } }),
    );
    expect(messages).toContain(
      'videogame.La URL del logo del juego debe ser válida',
    );
  });
});

describe('Registro de equipos — DTO', () => {
  it('recorta nombres de equipo, juego e integrantes, y normaliza el correo', async () => {
    const team = validTeam({
      root: { teamName: '  Equipo QA  ' },
      videogame: { vgName: '  Juego QA ' },
    });
    team.members[0].memberFirstName = '  Ana ';
    team.members[0].memberEmail = '  Ana@Uninorte.edu.co ';
    team.members[0].studentCode = ' 200190601 ';
    const dto = await validate(CreateTeamDto, team);
    expect(dto.teamName).toBe('Equipo QA');
    expect(dto.videogame.vgName).toBe('Juego QA');
    expect(dto.members[0].memberFirstName).toBe('Ana');
    expect(dto.members[0].memberEmail).toBe('ana@uninorte.edu.co');
    expect(dto.members[0].studentCode).toBe('200190601');
  });

  it('rechaza nombres de solo espacios', async () => {
    const team = validTeam();
    team.members[0].memberFirstName = '   ';
    const messages = await messagesOf(CreateTeamDto, team);
    expect(messages).toContain(
      'members.0.El nombre del integrante es obligatorio',
    );
  });

  it('rechaza un código estudiantil con letras', async () => {
    const team = validTeam();
    team.members[0].studentCode = 'abc!';
    const messages = await messagesOf(CreateTeamDto, team);
    expect(messages).toContain(
      'members.0.El código de estudiante solo puede tener números',
    );
  });

  it('rechaza nombres de integrante de más de 50 caracteres', async () => {
    const team = validTeam();
    team.members[0].memberLastName = 'x'.repeat(51);
    const messages = await messagesOf(CreateTeamDto, team);
    expect(messages).toContain(
      'members.0.El apellido del integrante debe ser de máximo 50 caracteres',
    );
  });

  it('rechaza un equipo sin integrantes', async () => {
    const messages = await messagesOf(
      CreateTeamDto,
      validTeam({ root: { members: [] } }),
    );
    expect(messages).toContain('El equipo debe tener al menos un integrante');
  });

  it('editar un integrante viejo con código no numérico sigue funcionando', async () => {
    const dto = await validate(UpdateMemberDto, { studentCode: 'T00123' });
    expect(dto.studentCode).toBe('T00123');
  });

  it('validate-emails recorta los correos y conserva mayúsculas para las claves', async () => {
    const dto = await validate(ValidateEmailsDto, {
      emails: [' Santiagodd@uninorte.edu.co '],
    });
    expect(dto.emails).toEqual(['Santiagodd@uninorte.edu.co']);
  });

  it('validate-student-codes recorta los códigos', async () => {
    const dto = await validate(ValidateStudentCodesDto, {
      studentCodes: [' 123 '],
    });
    expect(dto.studentCodes).toEqual(['123']);
  });
});

describe('TeamRepository.checkEmailsExist', () => {
  it('encuentra un correo registrado aunque llegue con mayúsculas y responde con la clave original', async () => {
    const prisma = {
      user: {
        findMany: jest
          .fn()
          // Cuenta de profesor: sí ocupa el correo (ARK-128)
          .mockResolvedValue([
            { email: 'santiagodd@uninorte.edu.co', roleId: 3, isActive: true },
          ]),
      },
      member: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const repository = new TeamRepository(prisma as any, {} as any);

    const result = await repository.checkEmailsExist([
      'Santiagodd@uninorte.edu.co',
      'nuevo@uninorte.edu.co',
    ]);

    expect(result).toEqual({
      'Santiagodd@uninorte.edu.co': true,
      'nuevo@uninorte.edu.co': false,
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            email: {
              equals: 'santiagodd@uninorte.edu.co',
              mode: 'insensitive',
            },
          },
          { email: { equals: 'nuevo@uninorte.edu.co', mode: 'insensitive' } },
        ],
      },
      select: { email: true, roleId: true, isActive: true },
    });
  });

  it('escapa los comodines de ILIKE', async () => {
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      member: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const repository = new TeamRepository(prisma as any, {} as any);
    await repository.checkEmailsExist(['a_b@x.co']);
    expect(
      prisma.member.findMany.mock.calls[0][0].where.OR[0].email.equals,
    ).toBe('a\\_b@x.co');
  });
});

describe('TeamsService.create — revisiones antes de escribir', () => {
  const repository = {
    checkEmailsExist: jest.fn(),
    findExistingStudentCodes: jest.fn(),
    findByTeamName: jest.fn(),
    findByVideogameName: jest.fn(),
    createTeam: jest.fn(),
  };
  const recaptcha = { verify: jest.fn() };
  let service: TeamsService;

  beforeEach(() => {
    jest.resetAllMocks();
    recaptcha.verify.mockResolvedValue(true);
    repository.checkEmailsExist.mockImplementation(async (emails: string[]) =>
      Object.fromEntries(emails.map((e) => [e, false])),
    );
    repository.findExistingStudentCodes.mockResolvedValue(new Set());
    repository.findByTeamName.mockResolvedValue(false);
    repository.findByVideogameName.mockResolvedValue(false);
    service = new TeamsService(
      {} as any,
      repository as any,
      recaptcha as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any, // RankingService (HU-04)
    );
  });

  const team = (members: any[]) =>
    ({
      teamName: 'Equipo',
      members,
      videogame: { vgName: 'Juego', logoUrl: 'https://x/logo.png' },
      recaptchaToken: 't',
    }) as any;
  const member = (email: string, code: string) => ({
    memberFirstName: 'A',
    memberLastName: 'B',
    memberEmail: email,
    studentCode: code,
    nrc: ['1'],
  });

  const expectConflict = async (dto: any, message: string) => {
    const error = await service.create(dto).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toBe(message);
    expect(repository.createTeam).not.toHaveBeenCalled();
  };

  it('rechaza el mismo correo en dos integrantes', async () => {
    await expectConflict(
      team([member('a@x.co', '1'), member('A@x.co', '2')]),
      'El correo A@x.co está repetido en el equipo.',
    );
  });

  it('rechaza el mismo código en dos integrantes, en español', async () => {
    await expectConflict(
      team([member('a@x.co', '1'), member('b@x.co', '1')]),
      'El código estudiantil 1 está repetido en el equipo.',
    );
  });

  it('revisa el correo de todos los integrantes, no solo el del líder', async () => {
    repository.checkEmailsExist.mockResolvedValue({
      'a@x.co': false,
      'b@x.co': true,
    });
    await expectConflict(
      team([member('a@x.co', '1'), member('b@x.co', '2')]),
      'El correo b@x.co ya está en uso.',
    );
  });

  it('el código ya registrado responde en español', async () => {
    repository.findExistingStudentCodes.mockResolvedValue(
      new Set(['123456789']),
    );
    await expectConflict(
      team([member('a@x.co', '123456789')]),
      'El código estudiantil 123456789 ya está registrado en otro equipo.',
    );
  });

  it('rechaza un nombre de equipo repetido', async () => {
    repository.findByTeamName.mockResolvedValue(true);
    await expectConflict(
      team([member('a@x.co', '1')]),
      'Ya existe un equipo con el nombre "Equipo".',
    );
  });

  it('rechaza un nombre de videojuego repetido', async () => {
    repository.findByVideogameName.mockResolvedValue(true);
    await expectConflict(
      team([member('a@x.co', '1')]),
      'Ya existe un videojuego con el nombre "Juego".',
    );
  });

  it('la inscripción pública sin logo responde 400 antes de revisar el captcha', async () => {
    const dto = team([member('a@x.co', '1')]);
    delete dto.videogame.logoUrl;
    const error = await service.create(dto).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toBe('El logo del videojuego es obligatorio.');
    expect(recaptcha.verify).not.toHaveBeenCalled();
    expect(repository.createTeam).not.toHaveBeenCalled();
  });

  it('validateStudentCodes marca solo los códigos ya registrados', async () => {
    repository.findExistingStudentCodes.mockResolvedValue(new Set(['111']));
    await expect(
      service.validateStudentCodes({ studentCodes: ['111', '222'] }),
    ).resolves.toEqual({
      '111': true,
      '222': false,
    });
  });
});
