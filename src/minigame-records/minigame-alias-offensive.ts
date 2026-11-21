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

/**
 * Abreviaturas groseras de 3 letras o menos, ya que el alias es de 1 a 3 caracteres (como en las
 * máquinas arcade). Se comparan con el alias sin tildes, en minúsculas y con los números típicos
 * cambiados por letras (`P7A` → `pta`). Las de 2 letras bloquean cualquier alias que las contenga
 * (`HPX`, `QLO`).
 *
 * Fuentes: uso común en chats y redes de Colombia, México, el Cono Sur y Perú, y abreviaturas
 * en inglés. Se dejaron fuera las que también son siglas inocentes frecuentes en juegos
 * (PTS, GG, OP, LOL…).
 */
const SHORT_EXACT = new Set([
  // Colombia y general en español
  'hpt', // hijueputa
  'hpta',
  'hdp', // hijo de puta
  'hjp',
  'pta', // puta
  'pto', // puto
  'put',
  'mrd', // mierda
  'mda',
  'vrg', // verga
  'vga',
  'mlp', // malparido
  'gnr', // gonorrea
  'gvn', // güevón
  'hvn',
  'mrc', // marica
  'mcn', // maricón
  'prr', // perra
  'zrr', // zorra
  'jdr', // joder
  'cul', // culo
  'qlo',
  'klo',
  'vtm', // vete a la mierda
  'mmg', // mamagüevo
  'mmv', // mamaverga
  // México
  'ptm', // puta madre
  'alv', // a la verga
  'nmm', // no mames
  // Cono Sur y Perú
  'ctm', // concha tu madre
  'csm', // concha su madre
  'lpm', // la puta madre
  'tmr', // tu madre
  // Inglés
  'fuk',
  'fck',
  'fuc',
  'fkn',
  'fku',
  'wtf',
  'stf',
  'kys', // kill yourself
  'ass',
  'azz',
  'cum',
  'fag',
  'nig',
  'nga',
  'ngr',
  'tit',
  'sht',
  'cnt',
  'hoe',
  'slt',
  'dik',
  'dck',
  'sob', // son of a bitch
  'mfr',
  'smd', // suck my d…
  'sex',
  'xxx',
  'kkk',
  'nzi',
]);
// 2 letras: cualquier alias que las contenga cae.
const SHORT_CONTAINED = ['hp', 'ql', 'mf'];

/** true si el alias es (o contiene) una abreviatura grosera corta. */
export function isOffensiveAbbreviation(alias: string): boolean {
  const text = plain(alias);
  return (
    SHORT_EXACT.has(text) || SHORT_CONTAINED.some((abbr) => text.includes(abbr))
  );
}

/** true si el alias contiene una palabra ofensiva de la lista. */
export function isOffensiveAlias(alias: string): boolean {
  if (isOffensiveAbbreviation(alias)) return true;
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
