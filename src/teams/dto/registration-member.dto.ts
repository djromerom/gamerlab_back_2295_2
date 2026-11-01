import { Matches } from 'class-validator';
import { MemberDto } from './member.dto';

/**
 * Integrante en la inscripción de un equipo nuevo (POST /teams). Además de lo de `MemberDto`,
 * el código estudiantil debe tener solo dígitos (BG-06). La regla vive aparte para no romper la
 * edición de equipos viejos que se guardaron con otros formatos (`UpdateMemberDto` hereda de
 * `MemberDto`).
 */
export class RegistrationMemberDto extends MemberDto {}

// Se registra sobre la propiedad heredada sin redeclararla (TS2612 con useDefineForClassFields)
Matches(/^\d+$/, {
  message: 'El código de estudiante solo puede tener números',
})(RegistrationMemberDto.prototype, 'studentCode');
