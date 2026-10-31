import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RegistrationsOpenGuard, RegistrationsOpenOrSessionGuard } from './registrations-open.guard';

const ctx = (user?: { roleId: number }): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

function build(open: boolean, adminRoleIds: number[] = [1]) {
  const settings = { getRegistrationsOpen: jest.fn().mockResolvedValue({ registrationsOpen: open }) };
  const guard = new RegistrationsOpenGuard(
    settings as never,
    {} as never,
    {} as never,
    {} as never,
    { get: (_k: string, d: unknown) => d } as never,
  );
  jest.spyOn(guard as never, 'isAdminRole' as never).mockImplementation(((id: number) =>
    Promise.resolve(adminRoleIds.includes(id))) as never);
  return { guard, settings };
}

describe('RegistrationsOpenGuard', () => {
  it('cerradas + sin sesión -> 403 «Las inscripciones están cerradas»', async () => {
    const { guard } = build(false);
    const err = await guard.canActivate(ctx(undefined)).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.message).toBe('Las inscripciones están cerradas');
  });

  it('cerradas + rol no administrador -> 403', async () => {
    const { guard } = build(false);
    await expect(guard.canActivate(ctx({ roleId: 2 }))).rejects.toThrow('Las inscripciones están cerradas');
  });

  it('cerradas + Administrador -> pasa', async () => {
    const { guard } = build(false);
    await expect(guard.canActivate(ctx({ roleId: 1 }))).resolves.toBe(true);
  });

  it('abiertas + sin sesión -> pasa', async () => {
    const { guard } = build(true);
    await expect(guard.canActivate(ctx(undefined))).resolves.toBe(true);
  });
});

describe('RegistrationsOpenOrSessionGuard', () => {
  const mk = () => {
    const g = new RegistrationsOpenOrSessionGuard(
      { getRegistrationsOpen: jest.fn().mockResolvedValue({ registrationsOpen: false }) } as never,
      {} as never, {} as never, {} as never, { get: (_k: string, d: unknown) => d } as never,
    );
    jest.spyOn(g as never, 'isAdminRole' as never).mockResolvedValue(false as never);
    return g;
  };
  it('cerradas + autenticado no admin -> pasa', async () => {
    await expect(mk().canActivate(ctx({ roleId: 2 }))).resolves.toBe(true);
  });
  it('cerradas + anónimo -> 403', async () => {
    await expect(mk().canActivate(ctx(undefined))).rejects.toThrow('Las inscripciones están cerradas');
  });
});
