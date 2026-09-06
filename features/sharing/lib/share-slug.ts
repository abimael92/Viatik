/**
 * Share-link slug generation.
 *
 * Slugs are the public token embedded in the guest URL (`/share/[slug]`), so
 * they must be high-entropy and URL-safe: unguessable (nobody should be able to
 * enumerate a trip), yet short enough to paste into a text message.
 */

const SLUG_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Generate a random, URL-safe slug. 12 bytes over a 62-char alphabet yields
 * ~71 bits of entropy (~2^71 combinations), making enumeration impractical.
 */
export function generateShareSlug(byteLength = 12): string {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    throw new Error("A secure random source is required to generate a share slug");
  }
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let slug = "";
  for (const byte of bytes) {
    slug += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
  }
  return slug;
}

/** True when a slug looks like one this app generates. */
export function isValidShareSlug(slug: string | undefined | null): boolean {
  return typeof slug === "string" && /^[A-Za-z0-9]{8,32}$/.test(slug);
}
