import { test } from "node:test";
import assert from "node:assert/strict";
import * as api from "./index.ts";

test("the public surface is exactly what was designed", () => {
  // Pinned on purpose. Adding an export is a decision worth a failing test,
  // because everything named here has to keep working until a major version.
  assert.deepEqual(Object.keys(api).sort(), [
    "DEFAULT_USER_AGENT",
    "REQUEST_TIMEOUT_MS",
    "classify",
    "embedUrl",
    "extractShortcode",
    "fetchEmbed",
    "resolve",
  ]);
});

test("unescapeHtml is deliberately not public", () => {
  // It is a generic HTML entity decoder with nothing to do with Instagram.
  // Exporting it would mean versioning that contract forever.
  assert.equal("unescapeHtml" in api, false);
});
