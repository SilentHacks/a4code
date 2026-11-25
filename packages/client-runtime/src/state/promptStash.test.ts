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

it.effect("publishes complete snapshots and replaces them on reconnect", () =>
  Effect.gen(function* () {
    const snapshots = yield* projectPromptStashEntries(
      Stream.make<ReadonlyArray<PromptStashEvent>>(
        { _tag: "reset" },
        { _tag: "upsert", entry: entry("a") },
        { _tag: "upsert", entry: entry("b") },
        { _tag: "ready" },
        { _tag: "upsert", entry: entry("c"), evictedId: "a" },
        { _tag: "remove", id: "b" },
        { _tag: "reset" },
        { _tag: "upsert", entry: entry("d") },
        { _tag: "ready" },
      ),
    ).pipe(Stream.runCollect);
    expect(snapshots.map((entries) => entries?.map(({ id }) => id) ?? null)).toEqual([
      null,
      ["a", "b"],
      ["b", "c"],
      ["c"],
      null,
      ["d"],
    ]);
  }),
);
