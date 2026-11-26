import { afterEach, expect, it, vi } from "vite-plus/test";

// Keep config parsing independent of local env files and build credentials.
vi.mock("../../scripts/lib/public-config.ts", () => ({
  loadRepoEnv: () => ({
    ...(process.env.APP_VARIANT === undefined ? {} : { APP_VARIANT: process.env.APP_VARIANT }),
    ...(process.env.A4CODE_HOSTED_APP_URL === undefined
      ? {}
      : { A4CODE_HOSTED_APP_URL: process.env.A4CODE_HOSTED_APP_URL }),
  }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

async function loadConfig(variant: string | undefined) {
  vi.resetModules();
  vi.stubEnv("APP_VARIANT", variant);
  return (await import("./app.config.ts")).default;
}

it.each(["prod", ""])("rejects APP_VARIANT=%j before selecting production IDs", async (value) => {
  await expect(loadConfig(value)).rejects.toThrow(
    "APP_VARIANT must be development, preview, or production.",
  );
});

it.each([
  [undefined, "io.github.silenthacks.a4code"],
  ["development", "io.github.silenthacks.a4code.dev"],
  ["preview", "io.github.silenthacks.a4code.preview"],
  ["production", "io.github.silenthacks.a4code"],
])("keeps the iOS and Android identifiers for APP_VARIANT=%j", async (value, identifier) => {
  const config = await loadConfig(value);
  expect(config.ios?.bundleIdentifier).toBe(identifier);
  expect(config.android?.package).toBe(identifier);
  expect(config.ios?.associatedDomains).toEqual([]);
  expect(config.android?.intentFilters).toEqual([]);
  expect(config.updates?.enabled).toBe(false);
  expect(config.updates?.url).toBeUndefined();
});

it("associates thread links with the configured fork host", async () => {
  const host = "app.example.org";
  vi.stubEnv("A4CODE_HOSTED_APP_URL", `https://${host}`);
  const config = await loadConfig("production");
  expect(config.ios?.associatedDomains).toEqual([`applinks:${host}`]);
  expect(config.android?.intentFilters?.[0]?.data).toEqual([
    { scheme: "https", host, pathPrefix: "/threads/" },
  ]);
});
