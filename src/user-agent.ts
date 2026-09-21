// Keep in sync with package.json. A stale version here is cosmetic -- it only
// changes what the endpoint's owner sees -- so it is not worth a build step.
export const PACKAGE_VERSION = "0.1.0";

export const DEFAULT_USER_AGENT =
  `instagram-caption/${PACKAGE_VERSION} (+https://github.com/rcarvalhoxavier/instagram-caption)`;

// The embed endpoint serves an app shell, not the embed, to any User-Agent it
// can parse as a known browser family WITH a version token -- measured across
// 17 variants: "Chrome/120.0.0.0 Safari/537.36" and "Firefox/121.0" both get
// the shell, while the same Chrome string with the version removed does not.
// That is a rendering decision rather than an anti-bot one: there is no point
// sending a JavaScript shell to a client that will not run it.
//
// The failure is silent and total, which is why this throws. The shell parses
// to unknown for every post, so a caller would see the package "work" and
// resolve nothing, forever.
//
// Identifying honestly also avoids a risk a Googlebot-style string would carry:
// sites commonly verify that claim by reverse DNS and block clients that lie.
const BROWSER_FAMILY_WITH_VERSION =
  /\b(?:Chrome|Chromium|Firefox|Safari|Edge|Edg|EdgA|OPR|Opera|Version|Trident|MSIE)[\/ ]\d/i;

export function assertUsableUserAgent(value: string): void {
  if (value.trim() === "") {
    throw new Error("userAgent must not be empty: identify your client honestly");
  }
  if (BROWSER_FAMILY_WITH_VERSION.test(value)) {
    throw new Error(
      `userAgent "${value}" names a browser family with a version token. ` +
      "Instagram serves a JavaScript app shell to those, which parses as unknown " +
      "for every post, so this is refused up front rather than failing silently. " +
      "Identify your own client instead, for example \"my-app/1.0 (+https://example.com)\".",
    );
  }
}
