import { test } from "node:test";
import assert from "node:assert/strict";
import { embedUrl, extractShortcode } from "./fetcher.ts";

const CASES: ReadonlyArray<readonly [string, string | null]> = [
  ["https://www.instagram.com/p/DTyxjPyAa18/", "DTyxjPyAa18"],
  ["https://www.instagram.com/p/DTyxjPyAa18/?igsh=abc123", "DTyxjPyAa18"],
  ["https://instagram.com/reel/DTyxjPyAa18/", "DTyxjPyAa18"],
  ["https://www.instagram.com/reels/DTyxjPyAa18", "DTyxjPyAa18"],
  ["https://www.instagram.com/astronautgio/p/DTyxjPyAa18/", "DTyxjPyAa18"],
  ["https://example.com/p/DTyxjPyAa18/", null],
  ["https://www.instagram.com/astronautgio/", null],
  ["not a url", null],
];

for (const [url, expected] of CASES) {
  test(`extractShortcode(${url})`, () => assert.equal(extractShortcode(url), expected));
}

test("embedUrl always uses the /p/ form", () => {
  assert.equal(embedUrl("ABC123"), "https://www.instagram.com/p/ABC123/embed/captioned/");
});
