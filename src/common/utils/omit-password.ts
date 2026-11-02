/** Quita el hash de contraseña de un usuario antes de responderlo por HTTP. */
export function omitPassword<T extends { password?: unknown }>(
  user: T,
): Omit<T, 'password'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...rest } = user;
  return rest;
}
