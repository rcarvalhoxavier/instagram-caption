import { createInterface } from "node:readline";
import { resolve, type Outcome } from "./resolve.ts";
import type { FetchOptions } from "./fetcher.ts";

const DEFAULT_DELAY_MS = 1500;

const USAGE = `instagram-caption - resolve the author and caption of public Instagram posts

Usage:
  instagram-caption [--delay MS] URL...
  cat urls.txt | instagram-caption [--delay MS]

Options:
  --delay MS   Milliseconds to wait between requests (default: ${DEFAULT_DELAY_MS}).
  --help       Show this message.

Output is JSONL: one JSON object per line, in input order, each with a "url"
and a "kind" of found, gone, unknown, unavailable or not-instagram.

Exit codes:
  0  every URL produced an outcome
  1  at least one URL was unavailable and retryable
  2  usage error
`;

export interface Args {
  readonly urls: string[];
  readonly delayMs: number;
  readonly help: boolean;
}

export function parseArgs(argv: readonly string[]): Args {
  const urls: string[] = [];
  let delayMs = DEFAULT_DELAY_MS;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") { help = true; continue; }
    if (arg === "--delay") {
      const raw = argv[++i];
      const parsed = Number(raw);
      // Number("abc") is NaN and Number(undefined) is NaN; either would silently
      // become "no pause", which is the opposite of what the flag is for.
      if (raw === undefined || !Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`--delay needs a number of milliseconds >= 0, got ${String(raw)}`);
      }
      delayMs = parsed;
      continue;
    }
    urls.push(arg);
  }
  return { urls, delayMs, help };
}

export function formatLine(url: string, outcome: Outcome): string {
  // JSON.stringify escapes newlines, so one outcome is always one line. That
  // is the only guarantee a shell consumer can build on.
  return JSON.stringify({ url, ...outcome });
}

async function readStdin(): Promise<string[]> {
  if (process.stdin.isTTY) return [];
  const urls: string[] = [];
  for await (const line of createInterface({ input: process.stdin })) {
    const trimmed = line.trim();
    if (trimmed !== "") urls.push(trimmed);
  }
  return urls;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Everything main() touches that a test needs to control. Defaults are the
 * real thing, so `main()` with no argument is the production path and bin.ts
 * needs no knowledge of this.
 *
 * Without the write sinks a test would print JSON into the suite's output;
 * without `options` the exit-code-1 path could only be reached by making a
 * real request to Instagram, which no test may do.
 */
export interface MainDeps {
  readonly argv?: readonly string[];
  readonly options?: FetchOptions;
  readonly write?: (text: string) => void;
  readonly writeError?: (text: string) => void;
}

export async function main(deps: MainDeps = {}): Promise<number> {
  const {
    argv = process.argv.slice(2),
    options = {},
    write = (text: string): void => { process.stdout.write(text); },
    writeError = (text: string): void => { process.stderr.write(text); },
  } = deps;
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    writeError(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
  if (args.help) { write(USAGE); return 0; }

  const urls = args.urls.length > 0 ? args.urls : await readStdin();
  if (urls.length === 0) { writeError(USAGE); return 2; }

  let sawRetryable = false;
  for (const [index, url] of urls.entries()) {
    const outcome = await resolve(url, options);
    if (outcome.kind === "unavailable" && outcome.retryable) sawRetryable = true;
    write(`${formatLine(url, outcome)}\n`);
    // Only pause between real requests: a URL that is not Instagram never hit
    // the network, so pausing after it would just make the tool feel broken.
    if (index < urls.length - 1 && outcome.kind !== "not-instagram") await wait(args.delayMs);
  }
  return sawRetryable ? 1 : 0;
}
