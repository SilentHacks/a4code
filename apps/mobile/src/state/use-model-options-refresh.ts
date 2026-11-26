import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, ModelSelection } from "@a4code/contracts";
import { useEffect } from "react";

import { environmentServerConfigsAtom, serverEnvironment } from "./server";
import { useAtomCommand } from "./use-atom-command";

export function useModelOptionsRefresh(
  environmentId: EnvironmentId | null,
  selection: ModelSelection | null,
) {
  const configs = useAtomValue(environmentServerConfigsAtom);
  const config = environmentId === null ? undefined : configs.get(environmentId);
  const instanceId = selection?.instanceId;
  const model = selection?.model;
  const provider = config?.providers.find((entry) => entry.instanceId === instanceId);
  const supported =
    config?.environment.capabilities.providerModelOptions === true &&
    provider?.driver === "acpRegistry" &&
    provider.enabled &&
    provider.installed &&
    provider.models.some((entry) => entry.slug === model);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  // oxlint-disable-next-line a4code/no-unreasoned-state-sync -- discovers server-side options for the shown model, including defaults and previews before the first turn; provider snapshots publish the result
  useEffect(() => {
    if (environmentId === null || !supported || !instanceId || !model) return;
    void refreshProviders({ environmentId, input: { instanceId, model } });
  }, [environmentId, instanceId, model, supported, refreshProviders]);
}
