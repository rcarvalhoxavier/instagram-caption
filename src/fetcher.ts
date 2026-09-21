import { DEFAULT_USER_AGENT, assertUsableUserAgent } from "./user-agent.ts";

const SHORTCODE = /\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/;
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);

export function extractShortcode(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!INSTAGRAM_HOSTS.has(parsed.hostname)) return null;
  const match = SHORTCODE.exec(parsed.pathname);
  return match?.[1] ?? null;
}

export function embedUrl(shortcode: string): string {
  return `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
}

export type Fetcher = typeof fetch;

export type FetchResult =
  | { readonly ok: true; readonly body: string }
  | {
      readonly ok: false;
      readonly reason: string;
      /** True when a later attempt could plausibly give a different answer. */
      readonly retryable: boolean;
      readonly status?: number;
    };

export const REQUEST_TIMEOUT_MS = 20_000;
const BACKOFF_STEP_MS = 2_000;
const RETRY_AFTER_CAP_SECONDS = 60;

// A response far larger than a real embed page is either not an embed page or
// not worth parsing. This bounds the regex work, not the allocation: by the
// time it is checked the body is already in memory. Counted in UTF-16 code
// units, which is what String.length returns -- hence CHARS, not BYTES.
const MAX_BODY_CHARS = 4 * 1024 * 1024;

// Retrying these never helps: the answer will not change on the next attempt.
const TERMINAL_STATUSES = new Set([400, 401, 403, 404, 410]);

export interface FetchOptions {
  /** Total attempts, not retries after the first. Defaults to 3. */
  readonly retries?: number;
  readonly backoffMs?: number;
  readonly fetchImpl?: Fetcher;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly userAgent?: string;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function fetchEmbed(
  shortcode: string,
  options: FetchOptions = {},
): Promise<FetchResult> {
  const {
    retries = 3, backoffMs = BACKOFF_STEP_MS, fetchImpl = fetch, sleep = wait,
    userAgent = DEFAULT_USER_AGENT,
  } = options;

  // Before the network, not after: a browser-like User-Agent does not fail, it
  // succeeds into an app shell that parses as unknown for every post.
  assertUsableUserAgent(userAgent);

  const url = embedUrl(shortcode);
  let lastReason = "no attempt was made";
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Without an explicit signal a hanging peer falls back to undici's 300s
      // default, so one stuck host could stretch a caller's loop into hours.
      const response = await fetchImpl(url, {
        headers: { "User-Agent": userAgent },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.status === 200) {
        // Cheap pre-check when the server declares a size, so an absurd
        // response is refused before it is read rather than after.
        const declared = Number(response.headers.get("content-length"));
        if (Number.isFinite(declared) && declared > MAX_BODY_CHARS) {
          return {
            ok: false, retryable: false, status: 200,
            reason: `declared ${declared} bytes, over the ${MAX_BODY_CHARS} cap`,
          };
        }
        const body = await response.text();
        if (body.length > MAX_BODY_CHARS) {
          return {
            ok: false, retryable: false, status: 200,
            reason: `returned ${body.length} chars, over the ${MAX_BODY_CHARS} cap`,
          };
        }
        return { ok: true, body };
      }

      lastStatus = response.status;
      if (TERMINAL_STATUSES.has(response.status)) {
        return {
          ok: false, retryable: false, status: response.status,
          reason: `HTTP ${response.status}`,
        };
      }
      lastReason = `HTTP ${response.status}`;

      // Honour the server telling us how long to wait, capped so a hostile or
      // mistaken header cannot park the caller. Skipped on the final attempt,
      // where sleeping would delay a result we are about to return anyway.
      //
      // Any non-terminal status may carry Retry-After, not just 429: RFC 7231
      // section 7.1.3 defines it for 503 too, which is its older and more
      // common use. Keying on the header rather than on the status means a
      // server that asks for room gets it, whichever way it says so.
      if (attempt < retries) {
        const after = Number(response.headers.get("retry-after"));
        if (Number.isFinite(after) && after > 0) {
          await sleep(Math.min(after, RETRY_AFTER_CAP_SECONDS) * 1000);
          continue;
        }
      }
    } catch (error) {
      lastReason = String(error);
      lastStatus = undefined;
    }
    if (attempt < retries) await sleep(backoffMs * attempt);
  }

  return {
    ok: false, retryable: true, reason: `${retries} attempt(s) failed; last: ${lastReason}`,
    ...(lastStatus === undefined ? {} : { status: lastStatus }),
  };
}
