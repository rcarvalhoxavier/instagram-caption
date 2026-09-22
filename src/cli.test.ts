import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLine, main, parseArgs } from "./cli.ts";

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

// The three exit codes are a documented contract, and the usage text promises
// them. Reaching them means driving main() itself, so it takes its writes and
// its fetch through injectable defaults: quiet sinks keep the suite's output
// clean, and a stub fetch reaches the retryable path with no network.
const quiet = { write: (): void => {}, writeError: (): void => {} };
const noSleep = async (): Promise<void> => {};

test("exit 1 when at least one url was retryably unavailable", async () => {
  const code = await main({
    ...quiet, argv: ["https://www.instagram.com/p/ABC/"],
    options: { retries: 1, sleep: noSleep, fetchImpl: async () => new Response("", { status: 503 }) },
  });
  assert.equal(code, 1);
});

test("exit 0 when the failure was terminal, because retrying cannot help", async () => {
  // A 404 is unavailable too, but not retryable. Exit 1 means "run me again";
  // saying that about a post that will never resolve would be a lie. Asserting
  // only the code would pass even if nothing had failed at all, so the output
  // line is checked too.
  const lines: string[] = [];
  const code = await main({
    argv: ["https://www.instagram.com/p/ABC/"],
    write: (text: string): void => { lines.push(text); },
    writeError: (): void => {},
    options: { retries: 1, sleep: noSleep, fetchImpl: async () => new Response("", { status: 404 }) },
  });
  assert.equal(code, 0);
  assert.equal(lines.length, 1);
  const outcome = JSON.parse(lines[0]!) as { kind: string; retryable: boolean };
  assert.equal(outcome.kind, "unavailable");
  assert.equal(outcome.retryable, false);
});

test("exit 2 on a usage error", async () => {
  assert.equal(await main({ ...quiet, argv: ["--delay", "abc", "u"] }), 2);
});
