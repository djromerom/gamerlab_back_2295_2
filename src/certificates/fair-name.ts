/**
 * ARK-170 (TA-19): el certificado nombra la feria por su número («VI Feria Gamer»), no por el
 * título con el que se creó la edición. Hay una feria por semestre: 2025-S2 fue la IV, 2026-S1 la V
 * y 2026-S2 la VI. El semestre se guarda como 10 (primero) o 30 (segundo); 20 es intersemestral y
 * no corresponde a una feria.
 */
const FIRST_FAIR_YEAR = 2024;
const FAIR_OF_SEMESTER: Record<number, number> = { 10: 1, 30: 2 };

const ROMAN_DIGITS: [number, string][] = [
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

function toRoman(value: number): string {
  let rest = value;
  let roman = '';
  for (const [amount, digits] of ROMAN_DIGITS) {
    while (rest >= amount) {
      roman += digits;
      rest -= amount;
    }
  }
  return roman;
}

/** «VI Feria Gamer». Si el periodo no corresponde a una feria, el título de la edición. */
export function fairNameOf(edition: {
  year: number;
  semester: number;
  title: string;
}): string {
  const fairOfYear = FAIR_OF_SEMESTER[edition.semester];
  const number = (edition.year - FIRST_FAIR_YEAR) * 2 + fairOfYear;
  return fairOfYear && number >= 1 && number < 90
    ? `${toRoman(number)} Feria Gamer`
    : edition.title;
}
