import { WS_METHODS, type PromptStashEntry, type PromptStashEvent } from "@a4code/contracts";
import * as Stream from "effect/Stream";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

type PromptStashProjection = ReadonlyArray<PromptStashEntry> | null;
type ProjectionState =
  | { ready: false; entries: Map<string, PromptStashEntry> }
  | { ready: true; entries: ReadonlyArray<PromptStashEntry> };

export function projectPromptStashEntries<E, R>(
  stream: Stream.Stream<PromptStashEvent, E, R>,
): Stream.Stream<PromptStashProjection, E, R> {
  return stream.pipe(
    Stream.mapAccum(
      (): ProjectionState => ({ ready: false, entries: new Map() }),
      (
        state: ProjectionState,
        event: PromptStashEvent,
      ): readonly [ProjectionState, ReadonlyArray<PromptStashProjection>] => {
        switch (event._tag) {
          case "reset":
            // The durable subscription retains its value across reconnects. The server starts each
            // subscription with reset, so clear that value before accepting a replacement snapshot.
            if (!state.ready) {
              state.entries.clear();
              return [state, [null]];
            }
            return [{ ready: false, entries: new Map() }, [null]];
          case "ready": {
            if (state.ready) return [state, [state.entries]];
            const entries = [...state.entries.values()];
            return [{ ready: true, entries }, [entries]];
          }
          case "upsert": {
            const { entry, evictedId } = event;
            if (!state.ready) {
              if (evictedId !== undefined) state.entries.delete(evictedId);
              state.entries.set(entry.id, entry);
              return [state, []];
            }
            const entries = [entry];
            for (const previous of state.entries) {
              if (previous.id !== entry.id && previous.id !== evictedId) entries.push(previous);
            }
            state.entries = entries;
            return [state, [entries]];
          }
          case "remove": {
            if (!state.ready) {
              state.entries.delete(event.id);
              return [state, []];
            }
            const index = state.entries.findIndex((entry) => entry.id === event.id);
            if (index === -1) return [state, []];
            const entries = [...state.entries];
            entries.splice(index, 1);
            state.entries = entries;
            return [state, [entries]];
          }
        }
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
