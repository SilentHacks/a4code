import { assert, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";

import {
  hostedAppUrlConfig,
  makeCloudCliOAuthConfig,
  makeRelayUrlConfig,
  resolveRelayClientTracingConfig,
} from "./publicConfig.ts";

const provideEnv = (env: Readonly<Record<string, string>>) =>
  Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env })));

it.effect("rejects an insecure runtime relay URL override", () =>
  makeRelayUrlConfig("https://embedded.example.test").pipe(
    provideEnv({ A4CODE_RELAY_URL: "http://runtime.example.test" }),
    Effect.flip,
  ),
);

it.effect("rejects malformed or insecure hosted app URLs", () =>
  Effect.gen(function* () {
    for (const value of [
      "app.example.test",
      "http://app.example.test",
      "https://app.example.test/nested",
      "https://app.example.test?alias=true",
      "https://user:password@app.example.test",
    ]) {
      const result = yield* hostedAppUrlConfig.pipe(
        provideEnv({ A4CODE_HOSTED_APP_URL: value }),
        Effect.result,
      );
      assert.isTrue(Result.isFailure(result), value);
    }
  }),
);

it.effect("has no hosted app without operator configuration", () =>
  hostedAppUrlConfig.pipe(provideEnv({}), Effect.flip),
);

it.effect("uses the existing T3 Connect relay and hosted sign-in with legacy configuration", () =>
  Effect.gen(function* () {
    const env = {
      T3CODE_RELAY_URL: "https://relay.t3.codes",
      T3CODE_CLERK_PUBLISHABLE_KEY: "pk_live_Y2xlcmsudDMuY29kZXMk",
      T3CODE_CLERK_CLI_OAUTH_CLIENT_ID: "existing-client",
    };
    assert.equal(yield* makeRelayUrlConfig("").pipe(provideEnv(env)), "https://relay.t3.codes");
    assert.equal(yield* hostedAppUrlConfig.pipe(provideEnv(env)), "https://app.t3.codes");
    const oauth = yield* makeCloudCliOAuthConfig().pipe(provideEnv(env));
    assert.equal(oauth.tokenEndpoint, "https://clerk.t3.codes/oauth/token");
    assert.equal(oauth.clientId, "existing-client");
  }),
);

it.effect("derives direct Clerk OAuth endpoints from statically injected public config", () =>
  Effect.gen(function* () {
    const config = yield* makeCloudCliOAuthConfig({
      clerkPublishableKeyFallback: "pk_test_Y2xlcmsuZXhhbXBsZS50ZXN0JA==",
      clerkCliOAuthClientIdFallback: "oauth_client_embedded",
    }).pipe(provideEnv({}));

    assert.deepEqual(config, {
      tokenEndpoint: "https://clerk.example.test/oauth/token",
      deviceAuthorizationEndpoint: "https://clerk.example.test/oauth/device_authorization",
      clientId: "oauth_client_embedded",
      loopbackPort: 34338,
      redirectUri: "http://127.0.0.1:34338/callback",
      scopes: ["openid", "profile", "email", "offline_access"],
    });
  }),
);

it("product opt-out disables relay tracing with either built-in or runtime credentials", () => {
  const fallback = {
    tracesUrl: "https://embedded.example.test/v1/traces",
    tracesDataset: "embedded-dataset",
    tracesToken: "embedded-token",
  };
  const env = {
    A4CODE_TELEMETRY_ENABLED: "false",
    A4CODE_OTEL_SDK_DISABLED: "false",
  };

  assert.equal(resolveRelayClientTracingConfig(env, fallback), null);
  assert.equal(
    resolveRelayClientTracingConfig(
      {
        ...env,
        A4CODE_RELAY_CLIENT_OTLP_TRACES_URL: "https://runtime.example.test/v1/traces",
        A4CODE_RELAY_CLIENT_OTLP_TRACES_DATASET: "runtime-dataset",
        A4CODE_RELAY_CLIENT_OTLP_TRACES_TOKEN: "runtime-token",
      },
      fallback,
    ),
    null,
  );
});
