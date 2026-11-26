import type { APIRoute } from "astro";

import { GITHUB_REPOSITORY_URL, MOBILE_BUILD_URL } from "../lib/site";
import { absoluteUrl, SITE_TAGLINE } from "../lib/seo";

// https://llmstxt.org: a plain index that tells AI agents which domain and links are official.
export const GET: APIRoute = () => {
  const body = `# A4 Code

> ${SITE_TAGLINE}. A4 Code is an independent, unofficial fork of T3 Code.

- [Source code](${GITHUB_REPOSITORY_URL})
- [Releases](${GITHUB_REPOSITORY_URL}/releases)
- [Mobile source builds](${MOBILE_BUILD_URL})

## Policies

- [Security policy](${absoluteUrl("/security-policy")})
- [Privacy policy](${absoluteUrl("/privacy-policy")})
- [Terms of service](${absoluteUrl("/terms-of-service")})
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
