import { EnvironmentId, type ServerConfig } from "@t3tools/contracts";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

import { primaryEnvironmentIdAtom } from "./primaryEnvironment";
import { primaryRelayTracingAllowedAtom, serverEnvironment } from "./server";
import { environmentSession } from "./session";

it("clears relay tracing permission when the primary session ends", () => {
  const config = (relayTracingAllowed: boolean) =>
    ({ observability: { relayTracingAllowed } }) as ServerConfig;
  const allowed = config(true);
  const primary = EnvironmentId.make("primary");
  const sessionConfig = Atom.make<ServerConfig | null>(allowed);
  using _session = vi
    .spyOn(environmentSession, "initialConfigValueAtom")
    .mockReturnValue(sessionConfig);
  // The previous session's config stream can retain its last live value across disconnect.
  const lastProjection = serverEnvironment.configProjection({ environmentId: primary, input: {} });
  const registry = AtomRegistry.make({
    initialValues: [
      [primaryEnvironmentIdAtom, primary],
      [
        lastProjection,
        AsyncResult.success({
          config: allowed,
          latestEvent: { type: "snapshot", config: allowed },
          source: "live",
        }),
      ],
    ],
  });
  using _registry = { [Symbol.dispose]: () => registry.dispose() };
  const answers: Array<boolean | null> = [];
  registry.subscribe(primaryRelayTracingAllowedAtom, (answer) => answers.push(answer), {
    immediate: true,
  });

  registry.set(sessionConfig, null);
  registry.set(sessionConfig, config(false));

  expect(answers).toEqual([true, null, false]);
});
