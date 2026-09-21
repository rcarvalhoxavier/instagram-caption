import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_USER_AGENT, assertUsableUserAgent } from "./user-agent.ts";

// Measured across 17 variants against the live endpoint: a known browser family
// WITH a version token gets an app shell instead of the server-rendered embed.
// The shell does not fail -- it returns HTML that parses to unknown for every
// post -- so this has to be refused up front, not diagnosed later.
const BROWSER_LIKE = [
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0) Edg/120.0.0.0",
  "Mozilla/5.0 (Windows NT 10.0) OPR/106.0.0.0",
  "Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1; Trident/4.0)",
];

for (const ua of BROWSER_LIKE) {
  test(`a browser-like User-Agent is refused: ${ua.slice(0, 40)}`, () => {
    assert.throws(() => assertUsableUserAgent(ua), /browser/i);
  });
}

test("the default User-Agent passes its own guard", () => {
  // The guard keys on KNOWN BROWSER FAMILIES, not on the "Name/version" shape,
  // so the package's own "instagram-caption/0.1.0" must survive it. A guard
  // that rejected the default would be a guard nobody could satisfy.
  assert.doesNotThrow(() => assertUsableUserAgent(DEFAULT_USER_AGENT));
});

test("the default identifies the package and links back to it", () => {
  assert.match(DEFAULT_USER_AGENT, /^instagram-caption\/\d+\.\d+\.\d+ \(\+https:\/\//);
});

test("an honest custom User-Agent is allowed", () => {
  assert.doesNotThrow(() => assertUsableUserAgent("my-reader/2.1 (+https://example.com)"));
});

test("an empty User-Agent is refused", () => {
  // Sending no identification at all works today, but it leaves the endpoint's
  // owner with no way to tell this traffic apart or contact anyone about it.
  assert.throws(() => assertUsableUserAgent("   "), /empty/i);
});

test("the version token is what makes a family name dangerous", () => {
  // "the same Chrome string with the version removed does not" get the shell.
  // This test pins the measured distinction so a future edit cannot quietly
  // widen the guard into refusing anything containing the word Chrome.
  assert.doesNotThrow(() => assertUsableUserAgent("chrome-extension-helper (+https://example.com)"));
});
