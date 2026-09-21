import { extractShortcode, fetchEmbed, type FetchOptions } from "./fetcher.ts";
import { classify, type ParseResult } from "./resolver.ts";

/**
 * Every answer this package can give. Each variant maps to a different action
 * for the caller, which is the test that justifies five instead of three:
 *
 *   found          write the result
 *   gone           give up permanently; Instagram asserted the post is not there
 *   unknown        write nothing; the page arrived but its shape was not recognised
 *   unavailable    try again later if retryable, give up if not
 *   not-instagram  ignore; this URL is not this package's business
 */
export type Outcome =
  | ParseResult
  | {
      readonly kind: "unavailable";
      readonly reason: string;
      readonly retryable: boolean;
      readonly status?: number;
    }
  | { readonly kind: "not-instagram" };

export async function resolve(url: string, options: FetchOptions = {}): Promise<Outcome> {
  const shortcode = extractShortcode(url);
  if (shortcode === null) return { kind: "not-instagram" };

  const fetched = await fetchEmbed(shortcode, options);
  if (!fetched.ok) {
    return {
      kind: "unavailable",
      reason: fetched.reason,
      retryable: fetched.retryable,
      ...(fetched.status === undefined ? {} : { status: fetched.status }),
    };
  }
  return classify(fetched.body);
}
