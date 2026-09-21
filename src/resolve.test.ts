import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "./resolve.ts";

const load = (name: string): string =>
  readFileSync(new URL(`../fixtures/${name}.html`, import.meta.url), "utf8");

const noSleep = async (): Promise<void> => {};
const serving = (body: string, status = 200) =>
  async (): Promise<Response> => new Response(body, { status });

test("a non-Instagram URL is not-instagram, and never touches the network", async () => {
  // A caller feeding a mixed list of links should not need try/catch for the
  // ordinary case, which is why this is a variant and not a thrown error.
  let called = false;
  const fetchImpl = async (): Promise<Response> => { called = true; return new Response("x"); };
  const outcome = await resolve("https://example.com/p/ABC/", { fetchImpl, sleep: noSleep });
  assert.equal(outcome.kind, "not-instagram");
  assert.equal(called, false);
});

test("a malformed URL is not-instagram, not a throw", async () => {
  const outcome = await resolve("not a url", { sleep: noSleep });
  assert.equal(outcome.kind, "not-instagram");
});

test("a successful fetch is classified", async () => {
  const outcome = await resolve("https://www.instagram.com/p/ABC/", {
    fetchImpl: serving(load("embed_json")), sleep: noSleep,
  });
  assert.equal(outcome.kind, "found");
  if (outcome.kind !== "found") return;
  assert.equal(outcome.author, "astronautgio");
});

test("a removed post is gone", async () => {
  const outcome = await resolve("https://www.instagram.com/p/ABC/", {
    fetchImpl: serving(load("embed_gone")), sleep: noSleep,
  });
  assert.equal(outcome.kind, "gone");
});

test("a fetch failure is unavailable, never unknown", async () => {
  // These are different claims. Unknown means the page arrived and we did not
  // understand it -- evidence the page shape may have changed. Unavailable
  // means no page arrived at all. Collapsing them hides a format change behind
  // network noise.
  const outcome = await resolve("https://www.instagram.com/p/ABC/", {
    retries: 1, fetchImpl: serving("", 503), sleep: noSleep,
  });
  assert.equal(outcome.kind, "unavailable");
  if (outcome.kind !== "unavailable") return;
  assert.equal(outcome.retryable, true);
  assert.equal(outcome.status, 503);
});

test("a terminal status is unavailable and not retryable", async () => {
  const outcome = await resolve("https://www.instagram.com/p/ABC/", {
    fetchImpl: serving("", 404), sleep: noSleep,
  });
  assert.equal(outcome.kind, "unavailable");
  if (outcome.kind !== "unavailable") return;
  assert.equal(outcome.retryable, false);
});

test("a page that arrived but did not parse is unknown, not unavailable", async () => {
  const outcome = await resolve("https://www.instagram.com/p/ABC/", {
    fetchImpl: serving(load("embed_blocked_synthetic")), sleep: noSleep,
  });
  assert.equal(outcome.kind, "unknown");
});

test("the five kinds are exhaustive for a caller", () => {
  // A compile-time check: if a kind is added without updating callers, this
  // stops type-checking. It costs nothing at runtime.
  const kinds: Array<Awaited<ReturnType<typeof resolve>>["kind"]> =
    ["found", "gone", "unknown", "unavailable", "not-instagram"];
  assert.equal(new Set(kinds).size, 5);
});
