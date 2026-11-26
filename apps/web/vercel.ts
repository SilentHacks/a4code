import { matchers, routes, type Transform, type VercelConfig } from "@vercel/config/v1";

const ROUTER_HOST = process.env.A4CODE_WEB_ROUTER_URL
  ? new URL(process.env.A4CODE_WEB_ROUTER_URL).host
  : undefined;
const HOSTED_WEB_CHANNEL_COOKIE = "a4code_web_channel";
const LATEST_HOST = process.env.A4CODE_WEB_LATEST_DOMAIN;
const NIGHTLY_HOST = process.env.A4CODE_WEB_NIGHTLY_DOMAIN;
const CLEAN_CHANNEL_QUERY_TRANSFORMS = [
  {
    type: "request.query",
    op: "delete",
    target: { key: "channel" },
  },
] satisfies Transform[];

function channelCookie(channel: "latest" | "nightly"): string {
  return [
    `${HOSTED_WEB_CHANNEL_COOKIE}=${channel}`,
    "Path=/",
    "Max-Age=31536000",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export const config: VercelConfig = {
  buildCommand:
    'vp run --filter @a4code/web build && node ../../scripts/apply-web-brand-assets.ts --channel "${VITE_HOSTED_APP_CHANNEL:-latest}"',
  git: {
    deploymentEnabled: false,
  },
  installCommand:
    "npm install -g vite-plus && vp install --ignore-scripts --filter '@a4code/scripts...' --filter '@a4code/web...'",
  routes: [
    {
      src: "/__a4code/channel",
      has: [matchers.query("channel", "nightly")],
      transforms: CLEAN_CHANNEL_QUERY_TRANSFORMS,
      headers: {
        Location: "/",
        "Set-Cookie": channelCookie("nightly"),
      },
      status: 302,
    },
    {
      src: "/__a4code/channel",
      transforms: CLEAN_CHANNEL_QUERY_TRANSFORMS,
      headers: {
        Location: "/",
        "Set-Cookie": channelCookie("latest"),
      },
      status: 302,
    },
    ...(ROUTER_HOST && LATEST_HOST && NIGHTLY_HOST
      ? [
          {
            src: "/(.*)",
            has: [
              matchers.host(ROUTER_HOST),
              matchers.cookie(HOSTED_WEB_CHANNEL_COOKIE, "nightly"),
            ],
            dest: `https://${NIGHTLY_HOST}/$1`,
          },
          {
            src: "/(.*)",
            has: [matchers.host(ROUTER_HOST)],
            dest: `https://${LATEST_HOST}/$1`,
          },
        ]
      : []),
  ],
  rewrites: [
    // Apple fetches it without an extension; the .json file is served as application/json.
    routes.rewrite(
      "/.well-known/apple-app-site-association",
      "/.well-known/apple-app-site-association.json",
    ),
    routes.rewrite("/(.*)", "/index.html"),
  ],
};
