const VIATIK_ID_PATTERN = /^VTK-[0-9A-F]{16}$/i;

export function parseViatikId(value: string): string | null {
  const extracted = value
    .trim()
    .replace(/^viatik:\/\/profile\//i, "")
    .replace(/^https:\/\/viatik\.app\/p\//i, "")
    .split(/[?#]/, 1)[0]
    .trim();
  if (VIATIK_ID_PATTERN.test(extracted)) return extracted.toUpperCase();
  return null;
}

export function viatikQrPayload(viatikId: string): string {
  return `viatik://profile/${viatikId}`;
}
