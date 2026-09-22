import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLine, parseArgs } from "./cli.ts";

test("each outcome serialises to one JSON object with the url", () => {
  const line = formatLine("https://www.instagram.com/p/ABC/", { kind: "gone" });
  assert.deepEqual(JSON.parse(line), { url: "https://www.instagram.com/p/ABC/", kind: "gone" });
});

test("found carries author and caption", () => {
  const line = formatLine("u", { kind: "found", author: "a", caption: "c" });
  assert.deepEqual(JSON.parse(line), { url: "u", kind: "found", author: "a", caption: "c" });
});

test("a line is a single line, so JSONL stays parseable", () => {
  // A caption containing a newline must not break the one-object-per-line
  // contract, which is the only thing a shell consumer can rely on.
  const line = formatLine("u", { kind: "found", author: "a", caption: "one\ntwo" });
  assert.equal(line.includes("\n"), false);
  assert.equal(JSON.parse(line).caption, "one\ntwo");
});

test("parseArgs reads urls and the delay", () => {
  const parsed = parseArgs(["--delay", "0", "https://www.instagram.com/p/A/"]);
  assert.deepEqual(parsed, { urls: ["https://www.instagram.com/p/A/"], delayMs: 0, help: false });
});

test("parseArgs defaults the delay to 1500ms", () => {
  // The same pause instagram-titles uses between fetches. A CLI that fires 200
  // requests with no pause burns the endpoint for everyone using this package.
  assert.equal(parseArgs(["https://x/"]).delayMs, 1500);
});

test("parseArgs rejects a non-numeric delay instead of defaulting", () => {
  // Number("abc") is NaN, and a NaN delay would silently mean no pause at all.
  assert.throws(() => parseArgs(["--delay", "abc", "u"]), /delay/i);
});

test("parseArgs recognises --help", () => {
  assert.equal(parseArgs(["--help"]).help, true);
});
