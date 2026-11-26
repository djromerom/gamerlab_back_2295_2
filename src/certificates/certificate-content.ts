/** ARK-170 (TA-19) / ARK-309: textos puros de los certificados. */

/** «Ana, Luis y Marta». */
export function joinStudentNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}
