/*
 HU-52 (ARK-315): filtro de palabras ofensivas en el alias de los récords, que se ven en la
 pantalla principal pública durante la feria.

 Se compara el alias «compacto»: sin tildes, en minúsculas, con los números típicos cambiados por
 letras (4 → a, 3 → e, 1 → i, 0 → o, 5 → s, 7 → t), sin espacios, puntos ni guiones y sin letras
 repetidas. Así `p.u.t.a`, `PUTA`, `Pu-Ta` o `puuuta` también caen.

 Es una lista corta a propósito: palabras que casi nunca aparecen dentro de una palabra inocente.
 Las pocas palabras comunes que sí las contienen (computador, disputa, reputación…) se quitan
 antes de buscar. Si se cuela algo, el Administrador lo borra con DELETE /minigame-records/:id.
*/

const LEET: Record<string, string> = {
  '4': 'a',
  '@': 'a',
  '3': 'e',
  '1': 'i',
  '!': 'i',
  '0': 'o',
  '5': 's',
  $: 's',
  '7': 't',
};

/**
 * Groserías comunes en español (con las de Colombia) y algunas en inglés. Se guardan tal cual y
 * se comparan compactas. «perra» y «zorra» solo cuentan con la doble r, porque compactas quedan
 * como «pera» (la fruta) y «zora».
 */
const SPANISH = [
  'puta',
  'puto',
  'mierda',
  'verga',
  'pendejo',
  'pendeja',
  'marica',
  'maricon',
  'malparido',
  'malparida',
  'gonorrea',
  'hijueputa',
  'culero',
  'culiao',
  'cabron',
  'joder',
  'follar',
  'mamaguevo',
  'mamahuevo',
  'guevon',
  'huevon',
  'chupamela',
  'violador',
  'nazi',
  'hitler',
  'porno',
  'idiota',
  'imbecil',
  'estupido',
  'estupida',
];
const ENGLISH = [
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'nigga',
  'faggot',
  'asshole',
  'whore',
  'slut',
  'porn',
];
const DOUBLE_R_WORDS = ['perra', 'zorra'];
// Palabras inocentes con «perra» o «zorra» dentro (superrápido).
const DOUBLE_R_SAFE = ['superra'];

/** Palabras inocentes que contienen una de la lista: se quitan antes de buscar. */
const SAFE_WORDS = [
  'computa', // computador, computadora
  'computo',
  'disputa',
  'imputa',
  'reputa', // reputación
  'diputa', // diputado
  'amputa',
  'maricarmen',
  'vergara',
];

/** Sin tildes ni mayúsculas y con los números típicos cambiados por letras. */
function plain(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[4@3150!7$]/g, (ch) => LEET[ch] ?? ch)
    .replace(/[^a-z]/g, '');
}

/** Alias compacto: `plain` y sin letras repetidas (`puuuta` → `puta`). */
export function compact(value: string): string {
  return plain(value).replace(/(.)\1+/g, '$1');
}

const WORDS = [...SPANISH, ...ENGLISH].map(compact);
const SAFE = SAFE_WORDS.map(compact);

/** true si el alias contiene una palabra ofensiva de la lista. */
export function isOffensiveAlias(alias: string): boolean {
  const withRepeats = DOUBLE_R_SAFE.reduce(
    (acc, safe) => acc.split(safe).join('|'),
    plain(alias),
  );
  if (DOUBLE_R_WORDS.some((word) => withRepeats.includes(word))) return true;
  const text = SAFE.reduce(
    (acc, safe) => acc.split(safe).join('|'),
    compact(alias),
  );
  return WORDS.some((word) => text.includes(word));
}
