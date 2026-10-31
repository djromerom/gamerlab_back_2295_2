import { Prisma } from '@prisma/client';
import { escapeLike } from './escape-like';

/**
 * Búsqueda de usuarios por correo sin distinguir mayúsculas (I4), la ÚNICA que debe usarse.
 *
 * Prisma traduce `equals` + `mode: 'insensitive'` a `ILIKE` sin escapar los comodines, y
 * `@IsEmail()` acepta `_` y `%`: sin `escapeLike`, `j_iaz@x.com` encontraría a `jdiaz@x.com`
 * (toma de cuentas por recuperar contraseña o login de Microsoft).
 */

type UserClient = Pick<Prisma.TransactionClient, 'user'>;

/** Forma en que se guardan los correos nuevos. */
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

const emailFilter = (email: string): Prisma.UserWhereInput => ({
  email: { equals: escapeLike(normalizeEmail(email)), mode: 'insensitive' },
});

/**
 * Todos los usuarios cuyo correo es igual a `email` salvo mayúsculas (más de uno solo si se
 * crearon antes de normalizar). Para comprobar si un correo ya está en uso.
 */
export async function findUsersByEmailCaseInsensitive<
  T extends Prisma.UserInclude = Record<string, never>,
>(
  client: UserClient,
  email: string,
  include?: T,
): Promise<Prisma.UserGetPayload<{ include: T }>[]> {
  return client.user.findMany({
    where: emailFilter(email),
    ...(include ? { include } : {}),
    // Los equivalentes por mayúsculas son pocos; el tope solo evita un barrido completo.
    take: 10,
  }) as Promise<Prisma.UserGetPayload<{ include: T }>[]>;
}

/**
 * El usuario de ese correo: la coincidencia exacta gana (los creados con mayúsculas siguen
 * entrando igual); sin exacta, el único equivalente. Si hay varios equivalentes y ninguno
 * exacto devuelve `null`: el llamador responde su error genérico, nunca elige uno.
 */
export async function findUserByEmailCaseInsensitive<
  T extends Prisma.UserInclude = Record<string, never>,
>(
  client: UserClient,
  email: string,
  include?: T,
): Promise<Prisma.UserGetPayload<{ include: T }> | null> {
  const matches = await findUsersByEmailCaseInsensitive(client, email, include);
  const exact = matches.find((user) => user.email === email.trim());
  if (exact) return exact;
  return matches.length === 1 ? matches[0] : null;
}
