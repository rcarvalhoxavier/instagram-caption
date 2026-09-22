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

# The tarball is written into the repo root, not into $work, so cleaning only
# the temp directory leaves it behind on every failing run. Measured: sabotage
# the exports field and the script exits 1 with the .tgz still sitting in the
# project root. The guard on ${tarball:-} covers the window before npm pack
# has assigned it.
cleanup() {
  rm -rf "$work"
  if [ -n "${tarball:-}" ]; then rm -f "$root/$tarball"; fi
}
trap cleanup EXIT

cd "$root"
npm run build
tarball="$(npm pack --silent | tail -n 1)"
echo "packed: $tarball"

mkdir -p "$work/consumer"
cd "$work/consumer"
printf '{ "name": "consumer", "private": true, "type": "module" }\n' > package.json
# @types/node is a dev-time concern of THIS TEST, not a dependency of the
# package: a real Node consumer already has it (or lib dom) in their own
# project, and installing it here is what makes the throwaway project match
# that reality instead of a configuration no real consumer has.
npm install --silent --no-audit --no-fund "$root/$tarball" @types/node@^26.6.1

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

# A declaration file that exists but does not type-check is worse than none.
# The consumer gets @types/node because the published types reference `fetch`
# via `typeof fetch`, and every real Node consumer has those ambient types --
# measured: with @types/node or with lib dom this compiles clean, with neither
# it cannot, and a consumer with neither could not call fetch themselves either.
cat > consumer.ts <<'CONSUMER'
import { resolve, type Outcome } from "instagram-caption";
export const check = async (u: string): Promise<Outcome["kind"]> => (await resolve(u)).kind;
CONSUMER
cat > tsconfig.json <<'TSCONFIG'
{
  "compilerOptions": {
    "target": "ES2023", "lib": ["ES2023"], "module": "nodenext",
    "moduleResolution": "nodenext", "strict": true, "noEmit": true,
    "types": ["node"]
  },
  "include": ["consumer.ts"]
}
TSCONFIG
"$root/node_modules/.bin/tsc" -p tsconfig.json \
  || { echo "ERROR: the published type declarations do not type-check for a consumer"; exit 1; }
echo "type declarations compile for a consumer"
