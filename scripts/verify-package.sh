#!/usr/bin/env bash
# Builds the package, packs it, installs the tarball into a throwaway project,
# and imports it FROM INSIDE node_modules.
#
# This is the only test that exercises what users actually install. Every other
# test runs against src/, which lives outside node_modules -- and Node refuses
# to strip types inside node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING),
# so a package shipping raw .ts would pass the whole suite and fail on install.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cd "$root"
npm run build
tarball="$(npm pack --silent | tail -n 1)"
echo "packed: $tarball"

mkdir -p "$work/consumer"
cd "$work/consumer"
printf '{ "name": "consumer", "private": true, "type": "module" }\n' > package.json
npm install --silent --no-audit --no-fund "$root/$tarball"

cat > check.mjs <<'CHECK'
import { classify, resolve, extractShortcode, DEFAULT_USER_AGENT } from "instagram-caption";
import assert from "node:assert/strict";

assert.equal(typeof classify, "function");
assert.equal(typeof resolve, "function");
assert.equal(extractShortcode("https://www.instagram.com/p/ABC123/"), "ABC123");
assert.equal(classify("garbage").kind, "unknown");
assert.match(DEFAULT_USER_AGENT, /^instagram-caption\//);
assert.equal("unescapeHtml" in await import("instagram-caption"), false);
console.log("package imports and works from inside node_modules");
CHECK

node check.mjs

# The types must ship too: a TypeScript consumer that gets `any` has a package
# that technically imports and practically lies.
test -f node_modules/instagram-caption/dist/index.d.ts \
  || { echo "ERROR: dist/index.d.ts missing from the tarball"; exit 1; }
echo "type declarations present"

cd "$root"
rm -f "$tarball"
