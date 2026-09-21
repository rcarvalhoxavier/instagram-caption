const SHORTCODE = /\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/;
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);

export function extractShortcode(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!INSTAGRAM_HOSTS.has(parsed.hostname)) return null;
  const match = SHORTCODE.exec(parsed.pathname);
  return match?.[1] ?? null;
}

export function embedUrl(shortcode: string): string {
  return `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
}
