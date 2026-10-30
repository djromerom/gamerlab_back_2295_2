// Firmas (magic numbers) de los tipos aceptados. El mimetype lo declara el cliente
// y se puede falsear, así que además se revisan los primeros bytes del archivo (BG-02).
const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

export function isAllowedImage(buf: Buffer | undefined): boolean {
  if (!buf) return false;
  return (
    startsWith(buf, [0xff, 0xd8, 0xff]) || // JPEG
    startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) || // PNG
    startsWith(buf, [0x47, 0x49, 0x46, 0x38]) || // GIF8
    (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) // RIFF....WEBP
  );
}

export function isZip(buf: Buffer | undefined): boolean {
  if (!buf) return false;
  return (
    startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || // archivo con entradas
    startsWith(buf, [0x50, 0x4b, 0x05, 0x06]) // zip vacío
  );
}
