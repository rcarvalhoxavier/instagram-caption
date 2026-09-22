# Fixtures

These four files are the evidence the parser is tested against. Three are real
responses captured from Instagram; one is synthetic. They are committed
unmodified on purpose: a fixture edited to look tidy stops being evidence of
what the endpoint actually returns, which is the only thing that makes the
tests meaningful.

| File | Origin |
|---|---|
| `embed_json.html` | Real capture. The variant that carries the caption in an escaped JSON blob, under `edge_media_to_caption`. |
| `embed_html.html` | Real capture. The variant that carries the caption server-rendered inside `<div class="Caption">`. |
| `embed_gone.html` | Real capture, for a shortcode that does not exist. Returns HTTP 200 with `class="EmbedBrokenMedia"` - the positive marker that lets the parser assert a post is gone rather than merely fail to read it. |
| `embed_blocked_synthetic.html` | Hand-written, never captured. It carries its own header explaining why. |

## About what is inside them

The three real captures were made with an unauthenticated request in September
2026, from a browser with no Instagram session. They contain no account
credentials: there is no session cookie, no `ds_user_id` value and no viewer
identity. `ds_user_id` and `sessionid` appear only as key names inside a
cookie-lifetime configuration map, with no values attached.

They do contain two anonymous per-request artifacts that Instagram hands any
visitor: a `csrf_token` and a `device_id`. Both are scoped to a browsing
session that no longer exists and are tied to no account. They are left in
place for the same reason as everything else here - so that what the tests read
is what the endpoint served.
