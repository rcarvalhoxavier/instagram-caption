import { test } from "node:test";
import assert from "node:assert/strict";
import { embedUrl, extractShortcode, fetchEmbed } from "./fetcher.ts";

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

const noSleep = async (): Promise<void> => {};
const ok = (body: string): Response => new Response(body, { status: 200 });

test("returns the body on success", async () => {
  const fetchImpl = async (): Promise<Response> => ok("<html>ok</html>");
  const result = await fetchEmbed("ABC", { retries: 3, fetchImpl, sleep: noSleep });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.body, "<html>ok</html>");
});

test("retries then succeeds", async () => {
  let calls = 0;
  const fetchImpl = async (): Promise<Response> => {
    calls++;
    if (calls < 3) throw new Error("boom");
    return ok("<html>ok</html>");
  };
  const result = await fetchEmbed("ABC", { retries: 3, fetchImpl, sleep: noSleep });
  assert.equal(result.ok, true);
  assert.equal(calls, 3);
});

test("exhausted retries are retryable, because the next attempt may differ", async () => {
  const fetchImpl = async (): Promise<Response> => { throw new Error("boom"); };
  const result = await fetchEmbed("ABC", { retries: 2, fetchImpl, sleep: noSleep });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.retryable, true);
});

for (const status of [429, 503]) {
  test(`HTTP ${status} is never mistaken for content, and is retryable`, async () => {
    const fetchImpl = async (): Promise<Response> => new Response("", { status });
    const result = await fetchEmbed("ABC", { retries: 2, fetchImpl, sleep: noSleep });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.retryable, true);
    assert.equal(result.status, status);
  });
}

for (const status of [400, 401, 403, 404, 410]) {
  test(`HTTP ${status} is terminal: not retryable, and tried only once`, async () => {
    // This is the distinction the old null could not carry. A caller that
    // retries a 404 forever burns its own budget and the endpoint's.
    let calls = 0;
    const fetchImpl = async (): Promise<Response> => { calls++; return new Response("", { status }); };
    const result = await fetchEmbed("ABC", { retries: 3, fetchImpl, sleep: noSleep });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.retryable, false);
    assert.equal(result.status, status);
    assert.equal(calls, 1, "a terminal status must not be retried");
  });
}

test("a declared content-length over the cap is refused before the body is read", async () => {
  let read = false;
  // A hand-built stand-in rather than a real Response. Two reasons, both
  // measured: wrapping a real Response in a Proxy throws "TypeError: Cannot
  // read private member #state" on the first access, because Response
  // implements status and headers as getters over private class fields; and
  // recording the read inside text() marks it when the body is actually read,
  // which is the claim this test's name makes -- reading the property without
  // calling it is not reading the body.
  const fetchImpl = async (): Promise<Response> => ({
    status: 200,
    headers: new Headers({ "content-length": "99999999" }),
    text: async (): Promise<string> => { read = true; return "x"; },
  } as unknown as Response);

  const result = await fetchEmbed("ABC", { retries: 1, fetchImpl, sleep: noSleep });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.retryable, false, "an oversized response will not shrink on retry");
  assert.equal(read, false, "the body must not be read once the declared size is refused");
});

test("an oversized body is refused after reading, and is not retryable", async () => {
  const huge = "x".repeat(4 * 1024 * 1024 + 1);
  const fetchImpl = async (): Promise<Response> => ok(huge);
  const result = await fetchEmbed("ABC", { retries: 1, fetchImpl, sleep: noSleep });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.retryable, false);
});

test("a browser-like User-Agent is refused before any request is made", async () => {
  let called = false;
  const fetchImpl = async (): Promise<Response> => { called = true; return ok("x"); };
  await assert.rejects(
    fetchEmbed("ABC", {
      retries: 1, fetchImpl, sleep: noSleep,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0 Safari/537.36",
    }),
    /browser/i,
  );
  assert.equal(called, false, "the guard must run before the network does");
});

test("Retry-After is honoured and capped", async () => {
  const slept: number[] = [];
  let calls = 0;
  const fetchImpl = async (): Promise<Response> => {
    calls++;
    if (calls === 1) return new Response("", { status: 429, headers: { "retry-after": "9999" } });
    return ok("<html>ok</html>");
  };
  const result = await fetchEmbed("ABC", {
    retries: 3, fetchImpl, sleep: async (ms: number) => { slept.push(ms); },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(slept, [60_000], "a hostile Retry-After must not park the caller");
});
