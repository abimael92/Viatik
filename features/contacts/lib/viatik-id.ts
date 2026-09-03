const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VIATIK_ID_PATTERN = /^VTK-[0-9A-F]{16}$/i;

export function parseViatikId(value: string): string | null {
  const extracted = value
    .trim()
    .replace(/^viatik:\/\/profile\//i, "")
    .replace(/^https:\/\/viatik\.app\/p\//i, "")
    .split(/[?#]/, 1)[0]
    .trim();
  if (VIATIK_ID_PATTERN.test(extracted)) return extracted.toUpperCase();
  if (UUID_PATTERN.test(extracted)) return extracted.toLowerCase();
  return null;
}

export function viatikQrPayload(viatikId: string): string {
  return `viatik://profile/${viatikId}`;
}
