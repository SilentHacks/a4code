import type { EnvironmentCatalogState } from "@a4code/client-runtime/state/connections";
import type { EnvironmentId, ServerConfig } from "@a4code/contracts";
import { mergeWithDefaultKeybindings } from "@a4code/shared/keybindings";
import { Atom } from "effect/reactivity";

import { environmentCatalog } from "../connection/catalog";
import { isHostedStaticApp } from "../hostedPairing";
import { isLocalEnvironmentDisabled } from "../localEnvironment";

export function createApplicationKeybindingsEnvironmentIdAtom(input: {
  readonly catalogValueAtom: Atom.Atom<EnvironmentCatalogState>;
  readonly requiresPrimaryEnvironment: boolean;
}) {
  return Atom.make((get): EnvironmentId | null => {
    const { entries } = get(input.catalogValueAtom);
    for (const [environmentId, entry] of entries) {
      if (entry.target._tag === "PrimaryConnectionTarget") return environmentId;
    }
    if (input.requiresPrimaryEnvironment) return null;
    // Catalog order follows saved registrations, not connection speed or the active project.
    for (const [environmentId, entry] of entries) {
      if (entry.enabled) return environmentId;
    }
    return null;
  }).pipe(Atom.withLabel("web-application-keybindings-environment-id"));
}

export const applicationKeybindingsEnvironmentIdAtom =
  createApplicationKeybindingsEnvironmentIdAtom({
    catalogValueAtom: environmentCatalog.catalogValueAtom,
    requiresPrimaryEnvironment: !isHostedStaticApp() && !isLocalEnvironmentDisabled(),
  });

export function createApplicationKeybindingsAtom(input: {
  readonly environmentIdAtom: Atom.Atom<EnvironmentId | null>;
  readonly serverConfigValueAtom: (
    environmentId: EnvironmentId,
  ) => Atom.Atom<Pick<ServerConfig, "keybindings"> | null>;
}) {
  return Atom.make((get): ServerConfig["keybindings"] => {
    const environmentId = get(input.environmentIdAtom);
    const config = environmentId === null ? null : get(input.serverConfigValueAtom(environmentId));
    return mergeWithDefaultKeybindings(config?.keybindings ?? []);
  }).pipe(Atom.withLabel("web-application-keybindings"));
}
