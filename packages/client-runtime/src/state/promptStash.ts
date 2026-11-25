import { WS_METHODS, type PromptStashEntry, type PromptStashEvent } from "@t3tools/contracts";
import * as Stream from "effect/Stream";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

type PromptStashProjection = ReadonlyArray<PromptStashEntry> | null;
type ProjectionState = { ready: boolean; entries: Map<string, PromptStashEntry> };

export function projectPromptStashEntries<E, R>(
  stream: Stream.Stream<PromptStashEvent, E, R>,
): Stream.Stream<PromptStashProjection, E, R> {
  return stream.pipe(
    Stream.mapAccum(
      () => ({ ready: false, entries: new Map<string, PromptStashEntry>() }),
      (
        state: ProjectionState,
        event: PromptStashEvent,
      ): readonly [ProjectionState, ReadonlyArray<PromptStashProjection>] => {
        switch (event._tag) {
          case "reset":
            // The durable subscription retains its value across reconnects. The server starts each
            // subscription with reset, so clear that value before accepting a replacement snapshot.
            state.ready = false;
            state.entries.clear();
            return [state, [null]];
          case "ready":
            state.ready = true;
            break;
          case "upsert":
            if (event.evictedId !== undefined) state.entries.delete(event.evictedId);
            state.entries.set(event.entry.id, event.entry);
            break;
          case "remove":
            if (!state.entries.delete(event.id)) return [state, []];
            break;
        }
        return [state, state.ready ? [[...state.entries.values()]] : []];
      },
    ),
  );
}

export function createPromptStashEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    entries: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:prompt-stash:entries",
      tag: WS_METHODS.promptStashSubscribe,
      idleTtlMs: 0,
      transform: projectPromptStashEntries,
    }),
    save: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:prompt-stash:save",
      tag: WS_METHODS.promptStashSave,
    }),
    take: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:prompt-stash:take",
      tag: WS_METHODS.promptStashTake,
    }),
  };
}
