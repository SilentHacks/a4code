import { createPromptStashEnvironmentAtoms } from "@a4code/client-runtime/state/promptStash";
import {
  AuthOrchestrationReadScope,
  type EnvironmentId,
  type PromptStashEntry,
} from "@a4code/contracts";
import { AsyncResult, Atom } from "effect/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";
import { environmentPresentations, environmentSummaries } from "./presentation";
import { serverEnvironment } from "./server";
import { environmentSession, sessionHasScope } from "./session";

export const promptStashEnvironment = createPromptStashEnvironmentAtoms(connectionAtomRuntime);

type PromptStashServerStatus = "unknown" | "unsupported" | "supported";
type PromptStashStatus = PromptStashServerStatus | "offline";

const promptStashServerStatusAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make((get): PromptStashServerStatus => {
    const config = get(serverEnvironment.configValueAtom(environmentId));
    if (config === null) return "unknown";
    return config.promptStashSupported === true ? "supported" : "unsupported";
  }),
);

const promptStashReadPermissionAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make((get) =>
    sessionHasScope(
      get(environmentSession.sessionStateAtom(environmentId)),
      AuthOrchestrationReadScope,
    ),
  ),
);

export const promptStashStatusAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make((get): PromptStashStatus =>
    get(environmentSummaries.connectedEnvironmentIdsAtom).includes(environmentId)
      ? get(promptStashServerStatusAtom(environmentId))
      : "offline",
  ).pipe(Atom.withLabel(`web-prompt-stash-status:${environmentId}`)),
);

export const promptStashSaveAvailableAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make(
    (get) =>
      get(promptStashStatusAtom(environmentId)) === "supported" &&
      get(promptStashEnvironment.save.permissionAtom(environmentId)),
  ).pipe(Atom.withLabel(`web-prompt-stash-save-available:${environmentId}`)),
);

export const promptStashTakeAvailableAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make(
    (get) =>
      get(promptStashStatusAtom(environmentId)) === "supported" &&
      get(promptStashEnvironment.take.permissionAtom(environmentId)),
  ).pipe(Atom.withLabel(`web-prompt-stash-take-available:${environmentId}`)),
);

interface EnvironmentPromptStashEntry {
  readonly entry: PromptStashEntry;
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
}

export const promptStashEntriesAtom = Atom.make(
  (get): ReadonlyArray<EnvironmentPromptStashEntry> => {
    const entries: EnvironmentPromptStashEntry[] = [];
    for (const environmentId of get(environmentSummaries.connectedEnvironmentIdsAtom)) {
      if (
        get(promptStashServerStatusAtom(environmentId)) !== "supported" ||
        !get(promptStashReadPermissionAtom(environmentId))
      ) {
        continue;
      }
      const result = get(promptStashEnvironment.entries({ environmentId, input: {} }));
      if (!AsyncResult.isSuccess(result) || result.value === null) continue;
      const environmentLabel =
        get(environmentPresentations.presentationAtom(environmentId))?.entry.target.label ??
        environmentId;
      for (const entry of result.value) entries.push({ entry, environmentId, environmentLabel });
    }
    return entries.sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt));
  },
).pipe(Atom.withLabel("web-prompt-stash-entries"));
