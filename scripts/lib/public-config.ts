// @effect-diagnostics nodeBuiltinImport:off - Build bootstrap reads optional root env files before an Effect runtime exists.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeUtil from "node:util";

type Environment = Readonly<Record<string, string | undefined>>;

const REPO_ROOT = NodePath.resolve(NodeURL.fileURLToPath(import.meta.url), "../../..");

export function loadRepoEnv({
  baseEnv = process.env,
  repoRoot = REPO_ROOT,
}: {
  readonly baseEnv?: Environment;
  readonly repoRoot?: string;
} = {}): Record<string, string | undefined> {
  const rootEnv = readEnvFile(NodePath.join(repoRoot, ".env"));
  const localEnv = readEnvFile(NodePath.join(repoRoot, ".env.local"));
  const sources = [baseEnv, localEnv, rootEnv];
  const clerkPublishableKey = firstNonEmpty(
    sources,
    "A4CODE_CLERK_PUBLISHABLE_KEY",
    "T3CODE_CLERK_PUBLISHABLE_KEY",
    "VITE_CLERK_PUBLISHABLE_KEY",
    "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
  );
  const clerkJwtTemplate = firstNonEmpty(
    sources,
    "A4CODE_CLERK_JWT_TEMPLATE",
    "T3CODE_CLERK_JWT_TEMPLATE",
    "VITE_CLERK_JWT_TEMPLATE",
    "EXPO_PUBLIC_CLERK_JWT_TEMPLATE",
  );
  const clerkCliOAuthClientId = firstNonEmpty(
    sources,
    "A4CODE_CLERK_CLI_OAUTH_CLIENT_ID",
    "T3CODE_CLERK_CLI_OAUTH_CLIENT_ID",
    "VITE_CLERK_CLI_OAUTH_CLIENT_ID",
  );
  const relayUrl = firstNonEmpty(
    sources,
    "A4CODE_RELAY_URL",
    "T3CODE_RELAY_URL",
    "VITE_A4CODE_RELAY_URL",
    "VITE_T3CODE_RELAY_URL",
  );
  const hostedAppUrl =
    firstNonEmpty(
      sources,
      "A4CODE_HOSTED_APP_URL",
      "T3CODE_HOSTED_APP_URL",
      "VITE_HOSTED_APP_URL",
    ) ?? (relayUrl === "https://relay.t3.codes" ? "https://app.t3.codes" : undefined);
  const mobileTracesUrl = firstNonEmpty(
    sources,
    "A4CODE_MOBILE_OTLP_TRACES_URL",
    "T3CODE_MOBILE_OTLP_TRACES_URL",
    "EXPO_PUBLIC_OTLP_TRACES_URL",
  );
  const mobileTracesDataset = firstNonEmpty(
    sources,
    "A4CODE_MOBILE_OTLP_TRACES_DATASET",
    "T3CODE_MOBILE_OTLP_TRACES_DATASET",
    "EXPO_PUBLIC_OTLP_TRACES_DATASET",
  );
  const mobileTracesToken = firstNonEmpty(
    sources,
    "A4CODE_MOBILE_OTLP_TRACES_TOKEN",
    "T3CODE_MOBILE_OTLP_TRACES_TOKEN",
    "EXPO_PUBLIC_OTLP_TRACES_TOKEN",
  );
  const relayTracesUrl = firstNonEmpty(
    sources,
    "A4CODE_RELAY_CLIENT_OTLP_TRACES_URL",
    "T3CODE_RELAY_CLIENT_OTLP_TRACES_URL",
    "VITE_RELAY_OTLP_TRACES_URL",
  );
  const relayTracesDataset = firstNonEmpty(
    sources,
    "A4CODE_RELAY_CLIENT_OTLP_TRACES_DATASET",
    "T3CODE_RELAY_CLIENT_OTLP_TRACES_DATASET",
    "VITE_RELAY_OTLP_TRACES_DATASET",
  );
  const relayTracesToken = firstNonEmpty(
    sources,
    "A4CODE_RELAY_CLIENT_OTLP_TRACES_TOKEN",
    "T3CODE_RELAY_CLIENT_OTLP_TRACES_TOKEN",
    "VITE_RELAY_OTLP_TRACES_TOKEN",
  );
  const env = {
    ...rootEnv,
    ...localEnv,
    ...baseEnv,
    A4CODE_CLERK_PUBLISHABLE_KEY: clerkPublishableKey,
    VITE_CLERK_PUBLISHABLE_KEY: clerkPublishableKey,
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: clerkPublishableKey,
    A4CODE_CLERK_JWT_TEMPLATE: clerkJwtTemplate,
    VITE_CLERK_JWT_TEMPLATE: clerkJwtTemplate,
    EXPO_PUBLIC_CLERK_JWT_TEMPLATE: clerkJwtTemplate,
    A4CODE_CLERK_CLI_OAUTH_CLIENT_ID: clerkCliOAuthClientId,
    VITE_CLERK_CLI_OAUTH_CLIENT_ID: clerkCliOAuthClientId,
    A4CODE_RELAY_URL: relayUrl,
    VITE_A4CODE_RELAY_URL: relayUrl,
    A4CODE_HOSTED_APP_URL: hostedAppUrl,
    VITE_HOSTED_APP_URL: hostedAppUrl,
    A4CODE_MOBILE_OTLP_TRACES_URL: mobileTracesUrl,
    EXPO_PUBLIC_OTLP_TRACES_URL: mobileTracesUrl,
    A4CODE_MOBILE_OTLP_TRACES_DATASET: mobileTracesDataset,
    EXPO_PUBLIC_OTLP_TRACES_DATASET: mobileTracesDataset,
    A4CODE_MOBILE_OTLP_TRACES_TOKEN: mobileTracesToken,
    EXPO_PUBLIC_OTLP_TRACES_TOKEN: mobileTracesToken,
    A4CODE_RELAY_CLIENT_OTLP_TRACES_URL: relayTracesUrl,
    VITE_RELAY_OTLP_TRACES_URL: relayTracesUrl,
    A4CODE_RELAY_CLIENT_OTLP_TRACES_DATASET: relayTracesDataset,
    VITE_RELAY_OTLP_TRACES_DATASET: relayTracesDataset,
    A4CODE_RELAY_CLIENT_OTLP_TRACES_TOKEN: relayTracesToken,
    VITE_RELAY_OTLP_TRACES_TOKEN: relayTracesToken,
  };
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined));
}

function firstNonEmpty(sources: readonly Environment[], ...names: readonly string[]) {
  for (const source of sources) {
    for (const name of names) {
      const value = source[name]?.trim();
      if (value) return value;
    }
  }
  return undefined;
}

function readEnvFile(path: string): Record<string, string | undefined> {
  return NodeFS.existsSync(path) ? NodeUtil.parseEnv(NodeFS.readFileSync(path, "utf8")) : {};
}
