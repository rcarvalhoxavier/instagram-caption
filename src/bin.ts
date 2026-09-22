#!/usr/bin/env node
import { main } from "./cli.ts";

main().then((code) => { process.exitCode = code; }).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
