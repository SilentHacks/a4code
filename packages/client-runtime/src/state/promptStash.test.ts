import { expect, it } from "@effect/vitest";
import type { PromptStashEntry, PromptStashEvent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import { projectPromptStashEntries } from "./promptStash.ts";

function entry(id: string): PromptStashEntry {
  return {
    id,
    createdAt: "2026-10-01T00:00:00.000Z",
    prompt: id,
    attachments: [],
    droppedImageNames: [],
  };
}

it.effect("keeps equal-timestamp entries in the same order after live updates and reconnect", () =>
  Effect.gen(function* () {
    const a = entry("a");
    const b = entry("b");
    const c = entry("c");
    const updatedC = { ...c, prompt: "updated" };
    const snapshots = yield* projectPromptStashEntries(
      Stream.make<ReadonlyArray<PromptStashEvent>>(
        { _tag: "reset" },
        { _tag: "upsert", entry: a },
        { _tag: "upsert", entry: b },
        { _tag: "ready" },
        { _tag: "upsert", entry: c, evictedId: b.id },
        { _tag: "upsert", entry: updatedC },
        { _tag: "reset" },
        { _tag: "upsert", entry: updatedC },
        { _tag: "upsert", entry: a },
        { _tag: "ready" },
        { _tag: "remove", id: a.id },
      ),
    ).pipe(Stream.runCollect);
    expect(snapshots).toEqual([
      null,
      [a, b],
      [c, a],
      [updatedC, a],
      null,
      [updatedC, a],
      [updatedC],
    ]);
  }),
);
