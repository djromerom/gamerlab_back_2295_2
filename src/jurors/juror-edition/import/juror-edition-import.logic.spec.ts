import {
  classifyAccount,
  normalizeImportEmail,
  normalizeImportName,
  parseJurorType,
  summarize,
  validateImportRows,
} from './juror-edition-import.logic';
import { ImportRowReport, RawImportRow } from './juror-edition-import.types';

const raw = (over: Partial<RawImportRow> = {}): RawImportRow => ({
  row: 2,
  firstName: 'Ana',
  lastName: 'Pérez',
  email: 'ana@empresa.com',
  type: '',
  ...over,
});

describe('HU-49: normalización', () => {
  it('el correo queda en minúsculas y sin ningún espacio', () => {
    expect(normalizeImportEmail('  Ana.Perez @Empresa.COM \t')).toBe(
      'ana.perez@empresa.com',
    );
  });

  it('los nombres se recortan y dejan un solo espacio', () => {
    expect(normalizeImportName('  María   José ')).toBe('María José');
  });

  it.each([
    ['', 'OFFICIAL'],
    ['  ', 'OFFICIAL'],
    ['Oficial', 'OFFICIAL'],
    ['OFICIAL', 'OFFICIAL'],
    ['official', 'OFFICIAL'],
    ['Suplente', 'BACKUP'],
    [' suplente ', 'BACKUP'],
    ['BACKUP', 'BACKUP'],
  ])('Tipo %j → %s', (input, expected) => {
    expect(parseJurorType(input)).toBe(expected);
  });

  it('un Tipo desconocido no se reconoce', () => {
    expect(parseJurorType('Senior')).toBeNull();
  });
});

describe('HU-49: validateImportRows', () => {
  it('una fila completa es válida y el Tipo vacío queda Oficial', () => {
    const [row] = validateImportRows([
      raw({ email: ' ANA@Empresa.com ', firstName: ' Ana  María ' }),
    ]);
    expect(row).toEqual({
      row: 2,
      firstName: 'Ana María',
      lastName: 'Pérez',
      email: 'ana@empresa.com',
      type: 'OFFICIAL',
    });
  });

  it('acepta apellidos con diéresis, apóstrofo, punto y guion', () => {
    const rows = validateImportRows([
      raw({ lastName: 'Argüello' }),
      raw({ row: 3, email: 'b@x.com', lastName: "O'Brien-Smith Jr." }),
    ]);
    expect(rows.every((row) => !('error' in row))).toBe(true);
  });

  it.each([
    [{ firstName: '' }, 'MISSING_FIELD', 'Nombres'],
    [{ lastName: ' ' }, 'MISSING_FIELD', 'Apellidos'],
    [{ email: '' }, 'MISSING_FIELD', 'Correo'],
    [{ email: 'sin-arroba' }, 'INVALID_EMAIL', 'correo'],
    [{ email: `${'a'.repeat(150)}@x.com` }, 'INVALID_EMAIL', 'correo'],
    [{ firstName: 'Ana123' }, 'INVALID_NAME', 'Nombres'],
    [{ lastName: 'Pérez <script>' }, 'INVALID_NAME', 'Apellidos'],
    [{ type: 'Senior' }, 'INVALID_TYPE', 'Oficial o Suplente'],
  ])('rechaza %j con %s', (over, code, textInMessage) => {
    const [row] = validateImportRows([raw(over)]);
    expect(row).toMatchObject({ error: code });
    expect((row as { message: string }).message).toContain(textInMessage);
  });

  it('una fila mala no frena a las demás y conserva su número de fila', () => {
    const rows = validateImportRows([
      raw({ row: 2 }),
      raw({ row: 3, email: 'malo' }),
      raw({ row: 4, email: 'c@x.com' }),
    ]);
    expect(rows.map((row) => ('error' in row ? row.error : 'ok'))).toEqual([
      'ok',
      'INVALID_EMAIL',
      'ok',
    ]);
    expect(rows[1].row).toBe(3);
  });

  it('un correo repetido (aunque cambien mayúsculas) solo cuenta la primera vez', () => {
    const rows = validateImportRows([
      raw({ row: 2, email: 'ana@x.com' }),
      raw({ row: 5, email: ' ANA@x.com' }),
    ]);
    expect(rows[0]).not.toHaveProperty('error');
    expect(rows[1]).toMatchObject({
      error: 'DUPLICATE_IN_FILE',
      row: 5,
      message: expect.stringContaining('fila 2') as string,
    });
  });

  it('un correo inválido repetido no cuenta como «primera aparición»', () => {
    const rows = validateImportRows([
      raw({ row: 2, email: 'malo', type: 'x' }),
      raw({ row: 3, email: 'ana@x.com' }),
      raw({ row: 4, email: 'ana@x.com' }),
    ]);
    expect(rows[1]).not.toHaveProperty('error');
    expect(rows[2]).toMatchObject({ error: 'DUPLICATE_IN_FILE' });
  });
});

describe('HU-49: classifyAccount', () => {
  const account = (over: object = {}) => ({
    isActive: true,
    roleName: 'Jurado',
    verificationStatus: 'CONFIRMADO',
    ...over,
  });

  it('sin cuenta: se crea', () => {
    expect(classifyAccount(null)).toEqual({ kind: 'CREATE' });
  });

  it.each(['Jurado', 'Profesor'])(
    '%s activo y verificado: solo se confirma, sin correo',
    (roleName) => {
      expect(classifyAccount(account({ roleName }))).toEqual({
        kind: 'ENROLL',
        resendVerification: false,
      });
    },
  );

  it('cuenta sin verificar (activa o no): se reenvía la verificación', () => {
    expect(
      classifyAccount(account({ verificationStatus: 'PENDIENTE' })),
    ).toEqual({ kind: 'ENROLL', resendVerification: true });
    expect(
      classifyAccount(account({ isActive: false, verificationStatus: null })),
    ).toEqual({ kind: 'ENROLL', resendVerification: true });
  });

  it('inactiva pero ya verificada: alguien la desactivó, error', () => {
    expect(classifyAccount(account({ isActive: false }))).toMatchObject({
      kind: 'ERROR',
      error: 'ACCOUNT_DISABLED',
    });
  });

  it.each(['Estudiante', 'Administrador', 'Staff'])(
    'rol %s: error',
    (roleName) => {
      const action = classifyAccount(account({ roleName }));
      expect(action).toMatchObject({ kind: 'ERROR', error: 'WRONG_ROLE' });
      expect((action as { message: string }).message).toContain(roleName);
    },
  );
});

describe('HU-49: summarize', () => {
  it('cuenta cada resultado y los correos en cola', () => {
    const row = (
      result: ImportRowReport['result'],
      emailStatus: ImportRowReport['emailStatus'] = 'NOT_NEEDED',
    ) => ({ result, emailStatus }) as ImportRowReport;
    expect(
      summarize([
        row('CREATED', 'QUEUED'),
        row('CONFIRMED', 'QUEUED'),
        row('CONFIRMED'),
        row('ALREADY_CONFIRMED'),
        row('ERROR'),
      ]),
    ).toEqual({
      total: 5,
      created: 1,
      confirmed: 2,
      alreadyConfirmed: 1,
      errors: 1,
      emailsQueued: 2,
    });
  });
});
