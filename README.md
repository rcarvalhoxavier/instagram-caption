# instagram-caption

Resolve the author and caption of a public Instagram post. No credentials, no
dependencies, no browser.

## Why this exists

An anonymous request to an Instagram page returns no `og:title` and no
`og:description` - only `og:site_name`, which is always just "Instagram". That
is why link savers, read-later apps and RSS pipelines show Instagram links
titled "Instagram" and nothing else. No amount of Puppeteer, user-agent or
timeout tuning fixes it: the data is not on the page.

It is on the public embed endpoint, and this package reads it.

## Install

```bash
npm install instagram-caption
```

## Use

```javascript
import { resolve } from "instagram-caption";

const outcome = await resolve("https://www.instagram.com/p/DTyxjPyAa18/");

switch (outcome.kind) {
  case "found":         console.log(outcome.author, outcome.caption); break;
  case "gone":          console.log("the post was removed"); break;
  case "unknown":       console.log("the page arrived but did not parse:", outcome.reason); break;
  case "unavailable":   console.log("could not fetch it; retryable:", outcome.retryable); break;
  case "not-instagram": console.log("not an Instagram post URL"); break;
}
```

Five outcomes, because each one calls for a different action. `unknown` and
`unavailable` are deliberately separate: the first means the page arrived and
was not understood, which is evidence the page shape may have changed; the
second means no page arrived at all.

### From the command line

```console
$ npx instagram-caption https://www.instagram.com/p/DTyxjPyAa18/
{"url":"https://www.instagram.com/p/DTyxjPyAa18/","kind":"found","author":"astronautgio","caption":"..."}
```

One JSON object per line, in input order. Reads URLs from arguments or stdin.
Exit code is 0 when every URL produced an outcome, 1 when at least one was
retryably unavailable, 2 on a usage error.

## Identify yourself

The default `User-Agent` names this package. If you set your own, name your own
client:

```javascript
await resolve(url, { userAgent: "my-reader/2.1 (+https://example.com)" });
```

A `User-Agent` naming a known browser family with a version token is
**refused with an error**, on purpose. Instagram serves those a JavaScript app
shell instead of the rendered embed, and the shell does not fail - it parses as
`unknown` for every post. Refusing up front beats resolving nothing forever.

## What it does not do

It does not download media, does not archive content, and uses no Instagram
credentials. It reads the same public embed endpoint any website uses to show
an embedded post. Private accounts and age-restricted posts can never be
resolved; expect `unknown` for those.

Rate limiting is your responsibility. The CLI pauses 1.5s between requests;
the library does not pause at all, because it does not know what else you are
doing.

## License

MIT
