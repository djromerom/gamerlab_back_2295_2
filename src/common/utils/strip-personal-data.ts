/**
 * Keys that identify a person and must never reach an anonymous caller (BG-02).
 */
export const PERSONAL_DATA_KEYS = ['email', 'studentCode'] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * Returns a deep copy of `value` without the PERSONAL_DATA_KEYS, at any depth.
 * Dates, Prisma Decimals and other class instances are kept as they are.
 */
export function stripPersonalData<T>(value: T, keys: readonly string[] = PERSONAL_DATA_KEYS): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripPersonalData(item, keys)) as unknown as T;
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (keys.includes(key)) continue;
    result[key] = stripPersonalData(item, keys);
  }
  return result as T;
}
