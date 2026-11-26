import {
  MAX_STASH_ENTRIES,
  PromptStashEntry,
  PromptStashError,
  type PromptStashEvent,
  type PromptStashTakeInput,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import type * as SqlError from "effect/sql/SqlError";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";

const MAX_ENTRY_JSON_BYTES = 4 * 1024 * 1024;
const CLAIM_TTL_MS = 60_000;
const EntryJson = Schema.fromJsonString(PromptStashEntry);
const encodeEntry = Schema.encodeEffect(EntryJson);
const decodeEntry = Schema.decodeEffect(EntryJson);

type StoreFailure = SqlError.SqlError | Schema.SchemaError;
type EntryRow = { readonly entry_json: string };

export class PromptStash extends Context.Service<
  PromptStash,
  {
    readonly subscribe: () => Stream.Stream<PromptStashEvent, StoreFailure>;
    readonly save: (
      entry: PromptStashEntry,
    ) => Effect.Effect<
      { readonly evicted: PromptStashEntry | null },
      StoreFailure | PromptStashError
    >;
    readonly take: (
      input: PromptStashTakeInput,
    ) => Effect.Effect<{ readonly entry: PromptStashEntry | null }, StoreFailure>;
  }
>()("t3/promptStash/PromptStash") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const identity = yield* ServerEnvironment.ServerEnvironmentIdentity;
  const lock = (yield* Semaphore.make(1)).withPermits(1);
  const changes = yield* PubSub.sliding<{ sequence: number; event: PromptStashEvent }>(8);
  let sequence = 0;

  const save = Effect.fn("PromptStash.save")(
    function* (input: PromptStashEntry) {
      const saved = yield* sql.withTransaction(
        Effect.gen(function* () {
          const existing = yield* sql`SELECT 1 FROM prompt_stash WHERE id = ${input.id}`;
          if (existing.length > 0) return null;

          if (input.files?.length) {
            const environmentId = yield* identity.getEnvironmentId;
            if (input.files.some((file) => file.environmentId !== environmentId)) {
              return yield* new PromptStashError({ reason: "wrong-environment" });
            }
          }
          const entry = {
            ...input,
            createdAt: DateTime.formatIso(yield* DateTime.now),
          };
          const json = yield* encodeEntry(entry);
          if (Buffer.byteLength(json, "utf8") > MAX_ENTRY_JSON_BYTES) {
            return yield* new PromptStashError({ reason: "too-large" });
          }
          const full =
            yield* sql`SELECT 1 FROM prompt_stash LIMIT 1 OFFSET ${MAX_STASH_ENTRIES - 1}`;
          if (full.length > 0) return yield* new PromptStashError({ reason: "full" });
          yield* sql`INSERT INTO prompt_stash (id, entry_json) VALUES (${entry.id}, ${json})`;
          return entry;
        }),
      );
      if (saved) {
        yield* PubSub.publish(changes, {
          sequence: ++sequence,
          event: { _tag: "upsert", entry: saved },
        });
      }
      return { evicted: null };
    },
    // A disconnected caller must not interrupt between commit and publication.
    Effect.uninterruptible,
    lock,
  );

  const take = Effect.fn("PromptStash.take")(
    function* (input: PromptStashTakeInput) {
      const { id, _tag } = input;
      const entry = yield* sql.withTransaction(
        Effect.gen(function* () {
          if (_tag === "release") {
            yield* sql`
              UPDATE prompt_stash SET claim_id = NULL, claim_expires_at = NULL
              WHERE id = ${id} AND claim_id = ${input.claimId}
            `;
            return null;
          }
          const now = yield* Clock.currentTimeMillis;
          let rows: ReadonlyArray<EntryRow>;
          switch (_tag) {
            case "claim":
              rows = yield* sql<EntryRow>`
                UPDATE prompt_stash SET
                  claim_id = ${input.claimId},
                  claim_expires_at = CASE WHEN claim_expires_at > ${now}
                    THEN claim_expires_at ELSE ${now + CLAIM_TTL_MS} END
                WHERE id = ${id} AND (
                  claim_expires_at IS NULL OR claim_expires_at <= ${now} OR claim_id = ${input.claimId}
                ) RETURNING entry_json
              `;
              break;
            case "complete":
              rows = yield* sql<EntryRow>`
                DELETE FROM prompt_stash
                WHERE id = ${id} AND claim_id = ${input.claimId} AND claim_expires_at > ${now}
                RETURNING entry_json
              `;
              break;
            case "delete":
              rows = yield* sql<EntryRow>`
                DELETE FROM prompt_stash
                WHERE id = ${id} AND (claim_expires_at IS NULL OR claim_expires_at <= ${now})
                RETURNING entry_json
              `;
              break;
          }
          const [row] = rows;
          return row ? yield* decodeEntry(row.entry_json) : null;
        }),
      );
      if (entry && (_tag === "complete" || _tag === "delete")) {
        yield* PubSub.publish(changes, { sequence: ++sequence, event: { _tag: "remove", id } });
      }
      return { entry };
    },
    Effect.uninterruptible,
    lock,
  );

  const readSnapshot = Effect.fn("PromptStash.readSnapshot")(function* () {
    const rows = yield* sql<EntryRow>`SELECT entry_json FROM prompt_stash ORDER BY position DESC`;
    return { rows, sequence };
  }, lock);

  return PromptStash.of({
    save,
    take,
    subscribe: () =>
      Stream.unwrap(
        Effect.gen(function* () {
          // Buffer before reading the snapshot. Deltas already in the snapshot are skipped.
          const subscription = yield* lock(PubSub.subscribe(changes));
          let last = 0;
          return Stream.concat(Stream.make(null), Stream.fromSubscription(subscription)).pipe(
            Stream.flatMap((change) => {
              if (change && change.sequence <= last) return Stream.empty;
              if (change && change.sequence === last + 1) {
                last = change.sequence;
                return Stream.succeed(change.event);
              }
              // A slow subscriber can miss deltas. Rebase it instead of applying a partial history.
              return Stream.unwrap(
                Effect.map(readSnapshot(), (snapshot) => {
                  last = snapshot.sequence;
                  return Stream.concat(
                    Stream.succeed<PromptStashEvent>({ _tag: "reset" }),
                    Stream.fromIterable(snapshot.rows).pipe(
                      Stream.mapEffect(({ entry_json }) =>
                        Effect.map(decodeEntry(entry_json), (entry): PromptStashEvent => ({
                          _tag: "upsert",
                          entry,
                        })),
                      ),
                    ),
                  ).pipe(Stream.concat(Stream.succeed<PromptStashEvent>({ _tag: "ready" })));
                }),
              );
            }),
            // RpcServer encodes one WebSocket Chunk frame per stream chunk.
            Stream.rechunk(1),
          );
        }),
      ),
  });
});

export const layer = Layer.effect(PromptStash, make);
