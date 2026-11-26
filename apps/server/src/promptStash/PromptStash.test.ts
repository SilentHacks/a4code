import {
  ComposerContextId,
  EnvironmentId,
  MAX_STASH_ENTRIES,
  type PromptStashEntry,
} from "@a4code/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as PromptStash from "./PromptStash.ts";

const environmentId = EnvironmentId.make("test-environment");
const layer = PromptStash.layer.pipe(
  Layer.provide(
    Layer.mergeAll(
      SqlitePersistence.layerMemory,
      Layer.succeed(ServerEnvironment.ServerEnvironmentIdentity, {
        getEnvironmentId: Effect.succeed(environmentId),
      }),
    ),
  ),
);

const draft = (id: string): PromptStashEntry => ({
  id,
  createdAt: "2000-01-01T00:00:00.000Z",
  prompt: "draft text",
  attachments: [],
  droppedImageNames: [],
});

it.effect(
  "streams stash saves, evictions, and a single removal after completing a recoverable claim",
  () =>
    Effect.gen(function* () {
      const stash = yield* PromptStash.PromptStash;
      const now = "2026-01-01T00:00:00.000Z";
      yield* TestClock.setTime(Date.parse(now));
      const file = {
        id: "file",
        name: "note.txt",
        mimeType: "text/plain",
        sizeBytes: 5,
        attachmentId: "note-file",
        environmentId,
        source: { _tag: "pasted-text" },
      } as const;
      const rich: PromptStashEntry = {
        ...draft("first"),
        attachments: [
          {
            id: "image",
            name: "shot.png",
            mimeType: "image/png",
            sizeBytes: 3,
            dataUrl: "data:image/png;base64,YWJj",
            source: {
              kind: "snap-shot",
              capturedAt: now,
              appName: "Editor",
              windowTitle: "Draft",
            },
          },
        ],
        files: [file],
        unreadableImageNames: ["unreadable.png"],
        droppedImageNames: ["oversized.png"],
        records: [
          {
            version: 1,
            kind: "mention",
            contextId: ComposerContextId.make("some-file"),
            label: "some file",
            path: "src/example.ts",
          },
        ],
      };
      const stored = { ...rich, createdAt: now };
      assert.propertyVal(
        yield* stash
          .save({
            ...rich,
            files: [{ ...file, environmentId: EnvironmentId.make("other-environment") }],
          })
          .pipe(Effect.flip),
        "reason",
        "wrong-environment",
      );
      assert.propertyVal(
        yield* stash.save({ ...rich, prompt: "界".repeat(1_500_000) }).pipe(Effect.flip),
        "reason",
        "too-large",
      );
      assert.propertyVal(
        yield* stash
          .save({
            ...rich,
            attachments: [{ ...rich.attachments[0]!, dataUrl: "https://example.com/shot.png" }],
          })
          .pipe(Effect.flip),
        "_tag",
        "SchemaError",
      );
      assert.deepEqual(yield* stash.save(rich), { evicted: null });
      for (let i = 1; i < MAX_STASH_ENTRIES; i++) {
        assert.deepEqual(yield* stash.save(draft(`entry-${i}`)), { evicted: null });
      }

      const pull = yield* Stream.toPull(stash.subscribe());
      assert.deepEqual(yield* pull, [{ _tag: "reset" }]);
      // Save during initial replay: the reset snapshot must finish before the live delta.
      assert.deepEqual(yield* stash.save({ ...rich, prompt: "stale retry" }), { evicted: null });
      assert.propertyVal(
        yield* stash.save(draft("replacement")).pipe(Effect.flip),
        "reason",
        "full",
      );
      assert.deepEqual(yield* stash.take({ _tag: "delete", id: stored.id }), { entry: stored });
      assert.deepEqual(yield* stash.save(draft("replacement")), { evicted: null });
      for (let i = MAX_STASH_ENTRIES - 1; i > 0; i--) {
        assert.deepEqual(yield* pull, [
          { _tag: "upsert", entry: { ...draft(`entry-${i}`), createdAt: now } },
        ]);
      }
      assert.deepEqual(yield* pull, [{ _tag: "upsert", entry: stored }]);
      assert.deepEqual(yield* pull, [{ _tag: "ready" }]);
      const replacement = { ...draft("replacement"), createdAt: now };
      assert.deepEqual(yield* pull, [{ _tag: "remove", id: stored.id }]);
      assert.deepEqual(yield* pull, [{ _tag: "upsert", entry: replacement }]);
      assert.deepEqual(yield* stash.take({ _tag: "delete", id: stored.id }), { entry: null });

      const claimA = { id: replacement.id, claimId: "claim-a" };
      const claimB = { id: replacement.id, claimId: "claim-b" };
      const claims = [claimA, claimB] as const;
      const [a, b] = yield* Effect.all(
        [stash.take({ _tag: "claim", ...claimA }), stash.take({ _tag: "claim", ...claimB })],
        { concurrency: "unbounded" },
      );
      assert.deepEqual(a.entry ? [a.entry, b.entry] : [b.entry, a.entry], [replacement, null]);
      const winner = claims[a.entry ? 0 : 1];
      const loser = claims[a.entry ? 1 : 0];
      assert.deepEqual(yield* stash.take({ _tag: "delete", id: replacement.id }), { entry: null });
      assert.deepEqual(yield* stash.take({ _tag: "complete", ...loser }), { entry: null });
      assert.deepEqual(yield* stash.take({ _tag: "release", ...loser }), { entry: null });
      yield* TestClock.adjust("59 seconds");
      assert.deepEqual(yield* stash.take({ _tag: "claim", ...winner }), { entry: replacement });
      assert.deepEqual(yield* stash.take({ _tag: "claim", ...loser }), { entry: null });
      yield* TestClock.adjust("1 second");
      assert.deepEqual(yield* stash.take({ _tag: "complete", ...winner }), { entry: null });
      assert.deepEqual(yield* stash.take({ _tag: "claim", ...loser }), { entry: replacement });
      assert.deepEqual(yield* stash.take({ _tag: "release", ...winner }), { entry: null });
      assert.deepEqual(yield* stash.take({ _tag: "claim", ...winner }), { entry: null });
      assert.deepEqual(yield* stash.take({ _tag: "release", ...loser }), { entry: null });

      const retry = { id: replacement.id, claimId: "retry" };
      assert.deepEqual(yield* stash.take({ _tag: "claim", ...retry }), { entry: replacement });
      const completes = yield* Effect.all(
        [stash.take({ _tag: "complete", ...retry }), stash.take({ _tag: "complete", ...retry })],
        { concurrency: "unbounded" },
      );
      assert.deepEqual(
        completes.flatMap(({ entry }) => (entry ? [entry] : [])),
        [replacement],
      );
      assert.deepEqual(yield* pull, [{ _tag: "remove", id: replacement.id }]);
      const afterRemoval = draft("after-removal");
      yield* stash.save(afterRemoval);
      assert.deepEqual(yield* pull, [
        { _tag: "upsert", entry: { ...afterRemoval, createdAt: "2026-01-01T00:01:00.000Z" } },
      ]);
    }).pipe(Effect.scoped, Effect.provide(layer)),
);

it.effect("rebases a subscriber that falls behind the bounded live backlog", () =>
  Effect.gen(function* () {
    const stash = yield* PromptStash.PromptStash;
    const pull = yield* Stream.toPull(stash.subscribe());
    assert.deepEqual(yield* pull, [{ _tag: "reset" }]);
    assert.deepEqual(yield* pull, [{ _tag: "ready" }]);

    for (let i = 0; i < MAX_STASH_ENTRIES; i++) {
      yield* stash.save(draft(`entry-${i}`));
    }
    assert.deepEqual(yield* pull, [{ _tag: "reset" }]);
    for (let i = MAX_STASH_ENTRIES - 1; i >= 0; i--) {
      const [event] = yield* pull;
      assert.equal(event._tag === "upsert" ? event.entry.id : null, `entry-${i}`);
    }
    assert.deepEqual(yield* pull, [{ _tag: "ready" }]);
    yield* stash.take({ _tag: "delete", id: "entry-0" });
    assert.deepEqual(yield* pull, [{ _tag: "remove", id: "entry-0" }]);
  }).pipe(Effect.scoped, Effect.provide(layer)),
);
