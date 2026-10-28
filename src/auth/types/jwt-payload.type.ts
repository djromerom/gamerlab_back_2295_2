export class JwtPayload {
  sub: string;
  email?: string;
  aud?: string;
  role?: string;
  // Missing on tokens issued before ARK-88; those are still accepted as either type.
  type?: 'access' | 'refresh';
}
